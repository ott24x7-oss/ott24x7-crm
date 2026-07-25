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
});
