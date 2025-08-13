const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    startDeletion: (config) => ipcRenderer.send('start-deletion', config),
    stopDeletion: () => ipcRenderer.send('stop-deletion'),
    onLogUpdate: (callback) => ipcRenderer.on('log-update', (event, ...args) => callback(...args)),
    onStatsUpdate: (callback) => ipcRenderer.on('stats-update', (event, ...args) => callback(...args)),
    onProcessFinished: (callback) => ipcRenderer.on('process-finished', () => callback()),
    getPlatform: () => process.platform
});