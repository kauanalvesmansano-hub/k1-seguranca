// K1 Segurança para computador (Windows): abre o K1 Monitoramento ou o Painel da Empresa.
const { app, BrowserWindow, shell, Menu, ipcMain, safeStorage, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Chave secreta DESTE computador (autoriza o K1 Monitoramento). Fica guardada criptografada pelo Windows (DPAPI).
function chaveDoComputador() {
  const arq = path.join(app.getPath('userData'), 'k1-aparelho.bin');
  try {
    if (fs.existsSync(arq)) {
      const bruto = fs.readFileSync(arq);
      return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(bruto) : bruto.toString('utf8');
    }
  } catch { /* recria abaixo */ }
  const nova = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(nova) : Buffer.from(nova, 'utf8'));
  return nova;
}
ipcMain.handle('k1-chave', () => chaveDoComputador());
ipcMain.handle('k1-nome', () => `${os.hostname()} (${os.userInfo().username})`);

// O nome "K1 Segurança" (com ç) entra no User-Agent e o servidor de login recusa (texto fora do padrão UTF-8).
// Deixa o User-Agent só com letras simples.
app.userAgentFallback = app.userAgentFallback.replace(/K1 Segurança\/[\d.]+\s*/g, 'K1Seguranca/' + app.getVersion() + ' ').replace(/[^\x20-\x7E]/g, '');

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
  janela.webContents.setUserAgent(app.userAgentFallback);
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
app.whenReady().then(() => {
  criar();
  // ATUALIZAÇÃO AUTOMÁTICA: baixa a versão nova sozinho e instala ao reiniciar
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async (info) => {
    const r = await dialog.showMessageBox(janela, {
      type: 'info', buttons: ['Atualizar agora', 'Depois'], defaultId: 0, cancelId: 1,
      title: 'K1 Segurança', message: `Nova versão ${info.version} do K1 Segurança pronta.`,
      detail: 'Clique em "Atualizar agora" para reiniciar o programa já atualizado (leva poucos segundos). Se escolher "Depois", ela instala quando você fechar o programa.',
    });
    if (r.response === 0) autoUpdater.quitAndInstall(false, true);
  });
  autoUpdater.on('error', () => { /* sem internet: tenta de novo mais tarde */ });
  const verificar = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(verificar, 10_000);
  setInterval(verificar, 3 * 60 * 60_000);
});
app.on('window-all-closed', () => app.quit());
