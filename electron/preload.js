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
  backupSave: (json) => ipcRenderer.invoke('backup:save', json),
  backupOpen: () => ipcRenderer.invoke('backup:open'),
  // AI assistant. Every call is scoped to a WhatsApp account id — that is this product's
  // tenancy boundary, and the main process refuses unscoped reads and writes.
  ai: {
    getSettings: (acc) => ipcRenderer.invoke('ai:getSettings', acc),
    saveSettings: (acc, patch) => ipcRenderer.invoke('ai:saveSettings', acc, patch),
    health: (acc) => ipcRenderer.invoke('ai:health', acc),
    getKnowledge: (acc) => ipcRenderer.invoke('ai:getKnowledge', acc),
    saveKnowledgeRow: (acc, row) => ipcRenderer.invoke('ai:saveKnowledgeRow', acc, row),
    deleteKnowledge: (acc, id) => ipcRenderer.invoke('ai:deleteKnowledge', acc, id),
    embedAll: (acc) => ipcRenderer.invoke('ai:embedAll', acc),
    dedupeKnowledge: (acc) => ipcRenderer.invoke('ai:dedupeKnowledge', acc),
    getExamples: (acc) => ipcRenderer.invoke('ai:getExamples', acc),
    saveExample: (acc, row) => ipcRenderer.invoke('ai:saveExample', acc, row),
    deleteExample: (acc, id) => ipcRenderer.invoke('ai:deleteExample', acc, id),
    generate: (ctx) => ipcRenderer.invoke('ai:generate', ctx),
    markSent: (acc, number, logId, text) => ipcRenderer.invoke('ai:markSent', acc, number, logId, text),
    availability: (acc, lastActivityAt) => ipcRenderer.invoke('ai:availability', acc, lastActivityAt),
    convoState: (acc, number) => ipcRenderer.invoke('ai:convoState', acc, number),
    pausedConvos: (acc) => ipcRenderer.invoke('ai:pausedConvos', acc),
    setConvoState: (acc, number, patch) => ipcRenderer.invoke('ai:setConvoState', acc, number, patch),
    getLogs: (acc, limit) => ipcRenderer.invoke('ai:getLogs', acc, limit),
    updateLog: (acc, id, patch) => ipcRenderer.invoke('ai:updateLog', acc, id, patch),
    purge: (acc, what) => ipcRenderer.invoke('ai:purge', acc, what),
    importCatalog: (opts) => ipcRenderer.invoke('ai:importCatalog', opts),
  },
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
