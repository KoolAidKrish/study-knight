const { app, BrowserWindow, ipcMain, Notification, dialog, shell } = require('electron');
const path = require('path');
const packs = require('./packs-main');
const party = require('./party-server');

const FULL = { width: 1100, height: 680 };
const MINI = { width: 380, height: 214 };

let win;
let fullBounds = null;

function createWindow() {
  win = new BrowserWindow({
    ...FULL,
    minWidth: 340,
    minHeight: 190,
    backgroundColor: '#14152b',
    title: 'Study Knight',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#f4ecd8', height: 36 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Keep timers accurate when the window is minimized or covered.
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

ipcMain.handle('mini', (_e, on) => {
  if (!win) return;
  if (on) {
    fullBounds = win.getBounds();
    win.setAlwaysOnTop(true, 'floating');
    win.setSize(MINI.width, MINI.height);
  } else {
    win.setAlwaysOnTop(false);
    if (fullBounds) win.setBounds(fullBounds);
  }
});

ipcMain.handle('notify', (_e, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title, body, silent: false }).show();
  if (win && !win.isFocused()) win.flashFrame(true);
});

const packsRoot = () => path.join(app.getPath('userData'), 'packs');

ipcMain.handle('packs:list', () => packs.listPacks(packsRoot()));
ipcMain.handle('packs:import', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Choose a character or background folder',
    properties: ['openDirectory'],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return packs.importPack(packsRoot(), res.filePaths[0]);
});
ipcMain.handle('packs:open', () => shell.openPath(packsRoot()));
// Removed packs go to the Recycle Bin, not straight to deletion.
ipcMain.handle('packs:remove', (_e, id) => shell.trashItem(packs.packDir(packsRoot(), id)));

// LAN party: the host's window starts the relay, then connects to it like everyone else.
ipcMain.handle('party:host', () => party.start());
ipcMain.handle('party:stop', () => party.stop());

app.setAppUserModelId('dev.ktiwari.studyknight');
app.whenReady().then(createWindow);
app.on('browser-window-focus', () => win && win.flashFrame(false));
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { party.stop(); });
