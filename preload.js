const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startVideoStream: (credentials) => ipcRenderer.invoke('start-video-stream', credentials),
  stopVideoStream: (uniqueStreamId) => ipcRenderer.invoke('stop-video-stream', uniqueStreamId),
  killAllFfmpeg: () => ipcRenderer.invoke('kill-all-ffmpeg'),
  saveConfiguration: (config) => ipcRenderer.invoke('save-configuration', config),
  loadConfiguration: () => ipcRenderer.invoke('load-configuration'),
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
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
  
  startRecording: (camera) => ipcRenderer.invoke('start-recording', camera),
  stopRecording: (cameraId) => ipcRenderer.invoke('stop-recording', cameraId),
  openRecordingsFolder: () => ipcRenderer.invoke('open-recordings-folder'),
  onRecordingStateChange: (callback) => ipcRenderer.on('recording-state-change', (event, data) => callback(data)),
  
  saveAppSettings: (settings) => ipcRenderer.invoke('save-app-settings', settings),
  loadAppSettings: () => ipcRenderer.invoke('load-app-settings'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  getRecordingsList: () => ipcRenderer.invoke('get-recordings-list'),
  deleteRecording: (filename) => ipcRenderer.invoke('delete-recording', filename),
  showRecordingInFolder: (filename) => ipcRenderer.invoke('show-recording-in-folder', filename),

  setupMotionDetectionWebhook: (camera) => ipcRenderer.invoke('setup-motion-webhook', camera),

  startAiDetection: (camera) => ipcRenderer.invoke('start-ai-detection', camera),
  stopAiDetection: (cameraId) => ipcRenderer.invoke('stop-ai-detection', cameraId),
});