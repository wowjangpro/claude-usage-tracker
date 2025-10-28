const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getStatus: () => ipcRenderer.invoke('get-status'),
  getUsageData: () => ipcRenderer.invoke('get-usage-data'),
  uploadNow: () => ipcRenderer.invoke('upload-now'),
  getLogs: () => ipcRenderer.invoke('get-logs'),
});
