const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('k1desktop', {
  alerta: () => ipcRenderer.send('k1-alerta'),
  chaveAparelho: () => ipcRenderer.invoke('k1-chave'),
  nomeAparelho: () => ipcRenderer.invoke('k1-nome'),
});
