// preload.js (полная исправленная версия с системой пользователей)

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Функции для управления окном
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', callback),
  onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', callback),

  // Функция для аутентификации
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  
  // VVV НОВЫЕ ФУНКЦИИ УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ VVV
  getUsers: () => ipcRenderer.invoke('get-users'),
  addUser: (userData) => ipcRenderer.invoke('add-user', userData),
  updateUserPassword: (userData) => ipcRenderer.invoke('update-user-password', userData),
  deleteUser: (userData) => ipcRenderer.invoke('delete-user', { username: userData.username }),
  // ^^^ КОНЕЦ НОВЫХ ФУНКЦИЙ ^^^

  // Существующие функции
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
  showCameraContextMenu: (data) => ipcRenderer.send('show-camera-context-menu', data),
  onContextMenuCommand: (callback) => ipcRenderer.on('context-menu-command', (event, args) => callback(args)),
  onStreamDied: (callback) => ipcRenderer.on('stream-died', (event, uniqueStreamId) => callback(uniqueStreamId)),
  getCameraInfo: (credentials) => ipcRenderer.invoke('get-camera-info', credentials),
  getCameraTime: (credentials) => ipcRenderer.invoke('get-camera-time', credentials),
  openFileManager: (camera) => ipcRenderer.invoke('open-file-manager', camera),
  onStreamStats: (callback) => ipcRenderer.on('stream-stats', (event, stats) => callback(stats)),
  openInBrowser: (ip) => ipcRenderer.invoke('open-in-browser', ip),
  startRecording: (camera) => ipcRenderer.invoke('start-recording', camera),
  stopRecording: (cameraId) => ipcRenderer.invoke('stop-recording', cameraId),
  openRecordingsFolder: () => ipcRenderer.invoke('open-recordings-folder'),
  onRecordingStateChange: (callback) => ipcRenderer.on('recording-state-change', (event, data) => callback(data)),
  saveAppSettings: (settings) => ipcRenderer.invoke('save-app-settings', settings),
  loadAppSettings: () => ipcRenderer.invoke('load-app-settings'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getRecordingsForDate: (data) => ipcRenderer.invoke('get-recordings-for-date', data),
  exportArchiveClip: (data) => ipcRenderer.invoke('export-archive-clip', data),
  deleteRecording: (filename) => ipcRenderer.invoke('delete-recording', filename),
  showRecordingInFolder: (filename) => ipcRenderer.invoke('show-recording-in-folder', filename),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, data) => callback(data)),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  discoverOnvifDevices: () => ipcRenderer.invoke('discover-onvif-devices'),
  onOnvifDeviceFound: (callback) => ipcRenderer.on('onvif-device-found', (event, device) => callback(device)),
  getTranslationFile: (lang) => ipcRenderer.invoke('get-translation-file', lang),
});