const { app, BrowserWindow, ipcMain, Menu, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const net = require('net');
const os = require('os');
const { spawn, exec } = require('child_process');
const axios = require('axios');
const { Client } = require('ssh2');
const WebSocket = require('ws');
const dgram = require('dgram');
const crypto = require('crypto');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');

const ffmpegPath = ffmpeg.path;

let mainWindow = null;
const streamManager = {};
const usedPorts = new Set();
const BASE_PORT = 9001;
const dataPath = path.join(app.getPath('userData'), 'cameras.json');
let sshWindows = {};
let fileManagerConnections = {};

function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err) => resolve(err.code === 'EADDRINUSE'));
        server.once('listening', () => server.close(() => resolve(false)));
        server.listen(port);
    });
}

async function getAndReserveFreePort() {
    let port = BASE_PORT;
    const MAX_PORTS_TO_CHECK = 100;
    for (let i = 0; i < MAX_PORTS_TO_CHECK; i++) {
        const currentPort = port + i;
        if (usedPorts.has(currentPort) || await isPortInUse(currentPort)) {
            continue;
        }
        usedPorts.add(currentPort);
        console.log(`[PORT] Порт ${currentPort} зарезервирован.`);
        return currentPort;
    }
    return null;
}

function releasePort(port) {
    if (port) {
        console.log(`[PORT] Порт ${port} освобожден.`);
        usedPorts.delete(port);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    mainWindow.loadFile('index.html');
}

function createFileManagerWindow(camera) {
    const fileManagerWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        title: `Файловый менеджер: ${camera.name}`,
        webPreferences: {
            preload: path.join(__dirname, 'fm-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });

    fileManagerWindow.loadFile('file-manager.html', { query: { camera: JSON.stringify(camera) } });

    fileManagerWindow.on('closed', () => {
        const conn = fileManagerConnections[camera.id];
        if (conn) {
            conn.end();
            delete fileManagerConnections[camera.id];
            console.log(`[SSH] Сессия файлового менеджера для ${camera.ip} закрыта.`);
        }
    });

    return fileManagerWindow;
}

ipcMain.on('show-camera-context-menu', (event, cameraId) => {
    const template = [
        { label: '🗂️  Файловый менеджер', click: () => { event.sender.send('context-menu-command', { command: 'files', cameraId }); } },
        { label: '💻  SSH Терминал', click: () => { event.sender.send('context-menu-command', { command: 'ssh', cameraId }); } },
        { label: '⚙️  Настройки', click: () => { event.sender.send('context-menu-command', { command: 'settings', cameraId }); } },
        { label: '✏️  Редактировать', click: () => { event.sender.send('context-menu-command', { command: 'edit', cameraId }); } },
        { type: 'separator' },
        { label: '🗑️  Удалить', click: () => { event.sender.send('context-menu-command', { command: 'delete', cameraId }); } },
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
});

ipcMain.handle('kill-all-ffmpeg', () => {
    return new Promise(resolve => {
        const ffmpegProcessName = path.basename(ffmpegPath);
        const command = process.platform === 'win32' ? `taskkill /IM ${ffmpegProcessName} /F` : `pkill -f ${ffmpegProcessName}`;
        
        exec(command, (err, stdout, stderr) => {
            Object.values(streamManager).forEach(s => s.wss?.close());
            usedPorts.clear();
            Object.keys(streamManager).forEach(key => delete streamManager[key]);
            if (err && !stderr.includes('не найден') && !stderr.includes('No matching processes') && !stderr.includes('was not found')) {
                resolve({ success: false, message: `Ошибка: ${stderr}` });
            } else {
                resolve({ success: true, message: "Все 'зависшие' потоки были успешно сброшены." });
            }
        });
    });
});

ipcMain.handle('start-video-stream', async (event, { credentials, streamId }) => {
    const uniqueStreamIdentifier = `${credentials.id}_${streamId}`;
    if (streamManager[uniqueStreamIdentifier]) {
        return { success: true, wsPort: streamManager[uniqueStreamIdentifier].port };
    }
    const port = credentials.port || '554';
    const streamUrl = `rtsp://${credentials.username}:${credentials.password}@${credentials.ip}:${port}/stream${streamId}`;
    const wsPort = await getAndReserveFreePort();
    if (wsPort === null) {
        return { success: false, error: 'Не удалось найти свободный порт.' };
    }
    const wss = new WebSocket.Server({ port: wsPort });
    wss.on('connection', (ws) => console.log(`[WSS] Клиент подключился к порту ${wsPort}`));
    
    const ffmpegArgs = [
        '-loglevel', 'error',
        '-rtsp_transport', 'tcp',
        '-i', streamUrl,
        '-progress', 'pipe:2', 
        '-f', 'mpegts',
        '-codec:v', 'mpeg1video',
        '-q:v', '4',
        '-s', streamId === 1 ? '640x360' : '1280x720',
        '-r', '25',
        '-codec:a', 'mp2',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '1',
        '-threads', '0',
        '-' 
    ];

    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, { detached: false, windowsHide: true });
    
    ffmpegProcess.stdout.on('data', (data) => {
        wss.clients.forEach((client) => { 
            if (client.readyState === WebSocket.OPEN) client.send(data); 
        });
    });

    let statsBuffer = '';
    ffmpegProcess.stderr.on('data', (data) => {
        statsBuffer += data.toString();
        const statsBlocks = statsBuffer.split('progress=');
        if (statsBlocks.length > 1) {
            for (let i = 0; i < statsBlocks.length - 1; i++) {
                const block = statsBlocks[i];
                if (!block.trim()) continue;

                const lines = block.trim().split('\n');
                const stats = {};
                lines.forEach(line => {
                    const [key, value] = line.split('=');
                    if (key && value) {
                        stats[key.trim()] = value.trim();
                    }
                });

                if (mainWindow && !mainWindow.isDestroyed() && (stats.fps || stats.bitrate)) {
                    mainWindow.webContents.send('stream-stats', { 
                        uniqueStreamIdentifier, 
                        fps: parseFloat(stats.fps) || 0, 
                        bitrate: parseFloat(stats.bitrate) || 0 
                    });
                }
            }
            statsBuffer = statsBlocks[statsBlocks.length - 1];
        }
    });

    ffmpegProcess.on('close', (code) => {
        console.warn(`[FFMPEG] Процесс ${uniqueStreamIdentifier} завершился с кодом ${code}`);
        if (streamManager[uniqueStreamIdentifier]) {
            streamManager[uniqueStreamIdentifier].wss.close();
            releasePort(wsPort);
            delete streamManager[uniqueStreamIdentifier];
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('stream-died', uniqueStreamIdentifier);
        }
    });
    streamManager[uniqueStreamIdentifier] = { process: ffmpegProcess, wss, port: wsPort };
    return { success: true, wsPort };
});

ipcMain.handle('stop-video-stream', (event, uniqueStreamIdentifier) => {
    const stream = streamManager[uniqueStreamIdentifier];
    if (stream) {
        console.log(`[STREAM] Ручная остановка потока ${uniqueStreamIdentifier}`);
        stream.process.removeAllListeners();
        stream.process.kill('SIGKILL');
        stream.wss.close();
        releasePort(stream.port);
        delete streamManager[uniqueStreamIdentifier];
        return { success: true };
    }
    return { success: false, error: "Stream not found" };
});

ipcMain.handle('save-cameras', async (event, cameras) => {
    try { await fs.writeFile(dataPath, JSON.stringify(cameras, null, 2)); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('load-cameras', async () => {
    try { await fs.access(dataPath); const data = await fs.readFile(dataPath, 'utf-8'); return JSON.parse(data); }
    catch (e) { return []; }
});

const getAxiosJsonConfig = (credentials) => ({
    auth: { username: credentials.username, password: credentials.password },
    timeout: 7000,
});

const getAxiosCgiConfig = (credentials) => ({
    auth: { username: credentials.username, password: credentials.password },
    timeout: 30000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});

ipcMain.handle('get-camera-settings', async (event, credentials) => {
    try {
        const response = await axios.get(`http://${credentials.ip}/api/v1/config.json`, getAxiosJsonConfig(credentials));
        return response.data;
    } catch (error) {
        return { error: `Не удалось получить настройки: ${error.message}` };
    }
});

ipcMain.handle('set-camera-settings', async (event, { credentials, settingsData }) => {
    try {
        const url = `http://${credentials.ip}/cgi-bin/mj-settings.cgi`;
        settingsData.action = 'update';
        const formData = new URLSearchParams(settingsData).toString();
        
        const config = getAxiosCgiConfig(credentials);
        config.validateStatus = function (status) {
            return (status >= 200 && status < 300) || status === 303;
        };

        await axios.post(url, formData, config);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.response?.data?.error || error.message };
    }
});

ipcMain.handle('restart-majestic', async (event, credentials) => {
    try {
        const url = `http://${credentials.ip}/cgi-bin/mj-settings.cgi`;
        const formData = new URLSearchParams({ action: 'restart' }).toString();
        
        const config = getAxiosCgiConfig(credentials);
        config.validateStatus = function (status) {
            return (status >= 200 && status < 300) || status === 303;
        };
        
        await axios.post(url, formData, config);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.response?.data?.error || error.message };
    }
});

ipcMain.handle('get-camera-pulse', async (event, credentials) => {
    try {
        const response = await axios.get(`http://${credentials.ip}/api/v1/soc`, { ...getAxiosJsonConfig(credentials), timeout: 3000 });
        return { success: true, soc_temp: response.data.temp_c ? `${response.data.temp_c.toFixed(1)}°C` : null };
    } catch (error) {
        return { error: 'Camera is offline or not responding' };
    }
});

ipcMain.handle('get-camera-info', async (event, credentials) => {
    try {
        const response = await axios.get(`http://${credentials.ip}/api/v1/info`, { timeout: 3000, auth: { username: credentials.username, password: credentials.password } });
        return { success: true, ...response.data };
    } catch (error) {
        return { error: 'Camera is offline or not responding' };
    }
});

// --- Обработчики файлового менеджера ---

ipcMain.handle('open-file-manager', (event, camera) => {
    createFileManagerWindow(camera);
});

ipcMain.handle('scp-connect', (event, camera) => {
    return new Promise((resolve, reject) => {
        if (fileManagerConnections[camera.id] && fileManagerConnections[camera.id].readable) {
             return resolve({ success: true });
        }
        if (fileManagerConnections[camera.id]) {
            delete fileManagerConnections[camera.id];
        }
        const conn = new Client();
        const win = BrowserWindow.fromWebContents(event.sender);
        const handleClose = () => {
            console.log(`[SSH] Соединение для файлового менеджера ${camera.id} закрыто.`);
            delete fileManagerConnections[camera.id];
            if (win && !win.isDestroyed()) {
                win.webContents.send('scp-close');
            }
        };
        conn.on('ready', () => {
            fileManagerConnections[camera.id] = conn;
            console.log(`[SSH] Сессия для файлового менеджера ${camera.ip} открыта.`);
            resolve({ success: true });
        }).on('error', (err) => {
            reject(new Error(`Connection Error: ${err.message}`));
            handleClose();
        }).on('close', handleClose)
          .connect({
            host: camera.ip,
            port: 22,
            username: camera.username,
            password: camera.password,
            readyTimeout: 10000
        });
    });
});

ipcMain.handle('scp-list', async (event, { cameraId, path: dirPath }) => {
    const conn = fileManagerConnections[cameraId];
    if (!conn) throw new Error("SSH сессия не найдена или неактивна.");

    return new Promise((resolve, reject) => {
        conn.exec(`ls -lA "${dirPath}"`, (err, stream) => {
            if (err) return reject(err);
            let data = '';
            let errorData = '';
            stream.on('data', (chunk) => data += chunk.toString('utf-8'));
            stream.stderr.on('data', (chunk) => errorData += chunk.toString('utf-8'));
            stream.on('close', (code, signal) => {
                if (code !== 0) {
                   return reject(new Error(errorData || `Команда 'ls' завершилась с кодом ${code}.`));
                }
                const files = parseLsOutput(data);
                resolve(files);
            }).on('error', (err) => reject(err));
        });
    });
});

function parseLsOutput(output) {
    return output.split('\n')
        .filter(line => line.length > 0 && !line.startsWith('total'))
        .map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 9) return null;
            const permissions = parts[0];
            const size = parseInt(parts[4], 10);
            const name = parts.slice(8).join(' ');
            return {
                name: name,
                isDirectory: permissions.startsWith('d'),
                size: isNaN(size) ? 0 : size,
            };
        })
        .filter(Boolean);
}

ipcMain.handle('scp-download', async (event, { cameraId, remotePath }) => {
    const conn = fileManagerConnections[cameraId];
    if (!conn) throw new Error("SSH сессия не найдена.");

    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: path.basename(remotePath)
    });

    if (canceled || !filePath) return { success: false, canceled: true };
    
    return new Promise((resolve, reject) => {
        conn.scp((err, scp) => {
            if (err) return reject(err);
            scp.pull(remotePath, filePath, (err) => {
                if (err) return reject(err);
                resolve({ success: true });
            });
        });
    });
});

ipcMain.handle('scp-upload', async (event, { cameraId, remotePath: remoteDir }) => {
    const conn = fileManagerConnections[cameraId];
    if (!conn) throw new Error("SSH сессия не найдена.");

    const win = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Выберите файл для загрузки'
    });

    if (canceled || filePaths.length === 0) return { success: false, canceled: true };
    
    const localPath = filePaths[0];
    const finalRemotePath = path.posix.join(remoteDir, path.basename(localPath));

    return new Promise((resolve, reject) => {
         conn.scp((err, scp) => {
            if (err) return reject(err);
            scp.push(localPath, finalRemotePath, (err) => {
                if (err) return reject(err);
                resolve({ success: true });
            });
        });
    });
});

const executeRemoteCommand = (cameraId, command) => {
    return new Promise((resolve, reject) => {
        const conn = fileManagerConnections[cameraId];
        if (!conn) return reject(new Error("SSH сессия не найдена."));

        conn.exec(command, (err, stream) => {
            if (err) return reject(err);
            let stderr = '';
            stream.on('close', (code) => {
                if (code !== 0) {
                    return reject(new Error(stderr || `Команда завершилась с кодом ${code}`));
                }
                resolve({ success: true });
            }).stderr.on('data', (data) => stderr += data.toString('utf-8'));
        });
    });
}

ipcMain.handle('scp-mkdir', async (event, { cameraId, path }) => {
    return executeRemoteCommand(cameraId, `mkdir "${path}"`);
});

ipcMain.handle('scp-delete-file', async (event, { cameraId, path }) => {
    return executeRemoteCommand(cameraId, `rm "${path}"`);
});

ipcMain.handle('scp-delete-dir', async (event, { cameraId, path }) => {
    return executeRemoteCommand(cameraId, `rmdir "${path}"`);
});

ipcMain.handle('get-local-disk-list', async () => {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            exec('wmic logicaldisk get name', (err, stdout, stderr) => {
                if (err || stderr) return resolve([os.homedir()]);
                const disks = stdout.split('\n').slice(1).map(line => line.trim()).filter(line => line.length > 0).map(disk => `${disk}\\`);
                resolve(disks.length > 0 ? disks : [os.homedir()]);
            });
        } else {
            resolve(['/']);
        }
    });
});

ipcMain.handle('list-local-files', async (event, dirPath) => {
    try {
        const fileNames = await fs.readdir(dirPath, { withFileTypes: true });
        const files = await Promise.all(
            fileNames.map(async (dirent) => {
                try {
                    const fullPath = path.join(dirPath, dirent.name);
                    const stats = await fs.stat(fullPath);
                    return { name: dirent.name, isDirectory: dirent.isDirectory(), size: stats.size };
                } catch {
                    return null;
                }
            })
        );
        return files.filter(Boolean);
    } catch (error) {
        throw new Error(`Ошибка чтения локальной директории: ${error.message}`);
    }
});

ipcMain.handle('clipboardRead', () => {
    return clipboard.readText();
});
ipcMain.handle('clipboardWrite', (event, text) => {
    clipboard.writeText(text);
});

ipcMain.handle('open-ssh-terminal', (event, camera) => {
    if (sshWindows[camera.id]) {
        if (!sshWindows[camera.id].isDestroyed()) {
            sshWindows[camera.id].win.focus();
        }
        return;
    }
    const sshWindow = new BrowserWindow({
        width: 800,
        height: 600,
        title: `SSH-Терминал: ${camera.name}`,
        webPreferences: {
            preload: path.join(__dirname, 'terminal-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });
    sshWindow.loadFile('terminal.html', { query: { camera: JSON.stringify(camera) } });
    
    const conn = new Client();
    sshWindows[camera.id] = { win: sshWindow, conn };
    conn.on('ready', () => { if (!sshWindow.isDestroyed()) { sshWindow.webContents.send('ssh-status', { connected: true }); } conn.shell((err, stream) => { if (err) { if (!sshWindow.isDestroyed()) { sshWindow.webContents.send('ssh-data', `\r\n*** SSH SHELL ERROR: ${err.message} ***\r\n`); } return; } stream.on('data', (data) => { if (!sshWindow.isDestroyed()) { sshWindow.webContents.send('ssh-data', data.toString('utf8')); } }); ipcMain.on(`ssh-input-${camera.id}`, (event, data) => stream.write(data)); stream.on('close', () => conn.end()); }); }).on('error', (err) => { if (!sshWindow.isDestroyed()) { sshWindow.webContents.send('ssh-data', `\r\n*** SSH CONNECTION ERROR: ${err.message} ***\r\n`); } }).on('close', () => { if (!sshWindow.isDestroyed()) { sshWindow.webContents.send('ssh-status', { connected: false, message: '\r\nСоединение закрыто.' }); } ipcMain.removeAllListeners(`ssh-input-${camera.id}`); }).connect({ host: camera.ip, port: 22, username: camera.username, password: camera.password });
    sshWindow.on('closed', () => { conn.end(); delete sshWindows[camera.id]; });
});

app.whenReady().then(createWindow);
app.on('will-quit', () => { const command = process.platform === 'win32' ? `taskkill /IM ${path.basename(ffmpegPath)} /F` : `pkill -f ${path.basename(ffmpegPath)}`; exec(command); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { app.quit(); } });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { createWindow(); } });