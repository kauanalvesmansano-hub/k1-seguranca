// K1 Segurança para computador (Windows): abre o K1 Monitoramento ou o Painel da Empresa.
const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');

// alarme toca sem precisar clicar e continua com a janela minimizada
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

let janela = null;
function criar() {
  janela = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1000, minHeight: 640, backgroundColor: '#050505',
    title: 'K1 Segurança', icon: path.join(__dirname, 'icone.png'), show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false },
  });
  janela.once('ready-to-show', () => { janela.maximize(); janela.show(); });
  janela.loadFile('inicio.html');
  // links externos (Google Maps, WhatsApp, telefone) abrem fora do programa
  janela.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  janela.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); } });
}

// disparo novo: traz a janela para a frente e pisca na barra de tarefas
ipcMain.on('k1-alerta', () => {
  if (!janela) return;
  if (janela.isMinimized()) janela.restore();
  janela.show(); janela.setAlwaysOnTop(true); janela.focus(); janela.flashFrame(true);
  setTimeout(() => janela && janela.setAlwaysOnTop(false), 4000);
});

Menu.setApplicationMenu(null);
app.whenReady().then(criar);
app.on('window-all-closed', () => app.quit());
