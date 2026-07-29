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
  licenseTrial: () => ipcRenderer.invoke('license:trial'),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  // whatsapp engine
  getEngine: () => ipcRenderer.invoke('wa:getEngine'),
  // app
  config: () => ipcRenderer.invoke('app:config'),
  translate: (text, tl) => ipcRenderer.invoke('app:translate', { text, tl }),
  importNumbers: (filePath) => ipcRenderer.invoke('app:importNumbers', filePath),
  catalogFetch: (url) => ipcRenderer.invoke('catalog:fetch', url),
  catalogImage: (url) => ipcRenderer.invoke('catalog:image', url),
  backupSave: (json) => ipcRenderer.invoke('backup:save', json),
  backupOpen: () => ipcRenderer.invoke('backup:open'),
  persistLoad: (key) => ipcRenderer.invoke('persist:load', key),
  persistSave: (key, value) => ipcRenderer.invoke('persist:save', key, value),
  renderInvoicePdf: (html) => ipcRenderer.invoke('invoice:pdf', html),
  onUpdateAvailable: (cb) => ipcRenderer.on('update:available', (e, d) => cb(d)),
  onUpdateProgress: (cb) => ipcRenderer.on('update:progress', (e, d) => cb(d)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update:downloaded', () => cb()),
  onUpdateNone: (cb) => ipcRenderer.on('update:none', () => cb()),
  onUpdateError: (cb) => ipcRenderer.on('update:error', (e, d) => cb(d)),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
});
