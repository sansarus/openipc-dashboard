const { app, BrowserWindow, ipcMain, Menu, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs'); // Для синхронных проверок
const fsPromises = require('fs').promises; // Для асинхронных операций
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

function getDataPath() {
    // В режиме разработки используем стандартный путь, чтобы не засорять папку проекта
    if (!app.isPackaged) {
        return app.getPath('userData');
    }

    // В упакованном приложении проверяем наличие файла-маркера
    const portableMarkerPath = path.join(path.dirname(app.getPath('exe')), 'portable.txt');
    if (fs.existsSync(portableMarkerPath)) {
        // Портативный режим: используем папку с exe
        return path.dirname(app.getPath('exe'));
    } else {
        // Стандартный режим: используем AppData/итд
        return app.getPath('userData');
    }
}

const dataPathRoot = getDataPath();
console.log(`[Config] Data path is: ${dataPathRoot}`);

const configPath = path.join(dataPathRoot, 'config.json');
const oldCamerasPath = path.join(dataPathRoot, 'cameras.json');
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
        console.log(`[PORT] Port ${currentPort} reserved.`);
        return currentPort;
    }
    return null;
}

function releasePort(port) {
    if (port) {
        console.log(`[PORT] Port ${port} released.`);
        usedPorts.delete(port);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        title: "OpenIPC VMS",
        webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    // mainWindow.setMenu(null);
    mainWindow.loadFile('index.html');
}

function createFileManagerWindow(camera) {
    const fileManagerWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        title: `File Manager: ${camera.name}`,
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
    wss.on('connection', (ws) => console.log(`[WSS] Client connected to port ${wsPort}`));
    
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
        console.warn(`[FFMPEG] Process ${uniqueStreamIdentifier} exited with code ${code}`);
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
        console.log(`[STREAM] Stopping stream ${uniqueStreamIdentifier} manually.`);
        stream.process.removeAllListeners();
        stream.process.kill('SIGKILL');
        stream.wss.close();
        releasePort(stream.port);
        delete streamManager[uniqueStreamIdentifier];
        return { success: true };
    }
    return { success: false, error: "Stream not found" };
});

ipcMain.handle('save-configuration', async (event, config) => {
    try {
        await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('load-configuration', async () => {
    const defaultConfig = {
        cameras: [],
        layout: { cols: 2, rows: 2 },
        gridState: [null, null, null, null]
    };
    try {
        await fsPromises.access(configPath);
        const data = await fsPromises.readFile(configPath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        try {
            await fsPromises.access(oldCamerasPath);
            console.log('Found old cameras.json, attempting migration...');
            const oldData = await fsPromises.readFile(oldCamerasPath, 'utf-8');
            const oldCameras = JSON.parse(oldData);
            const newConfig = { ...defaultConfig, cameras: oldCameras };
            await fsPromises.writeFile(configPath, JSON.stringify(newConfig, null, 2));
            await fsPromises.rename(oldCamerasPath, `${oldCamerasPath}.bak`);
            console.log('Migration successful: cameras.json has been migrated to config.json');
            return newConfig;
        } catch (migrationError) {
            console.log('No existing config found, returning default.');
            return defaultConfig;
        }
    }
});

ipcMain.handle('get-system-stats', () => {
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;
    for(const cpu of cpus) {
        for(let type in cpu.times) {
            totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
    }
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 * (1 - idle / total);

    return {
        cpu: usage.toFixed(0),
        ram: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0),
    };
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
        config.validateStatus = (status) => (status >= 200 && status < 300) || status === 303;
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
        config.validateStatus = (status) => (status >= 200 && status < 300) || status === 303;
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

ipcMain.handle('open-file-manager', (event, camera) => createFileManagerWindow(camera));

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
            delete fileManagerConnections[camera.id];
            if (win && !win.isDestroyed()) win.webContents.send('scp-close');
        };
        conn.on('ready', () => {
            fileManagerConnections[camera.id] = conn;
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
    if (!conn) throw new Error("SSH session not found or inactive.");
    return new Promise((resolve, reject) => {
        conn.exec(`ls -lA "${dirPath}"`, (err, stream) => {
            if (err) return reject(err);
            let data = '', errorData = '';
            stream.on('data', (chunk) => data += chunk.toString('utf-8'));
            stream.stderr.on('data', (chunk) => errorData += chunk.toString('utf-8'));
            stream.on('close', (code) => {
                if (code !== 0) reject(new Error(errorData || `Command 'ls' exited with code ${code}.`));
                else resolve(parseLsOutput(data));
            }).on('error', reject);
        });
    });
});

function parseLsOutput(output) {
    return output.split('\n')
        .filter(line => line.length > 0 && !line.startsWith('total'))
        .map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 9) return null;
            return {
                name: parts.slice(8).join(' '),
                isDirectory: parts[0].startsWith('d'),
                size: parseInt(parts[4], 10) || 0,
            };
        }).filter(Boolean);
}

ipcMain.handle('scp-download', async (event, { cameraId, remotePath }) => {
    const conn = fileManagerConnections[cameraId];
    if (!conn) throw new Error("SSH session not found.");
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
        defaultPath: path.basename(remotePath)
    });
    if (canceled || !filePath) return { success: false, canceled: true };
    return new Promise((resolve, reject) => {
        conn.scp((err, scp) => {
            if (err) return reject(err);
            scp.pull(remotePath, filePath, (err) => err ? reject(err) : resolve({ success: true }));
        });
    });
});

ipcMain.handle('scp-upload', async (event, { cameraId, remotePath: remoteDir }) => {
    const conn = fileManagerConnections[cameraId];
    if (!conn) throw new Error("SSH session not found.");
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: 'Select file to upload' });
    if (canceled || !filePaths.length) return { success: false, canceled: true };
    const localPath = filePaths[0];
    const finalRemotePath = path.posix.join(remoteDir, path.basename(localPath));
    return new Promise((resolve, reject) => {
         conn.scp((err, scp) => {
            if (err) return reject(err);
            scp.push(localPath, finalRemotePath, (err) => err ? reject(err) : resolve({ success: true }));
        });
    });
});

const executeRemoteCommand = (cameraId, command) => {
    return new Promise((resolve, reject) => {
        const conn = fileManagerConnections[cameraId];
        if (!conn) return reject(new Error("SSH session not found."));
        conn.exec(command, (err, stream) => {
            if (err) return reject(err);
            let stderr = '';
            stream.on('close', (code) => {
                if (code !== 0) reject(new Error(stderr || `Command exited with code ${code}`));
                else resolve({ success: true });
            }).stderr.on('data', (data) => stderr += data.toString('utf-8'));
        });
    });
};

ipcMain.handle('scp-mkdir', async (event, { cameraId, path }) => executeRemoteCommand(cameraId, `mkdir "${path}"`));
ipcMain.handle('scp-delete-file', async (event, { cameraId, path }) => executeRemoteCommand(cameraId, `rm "${path}"`));
ipcMain.handle('scp-delete-dir', async (event, { cameraId, path }) => executeRemoteCommand(cameraId, `rmdir "${path}"`));

ipcMain.handle('get-local-disk-list', async () => {
    if (process.platform === 'win32') {
        return new Promise(resolve => {
            exec('wmic logicaldisk get name', (err, stdout) => {
                if (err) return resolve([os.homedir()]);
                const disks = stdout.split('\n').slice(1).map(d => d.trim()).filter(Boolean).map(d => `${d}\\`);
                resolve(disks.length ? disks : [os.homedir()]);
            });
        });
    }
    return ['/'];
});

ipcMain.handle('list-local-files', async (event, dirPath) => {
    try {
        const dirents = await fsPromises.readdir(dirPath, { withFileTypes: true });
        const files = await Promise.all(
            dirents.map(async (dirent) => {
                try {
                    const stats = await fsPromises.stat(path.join(dirPath, dirent.name));
                    return { name: dirent.name, isDirectory: dirent.isDirectory(), size: stats.size };
                } catch { return null; }
            })
        );
        return files.filter(Boolean);
    } catch (error) {
        throw new Error(`Error reading local directory: ${error.message}`);
    }
});

ipcMain.handle('clipboardRead', () => clipboard.readText());
ipcMain.handle('clipboardWrite', (event, text) => clipboard.writeText(text));

ipcMain.handle('open-ssh-terminal', (event, camera) => {
    if (sshWindows[camera.id] && !sshWindows[camera.id].win.isDestroyed()) {
        sshWindows[camera.id].win.focus();
        return;
    }
    const sshWindow = new BrowserWindow({
        width: 800, height: 600,
        title: `SSH Terminal: ${camera.name}`,
        webPreferences: { preload: path.join(__dirname, 'terminal-preload.js') }
    });
    sshWindow.loadFile('terminal.html', { query: { camera: JSON.stringify(camera) } });
    
    const conn = new Client();
    sshWindows[camera.id] = { win: sshWindow, conn };
    conn.on('ready', () => {
        if (sshWindow.isDestroyed()) return;
        sshWindow.webContents.send('ssh-status', { connected: true });
        conn.shell((err, stream) => {
            if (err) {
                if (!sshWindow.isDestroyed()) sshWindow.webContents.send('ssh-data', `\r\n*** SSH SHELL ERROR: ${err.message} ***\r\n`);
                return;
            }
            stream.on('data', (data) => { if (!sshWindow.isDestroyed()) sshWindow.webContents.send('ssh-data', data.toString('utf8')); });
            ipcMain.on(`ssh-input-${camera.id}`, (event, data) => stream.write(data));
            stream.on('close', () => conn.end());
        });
    }).on('error', (err) => {
        if (!sshWindow.isDestroyed()) sshWindow.webContents.send('ssh-data', `\r\n*** SSH CONNECTION ERROR: ${err.message} ***\r\n`);
    }).on('close', () => {
        if (!sshWindow.isDestroyed()) sshWindow.webContents.send('ssh-status', { connected: false, message: '\r\nConnection closed.' });
        ipcMain.removeAllListeners(`ssh-input-${camera.id}`);
    }).connect({ host: camera.ip, port: 22, username: camera.username, password: camera.password });
    sshWindow.on('closed', () => {
        conn.end();
        delete sshWindows[camera.id];
    });
});

app.whenReady().then(createWindow);
app.on('will-quit', () => {
    const command = process.platform === 'win32' ? `taskkill /IM ${path.basename(ffmpegPath)} /F` : `pkill -f ${path.basename(ffmpegPath)}`;
    exec(command);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });