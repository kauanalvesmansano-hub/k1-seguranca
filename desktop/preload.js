const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('k1desktop', { alerta: () => ipcRenderer.send('k1-alerta') });
