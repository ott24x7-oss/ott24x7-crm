const { contextBridge, ipcRenderer } = require('electron');

// Secure bridge exposed to the renderer as window.ott.
contextBridge.exposeInMainWorld('ott', {
  // license
  deviceId: () => ipcRenderer.invoke('license:deviceId'),
  licenseLoad: () => ipcRenderer.invoke('license:load'),
  licenseSave: (key) => ipcRenderer.invoke('license:save', key),
  licenseClear: () => ipcRenderer.invoke('license:clear'),
  licenseActivate: (key) => ipcRenderer.invoke('license:activate', key),
  licenseValidate: (key) => ipcRenderer.invoke('license:validate', key),
  // whatsapp engine
  getEngine: () => ipcRenderer.invoke('wa:getEngine'),
  // app
  config: () => ipcRenderer.invoke('app:config'),
  translate: (text, tl) => ipcRenderer.invoke('app:translate', { text, tl }),
  importNumbers: (filePath) => ipcRenderer.invoke('app:importNumbers', filePath),
  persistLoad: (key) => ipcRenderer.invoke('persist:load', key),
  persistSave: (key, value) => ipcRenderer.invoke('persist:save', key, value),
  onUpdateReady: (cb) => ipcRenderer.on('app:update-ready', cb),
});
