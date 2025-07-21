// terminal-preload.js (полная исправленная версия)

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('terminalApi', {
    onData: (callback) => ipcRenderer.on('ssh-data', (event, data) => callback(data)),
    onStatus: (callback) => ipcRenderer.on('ssh-status', (event, status) => callback(status)),
    sendInput: (cameraId, data) => ipcRenderer.send(`ssh-input-${cameraId}`, data),
    // Новые функции для буфера обмена
    readClipboard: () => ipcRenderer.invoke('clipboardRead'),
    writeClipboard: (text) => ipcRenderer.invoke('clipboardWrite', text),
});