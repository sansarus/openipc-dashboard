// main.js (Полная версия с изменениями для системы управления пользователями)

const { app, BrowserWindow, ipcMain, Menu, clipboard, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const net = require('net');
const os = require('os');
const { spawn, exec } = require('child_process');
const axios = require('axios');
const { Client } = require('ssh2');
const WebSocket = require('ws');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');
const keytar = require('keytar');
const { autoUpdater } = require('electron-updater');
const onvif = require('onvif');
const crypto = require('crypto'); // VVV НОВОЕ VVV: Модуль для хэширования паролей

if (process.platform === 'linux' || process.env.ELECTRON_FORCE_NO_SANDBOX) {
    app.commandLine.appendSwitch('--no-sandbox');
}
app.commandLine.appendSwitch('force_high_performance_gpu');

const ffmpegPath = ffmpeg.path.replace('app.asar', 'app.asar.unpacked');

let mainWindow = null;
const streamManager = {};
const recordingManager = {};
const usedPorts = new Set();
const BASE_PORT = 9001;
const KEYTAR_SERVICE = 'OpenIPC-VMS';

function getDataPath() {
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
        return process.env.PORTABLE_EXECUTABLE_DIR;
    }
    return app.getPath('userData');
}

const dataPathRoot = getDataPath();
console.log(`[Config] Data path is: ${dataPathRoot}`);

const configPath = path.join(dataPathRoot, 'config.json');
const appSettingsPath = path.join(dataPathRoot, 'app-settings.json');
const usersPath = path.join(dataPathRoot, 'users.json'); // VVV НОВОЕ VVV
const oldCamerasPath = path.join(dataPathRoot, 'cameras.json');
let sshWindows = {};
let fileManagerConnections = {};
let appSettingsCache = null;

// VVV БЛОК УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ VVV
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { salt, hash };
}

function verifyPassword(password, hash, salt) {
    const hashToVerify = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === hashToVerify;
}

async function initializeUsers() {
    try {
        await fsPromises.access(usersPath);
    } catch (e) {
        console.log('[Users] users.json not found, creating default admin user (admin/admin).');
        const { salt, hash } = hashPassword('admin');
        const defaultUser = [{
            username: 'admin',
            hashedPassword: hash,
            salt: salt,
            role: 'admin'
        }];
        await fsPromises.writeFile(usersPath, JSON.stringify(defaultUser, null, 2));
    }
}
// ^^^ КОНЕЦ БЛОКА УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ ^^^

function getHwAccelOptions(codec, preference, streamId) {
    const isSD = streamId === 1;

    if (preference === 'nvidia') {
        const decoder = codec === 'h264' ? 'h264_cuvid' : 'hevc_cuvid';
        const decoderArgs = ['-c:v', decoder];
        if (isSD) {
            decoderArgs.push('-resize', '640x360');
        }
        console.log(`[FFMPEG] Using HW Accel: ${decoder} ${isSD ? 'with built-in resize' : 'for HD'}`);
        return { decoderArgs, vfString: 'format=yuv420p' };
    }

    if (preference === 'intel') {
        const decoder = codec === 'h264' ? 'h264_qsv' : 'hevc_qsv';
        let vfString = 'hwdownload,format=yuv420p';
        if (isSD) {
            vfString = 'scale_qsv=w=640:h=-2,' + vfString;
        }
        console.log(`[FFMPEG] Using HW Accel: ${decoder} ${isSD ? 'with QSV scaler' : 'for HD'}`);
        return { decoderArgs: ['-c:v', decoder], vfString };
    }

    let decoderArgs = [];
    let vfString = 'format=yuv420p';
    let platformMsg = '';

    if (preference === 'auto') {
        switch (process.platform) {
            case 'win32': decoderArgs = ['-hwaccel', 'd3d11va']; platformMsg = 'Auto-selecting d3d11va for HW aacel'; break;
            case 'darwin': decoderArgs = ['-hwaccel', 'videotoolbox']; platformMsg = 'Auto-selecting videotoolbox for HW accel'; break;
            case 'linux': platformMsg = 'Auto-selection on Linux: Using CPU for stability. For HW accel, ensure drivers are installed and select it manually.'; break;
            default: platformMsg = 'Auto-selection: No hardware acceleration, using CPU.'; break;
        }
    } else {
        platformMsg = 'Hardware acceleration disabled by user.';
    }

    if (isSD) {
        vfString = 'scale=w=640:h=-2,' + vfString;
    }
    
    console.log(`[FFMPEG] ${platformMsg}. ${isSD ? 'Using CPU scaler for SD.' : ''}`);
    return { decoderArgs, vfString };
}

async function getAppSettings() {
    if (appSettingsCache) {
        return appSettingsCache;
    }
    try {
        const data = await fsPromises.readFile(appSettingsPath, 'utf-8');
        appSettingsCache = JSON.parse(data);
    } catch (e) {
        appSettingsCache = { 
            recordingsPath: path.join(app.getPath('videos'), 'OpenIPC-VMS'),
            hwAccel: 'auto',
            language: 'en'
        };
    }
    return appSettingsCache;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        title: "DASHBOARD for OpenIPC",
        frame: false,
        titleBarStyle: 'hidden',
        icon: path.join(__dirname, 'build/icon.png'),
        webPreferences: { preload: path.join(__dirname, 'preload.js') }
    });
    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
        if (app.isPackaged) {
            console.log('[Updater] App ready, checking for updates...');
            autoUpdater.checkForUpdates();
        }
    });

    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-maximized');
    });

    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-unmaximized');
    });
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

// --- IPC ОБРАБОТЧИКИ ---

ipcMain.on('minimize-window', () => {
    mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on('close-window', () => {
    mainWindow.close();
});

ipcMain.handle('clipboardRead', () => {
    return clipboard.readText();
});
ipcMain.handle('clipboardWrite', (event, text) => {
    clipboard.writeText(text);
});

ipcMain.handle('login', async (event, { username, password }) => {
    try {
        const data = await fsPromises.readFile(usersPath, 'utf-8');
        const users = JSON.parse(data);
        const user = users.find(u => u.username === username);

        if (user && verifyPassword(password, user.hashedPassword, user.salt)) {
            // Возвращаем пользователя без хэша и соли! Безопасность.
            return { success: true, user: { username: user.username, role: user.role } };
        }
        return { success: false, error: 'Invalid username or password' };
    } catch (e) {
        console.error('Login error:', e);
        return { success: false, error: 'Error reading user data' };
    }
});

// VVV НОВЫЕ ОБРАБОТЧИКИ ДЛЯ УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ VVV
ipcMain.handle('get-users', async () => {
  try {
    const data = await fsPromises.readFile(usersPath, 'utf-8');
    const users = JSON.parse(data);
    // ВАЖНО: Никогда не отправляем хэши и соли на клиент!
    return { success: true, users: users.map(u => ({ username: u.username, role: u.role })) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('add-user', async (event, { username, password, role }) => {
  try {
    const data = await fsPromises.readFile(usersPath, 'utf-8');
    const users = JSON.parse(data);
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
      return { success: false, error: 'User with this name already exists.' };
    }
    const { salt, hash } = hashPassword(password);
    users.push({ username, salt, hashedPassword: hash, role });
    await fsPromises.writeFile(usersPath, JSON.stringify(users, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('update-user-password', async (event, { username, password }) => {
    try {
        const data = await fsPromises.readFile(usersPath, 'utf-8');
        let users = JSON.parse(data);
        const userIndex = users.findIndex(u => u.username === username);
        if (userIndex === -1) {
            return { success: false, error: 'User not found.' };
        }
        const { salt, hash } = hashPassword(password);
        users[userIndex].salt = salt;
        users[userIndex].hashedPassword = hash;
        await fsPromises.writeFile(usersPath, JSON.stringify(users, null, 2));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('delete-user', async (event, { username }) => {
  try {
    const data = await fsPromises.readFile(usersPath, 'utf-8');
    let users = JSON.parse(data);
    
    // Защита от удаления последнего администратора
    const admins = users.filter(u => u.role === 'admin');
    if (admins.length === 1 && admins[0].username === username) {
      return { success: false, error: 'Cannot delete the last administrator.' };
    }

    const filteredUsers = users.filter(u => u.username !== username);
    await fsPromises.writeFile(usersPath, JSON.stringify(filteredUsers, null, 2));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
// ^^^ КОНЕЦ НОВЫХ ОБРАБОТЧИКОВ ^^^

ipcMain.handle('load-app-settings', getAppSettings);
ipcMain.handle('save-app-settings', async (event, settings) => {
    try {
        appSettingsCache = settings;
        await fsPromises.writeFile(appSettingsPath, JSON.stringify(settings, null, 2));
        return { success: true };
    } catch (e) {
        console.error('Failed to save app settings:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-translation-file', async (event, lang) => {
    try {
        const filePath = path.join(__dirname, 'locales', `${lang}.json`);
        const data = await fsPromises.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error(`Failed to load translation file for ${lang}:`, e);
        return null;
    }
});

ipcMain.handle('select-directory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (canceled || filePaths.length === 0) {
        return { canceled: true };
    }
    return { path: filePaths[0] };
});

ipcMain.handle('open-in-browser', async (event, ip) => {
    if (!ip) {
        return { success: false, error: 'IP address is not provided.' };
    }
    const url = `http://${ip}`;
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (e) {
        console.error(`Failed to open URL ${url}:`, e);
        return { success: false, error: e.message };
    }
});

async function startRecording(camera) {
    if (!camera || !camera.id) {
        console.error('[REC] Invalid camera object for recording.');
        return { success: false, error: 'Invalid camera data' };
    }
    if (recordingManager[camera.id]) {
        console.log(`[REC] Recording already in progress for camera ${camera.id}. Skipping.`);
        return { success: false, error: 'Recording is already in progress' };
    }
    
    const password = await keytar.getPassword(KEYTAR_SERVICE, camera.id.toString());
    const fullCameraInfo = { ...camera, password: password || '' };

    const settings = await getAppSettings();
    const recordingsPath = settings.recordingsPath;
    try {
        await fsPromises.mkdir(recordingsPath, { recursive: true });
    } catch (e) {
        return { success: false, error: `Failed to create recordings folder: ${e.message}` };
    }
    const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    const saneCameraName = fullCameraInfo.name.replace(/[<>:"/\\|?*]/g, '_');
    const filename = `${saneCameraName}-${timestamp}.mp4`;
    const outputPath = path.join(recordingsPath, filename);
    
    const streamPath0 = fullCameraInfo.streamPath0 || '/stream0';
    const streamUrl = `rtsp://${encodeURIComponent(fullCameraInfo.username)}:${encodeURIComponent(fullCameraInfo.password)}@${fullCameraInfo.ip}:${fullCameraInfo.port || 554}${streamPath0}`;
    
    const ffmpegArgs = [
        '-rtsp_transport', 'tcp', '-i', streamUrl,
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart', outputPath
    ];
    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, { detached: false, windowsHide: true });
    recordingManager[camera.id] = { process: ffmpegProcess, path: outputPath };
    let ffmpegErrorOutput = '';
    ffmpegProcess.stderr.on('data', (data) => {
        ffmpegErrorOutput += data.toString();
    });
    ffmpegProcess.on('close', (code) => {
        console.log(`[REC FFMPEG] Finished for "${fullCameraInfo.name}" with code ${code}.`);
        delete recordingManager[camera.id];
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('recording-state-change', { 
                cameraId: camera.id, 
                recording: false, 
                path: code === 0 ? outputPath : null,
                error: code !== 0 ? (ffmpegErrorOutput.trim().split('\n').pop() || `ffmpeg exited with code ${code}`) : null 
            });
        }
    });
    console.log(`[REC] Starting for "${fullCameraInfo.name}" to ${outputPath}`);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('recording-state-change', { cameraId: camera.id, recording: true });
    return { success: true };
}

ipcMain.handle('start-recording', (event, camera) => startRecording(camera));

ipcMain.handle('stop-recording', (event, cameraId) => {
    const record = recordingManager[cameraId];
    if (record) {
        console.log(`[REC] Stopping for camera ${cameraId}.`);
        record.process.stdin.write('q\n');
        return { success: true };
    }
    return { success: false, error: 'Recording not found' };
});

ipcMain.handle('open-recordings-folder', async () => {
    const settings = await getAppSettings();
    const recordingsPath = settings.recordingsPath;
    try {
        await fsPromises.mkdir(recordingsPath, { recursive: true });
        shell.openPath(recordingsPath);
        return { success: true };
    } catch (e) {
        return { success: false, error: `Could not open folder: ${e.message}` };
    }
});

ipcMain.handle('export-archive-clip', async (event, { sourceFilename, startTime, duration }) => {
    const settings = await getAppSettings();
    const recordingsPath = settings.recordingsPath;
    const sourcePath = path.join(recordingsPath, sourceFilename);

    try {
        await fsPromises.access(sourcePath);
    } catch (e) {
        return { success: false, error: `Source file not found: ${sourceFilename}` };
    }

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Сохранить клип',
        defaultPath: path.join(app.getPath('videos'), `clip-${sourceFilename}`),
        filters: [{ name: 'MP4 Videos', extensions: ['mp4'] }]
    });

    if (canceled || !filePath) {
        return { success: false, error: 'Export cancelled by user.' };
    }

    return new Promise((resolve) => {
        const ffmpegArgs = [
            '-i', sourcePath,
            '-ss', startTime.toString(),
            '-t', duration.toString(),
            '-c', 'copy',
            filePath
        ];

        console.log(`[Export] Starting FFmpeg with args: ${ffmpegArgs.join(' ')}`);
        const exportProcess = spawn(ffmpegPath, ffmpegArgs);
        
        let errorOutput = '';
        exportProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        exportProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`[Export] Successfully created clip at ${filePath}`);
                resolve({ success: true, path: filePath });
            } else {
                console.error(`[Export] FFmpeg failed with code ${code}:`, errorOutput);
                resolve({ success: false, error: `FFmpeg failed: ${errorOutput.split('\n').pop()}` });
            }
        });

        exportProcess.on('error', (err) => {
             console.error(`[Export] Failed to start FFmpeg process:`, err);
             resolve({ success: false, error: `Failed to start FFmpeg: ${err.message}` });
        });
    });
});

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

ipcMain.on('show-camera-context-menu', (event, { cameraId, labels }) => {
    const template = [
        { label: labels.open_in_browser, click: () => { event.sender.send('context-menu-command', { command: 'open_in_browser', cameraId }); } },
        { type: 'separator' },
        { label: labels.files, click: () => { event.sender.send('context-menu-command', { command: 'files', cameraId }); } },
        { label: labels.ssh, click: () => { event.sender.send('context-menu-command', { command: 'ssh', cameraId }); } },
        { label: labels.archive, click: () => { event.sender.send('context-menu-command', { command: 'archive', cameraId }); } },
        { label: labels.settings, click: () => { event.sender.send('context-menu-command', { command: 'settings', cameraId }); } },
        { label: labels.edit, click: () => { event.sender.send('context-menu-command', { command: 'edit', cameraId }); } },
        { type: 'separator' },
        { label: labels.delete, click: () => { event.sender.send('context-menu-command', { command: 'delete', cameraId }); } },
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
            Object.values(recordingManager).forEach(rec => rec.process?.kill('SIGKILL'));
            usedPorts.clear();
            Object.keys(streamManager).forEach(key => delete streamManager[key]);
            Object.keys(recordingManager).forEach(key => delete recordingManager[key]);
            if (err && !/not found|не найден/i.test(stderr)) {
                resolve({ success: false, message: `Ошибка: ${stderr}` });
            } else {
                resolve({ success: true, message: "Все 'зависшие' потоки были успешно сброшены." });
            }
        });
    });
});

ipcMain.handle('start-video-stream', async (event, { credentials, streamId }) => {
    let configData;
    try {
        const rawData = await fsPromises.readFile(configPath, 'utf-8');
        configData = JSON.parse(rawData);
    } catch (e) {
        console.error(`[FFMPEG] Could not load configuration file to start stream: ${e.message}`);
        return { success: false, error: 'Could not load configuration file.' };
    }

    const cameraConfig = configData.cameras.find(c => c.id === credentials.id);
    if (!cameraConfig) {
        return { success: false, error: `Camera with ID ${credentials.id} not found in config.` };
    }
    
    const password = await keytar.getPassword(KEYTAR_SERVICE, credentials.id.toString());
    const fullCredentials = { ...cameraConfig, password: password || '' };

    const uniqueStreamIdentifier = `${fullCredentials.id}_${streamId}`;
    if (streamManager[uniqueStreamIdentifier]) {
        console.warn(`[STREAM] Stream ${uniqueStreamIdentifier} is already running.`);
        return { success: true, wsPort: streamManager[uniqueStreamIdentifier].port };
    }

    const port = fullCredentials.port || '554';
    const streamPath = streamId === 0 ? (fullCredentials.streamPath0 || '/stream0') : (fullCredentials.streamPath1 || '/stream1');
    const streamUrl = `rtsp://${encodeURIComponent(fullCredentials.username)}:${encodeURIComponent(fullCredentials.password)}@${fullCredentials.ip}:${port}${streamPath}`;
    
    const wsPort = await getAndReserveFreePort();
    if (wsPort === null) {
        return { success: false, error: 'Failed to find a free port.' };
    }

    const wss = new WebSocket.Server({ port: wsPort });
    wss.on('connection', (ws) => console.log(`[WSS] Client connected to port ${wsPort}`));
    
    const settings = await getAppSettings();
    let cameraInfo;
    try {
        cameraInfo = (await axios.get(`http://${fullCredentials.ip}/api/v1/config.json`, getAxiosJsonConfig(fullCredentials))).data;
    } catch (e) {
        console.error(`[FFMPEG] Failed to get camera config for ${fullCredentials.name}. Error: ${e.message}`);
        cameraInfo = {};
    }
    
    const codec = streamId === 0 ? (cameraInfo.video0?.codec || 'h264') : (cameraInfo.video1?.codec || 'h264');
    
    const { decoderArgs, vfString } = getHwAccelOptions(codec, settings.hwAccel, streamId);

    const ffmpegArgs = [
        ...decoderArgs,
        '-loglevel', 'error',
        '-rtsp_transport', 'tcp',
        '-i', streamUrl,
        '-progress', 'pipe:2', 
        '-f', 'mpegts',
        '-c:v', 'mpeg1video',
        '-preset', 'ultrafast',
        '-vf', vfString,
        '-q:v', '8',
        '-r', '20',
        '-bf', '0',
    ];
    
    ffmpegArgs.push(
        '-ignore_unknown', 
        '-c:a', 'mp2', 
        '-b:a', '128k', 
        '-ar', '44100', 
        '-ac', '1'
    );
    
    ffmpegArgs.push('-');

    console.log(`[FFMPEG] Starting stream ${uniqueStreamIdentifier} with args:`, ffmpegArgs.join(' '));
    const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, { detached: false, windowsHide: true });
    
    ffmpegProcess.on('error', (err) => { console.error(`[FFMPEG] Failed to start subprocess for ${uniqueStreamIdentifier}: ${err.message}`); });
    ffmpegProcess.stdout.on('data', (data) => { wss.clients.forEach((client) => { if (client.readyState === WebSocket.OPEN) client.send(data); }); });
    
    let statsBuffer = '', lastErrorOutput = '';
    ffmpegProcess.stderr.on('data', (data) => {
        const errorString = data.toString();
        if (errorString.trim()) { lastErrorOutput = errorString.trim(); }
        statsBuffer += errorString;
        const statsBlocks = statsBuffer.split('progress=');
        if (statsBlocks.length > 1) {
            for (let i = 0; i < statsBlocks.length - 1; i++) {
                const block = statsBlocks[i];
                if (!block.trim()) continue;
                const lines = block.trim().split('\n');
                const stats = {};
                lines.forEach(line => {
                    const [key, value] = line.split('=');
                    if (key && value) stats[key.trim()] = value.trim();
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
        console.warn(`[FFMPEG] Process ${uniqueStreamIdentifier} exited with code ${code}.`);
        if(code !== 0) { console.error(`[FFMPEG Last Stderr] ${uniqueStreamIdentifier}: ${lastErrorOutput}`); }
        if (streamManager[uniqueStreamIdentifier]) { streamManager[uniqueStreamIdentifier].wss.close(); releasePort(wsPort); delete streamManager[uniqueStreamIdentifier]; }
        if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.webContents.send('stream-died', uniqueStreamIdentifier); }
    });
    
    streamManager[uniqueStreamIdentifier] = { process: ffmpegProcess, wss, port: wsPort };
    return { success: true, wsPort };
});

ipcMain.handle('stop-video-stream', async (event, uniqueStreamIdentifier) => {
    const stream = streamManager[uniqueStreamIdentifier];
    if (stream) {
        console.log(`[STREAM] Stopping stream ${uniqueStreamIdentifier} manually.`);
        stream.process.kill('SIGKILL');
        return { success: true };
    }
    return { success: false, error: "Stream not found" };
});

ipcMain.handle('save-configuration', async (event, config) => {
    try {
        const configToSave = JSON.parse(JSON.stringify(config));
        
        for (const camera of configToSave.cameras) {
            if (camera.password) {
                await keytar.setPassword(KEYTAR_SERVICE, camera.id.toString(), camera.password);
                delete camera.password;
            }
        }
        await fsPromises.writeFile(configPath, JSON.stringify(configToSave, null, 2));
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('load-configuration', async () => {
    const defaultConfig = {
        cameras: [],
        groups: [],
        layout: { cols: 2, rows: 2 },
        gridState: Array(64).fill(null)
    };
    let config = defaultConfig;

    const migrateOldFile = async () => {
        try {
            await fsPromises.access(oldCamerasPath);
            console.log('Found old cameras.json, attempting migration...');
            const oldData = await fsPromises.readFile(oldCamerasPath, 'utf-8');
            const oldCameras = JSON.parse(oldData);
            return { ...defaultConfig, cameras: oldCameras };
        } catch (migrationError) {
            return null;
        }
    };
    
    try {
        await fsPromises.access(configPath);
        const data = await fsPromises.readFile(configPath, 'utf-8');
        config = { ...defaultConfig, ...JSON.parse(data) };
        if (!config.gridState || config.gridState.length < 64) {
            config.gridState = Array(64).fill(null);
        }
    } catch (e) {
        const migratedConfig = await migrateOldFile();
        if (migratedConfig) {
            config = migratedConfig;
            const configToSave = JSON.parse(JSON.stringify(config));
            for (const camera of configToSave.cameras) {
                if (camera.password) {
                    await keytar.setPassword(KEYTAR_SERVICE, camera.id.toString(), camera.password);
                    delete camera.password;
                }
            }
            await fsPromises.writeFile(configPath, JSON.stringify(configToSave, null, 2));
            await fsPromises.rename(oldCamerasPath, `${oldCamerasPath}.bak`);
            console.log('Migration successful and new config saved.');
        } else {
            console.log('No existing config found, returning default.');
        }
    }
    
    return config;
});

ipcMain.handle('get-system-stats', () => {
    const metrics = app.getAppMetrics();
    let totalCpuUsage = 0;
    let totalRamUsage = 0; // в КБ

    metrics.forEach(metric => {
        totalCpuUsage += metric.cpu.percentCPUUsage;
        totalRamUsage += metric.memory.workingSetSize; // Это значение в килобайтах
    });

    return {
        cpu: totalCpuUsage.toFixed(0),
        ram: (totalRamUsage / 1024).toFixed(0), // Конвертируем КБ в МБ
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
        const password = await keytar.getPassword(KEYTAR_SERVICE, credentials.id.toString());
        const response = await axios.get(`http://${credentials.ip}/api/v1/config.json`, getAxiosJsonConfig({...credentials, password}));
        return response.data;
    } catch (error) {
        return { error: `Failed to get settings: ${error.message}` };
    }
});

ipcMain.handle('set-camera-settings', async (event, { credentials, settingsData }) => {
    try {
        const password = await keytar.getPassword(KEYTAR_SERVICE, credentials.id.toString());
        const url = `http://${credentials.ip}/cgi-bin/mj-settings.cgi`;
        settingsData.action = 'update';
        const formData = new URLSearchParams(settingsData).toString();
        const config = getAxiosCgiConfig({...credentials, password});
        config.validateStatus = (status) => (status >= 200 && status < 300) || status === 303;
        await axios.post(url, formData, config);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.response?.data?.error || error.message };
    }
});

ipcMain.handle('restart-majestic', async (event, credentials) => {
    try {
        const password = await keytar.getPassword(KEYTAR_SERVICE, credentials.id.toString());
        const url = `http://${credentials.ip}/cgi-bin/mj-settings.cgi`;
        const formData = new URLSearchParams({ action: 'restart' }).toString();
        const config = getAxiosCgiConfig({...credentials, password});
        config.validateStatus = (status) => (status >= 200 && status < 300) || status === 303;
        await axios.post(url, formData, config);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.response?.data?.error || error.message };
    }
});

ipcMain.handle('get-camera-pulse', async (event, credentials) => {
    try {
        const password = await keytar.getPassword(KEYTAR_SERVICE, credentials.id.toString());
        const response = await axios.get(`http://${credentials.ip}/api/v1/soc`, { 
            auth: { username: credentials.username, password: password || '' },
            timeout: 3000 
        });
        return { success: true, soc_temp: response.data.temp_c ? `${response.data.temp_c.toFixed(1)}°C` : null };
    } catch (error) {
        return { error: 'Camera is offline or not responding' };
    }
});

ipcMain.handle('get-camera-time', async (event, credentials) => {
    try {
        const password = await keytar.getPassword(KEYTAR_SERVICE, credentials.id.toString());
        const fullCredentials = { ...credentials, password: password || '' };
        const response = await axios.get(`http://${fullCredentials.ip}/api/v1/info`, getAxiosJsonConfig(fullCredentials));
        
        if (response.data && (response.data.localtime || response.data.system_time)) {
            return { 
                success: true, 
                cameraTimestamp: response.data.localtime, 
                systemTime: response.data.system_time 
            };
        } else {
            return { success: false, error: 'timestamp not found in camera response' };
        }
    } catch (error) {
        return { success: false, error: `Failed to get camera time: ${error.message}` };
    }
});


ipcMain.handle('get-camera-info', async (event, credentials) => {
    try {
        const password = await keytar.getPassword(KEYTAR_SERVICE, credentials.id.toString());
        const response = await axios.get(`http://${credentials.ip}/api/v1/info`, { timeout: 3000, auth: { username: credentials.username, password: password || '' } });
        return { success: true, ...response.data };
    } catch (error) {
        return { error: 'Camera is offline or not responding' };
    }
});

ipcMain.handle('open-file-manager', (event, camera) => createFileManagerWindow(camera));

ipcMain.handle('get-recordings-for-date', async (event, { cameraName, date }) => {
    try {
        const settings = await getAppSettings();
        const recordingsPath = settings.recordingsPath;
        await fsPromises.mkdir(recordingsPath, { recursive: true });

        const dirents = await fsPromises.readdir(recordingsPath, { withFileTypes: true });
        const saneCameraName = cameraName.replace(/[<>:"/\\|?*]/g, '_');
        const datePrefix = `${saneCameraName}-${date}`;

        const videoFiles = dirents
            .filter(dirent => dirent.isFile() && dirent.name.startsWith(datePrefix) && dirent.name.endsWith('.mp4'))
            .map(dirent => {
                const timestampMatch = dirent.name.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
                if (timestampMatch) {
                    const timestampString = timestampMatch[1];
                    const [datePart, timePart] = timestampString.split('T');
                    const correctedTimePart = timePart.replace(/-/g, ':');
                    const validISOString = `${datePart}T${correctedTimePart}.000Z`;
                    
                    const dateObj = new Date(validISOString);
                    if (isNaN(dateObj.getTime())) {
                        console.error(`Invalid date parsed from filename: ${dirent.name}`);
                        return null;
                    }
                    
                    return {
                        name: dirent.name,
                        startTime: dateObj.toISOString(),
                    };
                }
                return null;
            })
            .filter(Boolean)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
            
        return videoFiles;

    } catch (e) {
        console.error('Failed to get recordings for date:', e);
        return [];
    }
});

ipcMain.handle('discover-onvif-devices', async (event) => {
    console.log('[Scanner] Starting IP scan discovery...');

    const interfaces = os.networkInterfaces();
    const subnets = new Set();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                const parts = iface.address.split('.');
                parts.pop();
                subnets.add(parts.join('.') + '.');
            }
        }
    }

    if (subnets.size === 0) {
        console.warn('[Scanner] No active network interfaces found for scanning.');
        return { success: true, count: 0 };
    }

    const scanPromises = [];
    const foundDevices = new Set();
    console.log(`[Scanner] Scanning subnets: [ ${Array.from(subnets).join(', ')} ]`);

    for (const subnet of subnets) {
        for (let i = 1; i < 255; i++) {
            const ip = subnet + i;
            const promise = (async () => {
                try {
                    const cam = new onvif.Cam({
                        hostname: ip,
                        port: 80, 
                        timeout: 2000 
                    });
                    
                    const info = await new Promise((resolve, reject) => {
                       cam.getDeviceInformation((err, info) => {
                           if (err) return reject(err);
                           resolve(info);
                       });
                    });

                    if (info && !foundDevices.has(ip)) {
                        foundDevices.add(ip);
                        const deviceInfo = {
                            ip: ip,
                            name: info.model || info.manufacturer || ip,
                        };
                        console.log(`[Scanner] ONVIF device found at: ${ip}`);
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('onvif-device-found', deviceInfo);
                        }
                    }
                } catch (e) {
                    // Errors are expected for non-camera IPs
                }
            })();
            scanPromises.push(promise);
        }
    }

    await Promise.all(scanPromises);
    console.log(`[Scanner] Scan finished across all subnets. Found ${foundDevices.size} total devices.`);
    return { success: true, count: foundDevices.size };
});

ipcMain.handle('open-ssh-terminal', (event, camera) => {
    const cleanCamera = {
        id: camera.id, name: camera.name, ip: camera.ip,
        username: camera.username, password: camera.password
    };

    if (sshWindows[cleanCamera.id] && !sshWindows[cleanCamera.id].win.isDestroyed()) {
        sshWindows[cleanCamera.id].win.focus();
        return;
    }
    const sshWindow = new BrowserWindow({
        width: 800, height: 600,
        title: `SSH Terminal: ${cleanCamera.name}`,
        webPreferences: { preload: path.join(__dirname, 'terminal-preload.js') }
    });
    sshWindow.loadFile('terminal.html', { query: { camera: JSON.stringify(camera) } });
    
    const conn = new Client();
    sshWindows[cleanCamera.id] = { win: sshWindow, conn };
    
    keytar.getPassword(KEYTAR_SERVICE, cleanCamera.id.toString()).then(password => {
        cleanCamera.password = password || cleanCamera.password; 

        conn.on('ready', () => {
            if (sshWindow.isDestroyed()) return;
            sshWindow.webContents.send('ssh-status', { connected: true });
            conn.shell((err, stream) => {
                if (err) {
                    if (!sshWindow.isDestroyed()) sshWindow.webContents.send('ssh-status', { connected: false, message: `\r\n*** SSH SHELL ERROR: ${err.message} ***\r\n` });
                    return;
                }
                stream.on('data', (data) => { if (!sshWindow.isDestroyed()) sshWindow.webContents.send('ssh-data', data.toString('utf8')); });
                ipcMain.on(`ssh-input-${cleanCamera.id}`, (event, data) => stream.write(data));
                stream.on('close', () => conn.end());
            });
        }).on('error', (err) => {
            if (!sshWindow.isDestroyed()) sshWindow.webContents.send('ssh-status', { connected: false, message: `\r\n*** SSH CONNECTION ERROR: ${err.message} ***\r\n` });
        }).on('close', () => {
            if (!sshWindow.isDestroyed()) sshWindow.webContents.send('ssh-status', { connected: false, message: '\r\nConnection closed.' });
            ipcMain.removeAllListeners(`ssh-input-${cleanCamera.id}`);
        }).connect({ host: cleanCamera.ip, port: 22, username: cleanCamera.username, password: cleanCamera.password, readyTimeout: 10000 });
    });

    sshWindow.on('closed', () => {
        conn.end();
        delete sshWindows[cleanCamera.id];
    });
});

ipcMain.handle('check-for-updates', () => {
    autoUpdater.checkForUpdates();
});

// --- ЛОГИКА АВТООБНОВЛЕНИЙ ---
autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available.', info);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', { status: 'available', message: `Доступна версия ${info.version}` });
});
autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] No new update available.');
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', { status: 'latest', message: 'У вас последняя версия.' });
});
autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err ? (err.stack || err) : 'unknown error');
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', { status: 'error', message: `Ошибка обновления: ${err.message}` });
});
autoUpdater.on('download-progress', (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent.toFixed(2) + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log('[Updater] ' + log_message);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', {
        status: 'downloading',
        message: `Загрузка... ${progressObj.percent.toFixed(0)}%`
    });
});
autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded.', info);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update-status', { status: 'downloaded', message: `Версия ${info.version} загружена. Перезапустите для установки.` });
    
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Обновление готово',
        message: 'Новая версия загружена. Перезапустить приложение сейчас, чтобы установить обновление?',
        buttons: ['Перезапустить', 'Позже'],
        defaultId: 0
    }).then(({ response }) => {
        if (response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

// --- ЖИЗНЕННЫЙ ЦИКЛ ПРИЛОЖЕНИЯ ---
app.whenReady().then(async () => { // VVV ИЗМЕНЕНИЕ: делаем async VVV
    await initializeUsers(); // VVV ИЗМЕНЕНИЕ: вызываем здесь VVV

    protocol.registerFileProtocol('video-archive', async (request, callback) => {
        const settings = await getAppSettings();
        const recordingsPath = settings.recordingsPath;
        const filename = decodeURIComponent(request.url.replace('video-archive://', ''));
        const filePath = path.join(recordingsPath, filename);
        
        if (path.dirname(filePath) !== path.resolve(recordingsPath)) {
            console.error("Attempt to access file outside of recordings directory.");
            return callback({ error: -6 });
        }

        callback({ path: filePath });
    });

    createWindow();
});
app.on('will-quit', () => {
    const command = process.platform === 'win32' ? `taskkill /IM ${path.basename(ffmpegPath)} /F` : `pkill -f ${path.basename(ffmpegPath)}`;
    exec(command);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });