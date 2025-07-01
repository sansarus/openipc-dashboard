const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startVideoStream: (credentials) => ipcRenderer.invoke('start-video-stream', credentials),
  stopVideoStream: (uniqueStreamId) => ipcRenderer.invoke('stop-video-stream', uniqueStreamId),
  killAllFfmpeg: () => ipcRenderer.invoke('kill-all-ffmpeg'),
  saveCameras: (cameras) => ipcRenderer.invoke('save-cameras', cameras),
  loadCameras: () => ipcRenderer.invoke('load-cameras'),
  getCameraSettings: (credentials) => ipcRenderer.invoke('get-camera-settings', credentials),
  setCameraSettings: (data) => ipcRenderer.invoke('set-camera-settings', data),
  restartMajestic: (credentials) => ipcRenderer.invoke('restart-majestic', credentials),
  getCameraPulse: (credentials) => ipcRenderer.invoke('get-camera-pulse', credentials),
  openSshTerminal: (camera) => ipcRenderer.invoke('open-ssh-terminal', camera),
  showCameraContextMenu: (cameraId) => ipcRenderer.send('show-camera-context-menu', cameraId),
  onContextMenuCommand: (callback) => ipcRenderer.on('context-menu-command', (event, args) => callback(args)),
  onStreamDied: (callback) => ipcRenderer.on('stream-died', (event, uniqueStreamId) => callback(uniqueStreamId)),
  getCameraInfo: (credentials) => ipcRenderer.invoke('get-camera-info', credentials),
  openFileManager: (camera) => ipcRenderer.invoke('open-file-manager', camera),
  onStreamStats: (callback) => ipcRenderer.on('stream-stats', (event, stats) => callback(stats)),
});