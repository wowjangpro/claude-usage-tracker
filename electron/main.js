import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClaudeWrapper } from './claude-wrapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('='.repeat(60));
console.log('Claude Usage Tracker - Electron Main Process');
console.log('='.repeat(60));
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('__dirname:', __dirname);
console.log('App path:', app.getAppPath());

let mainWindow = null;
let claudeWrapper = null;

function createWindow() {
  console.log('Creating main window...');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableBlinkFeatures: '',
      disableBlinkFeatures: '',
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  console.log('Is development:', isDev);

  if (isDev) {
    const viteUrl = 'http://localhost:5173';
    console.log('Loading Vite dev server:', viteUrl);
    mainWindow.loadURL(viteUrl);
    mainWindow.webContents.openDevTools();
  } else {
    const htmlPath = path.join(__dirname, '../dist/index.html');
    console.log('Loading production build:', htmlPath);
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.on('closed', () => {
    console.log('Main window closed');
    mainWindow = null;
  });

  // 렌더러 프로세스의 콘솔 로그를 메인 프로세스로 전달
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`);
  });

  console.log('Main window created successfully');
}

app.whenReady().then(() => {
  console.log('App is ready!');
  createWindow();

  app.on('activate', () => {
    console.log('App activated');
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (claudeWrapper) {
    await claudeWrapper.stop();
  }
});

ipcMain.handle('get-config', async () => {
  if (!claudeWrapper) {
    claudeWrapper = new ClaudeWrapper();
  }
  return claudeWrapper.getConfig();
});

ipcMain.handle('save-config', async (event, config) => {
  if (!claudeWrapper) {
    claudeWrapper = new ClaudeWrapper();
  }
  return await claudeWrapper.saveConfig(config);
});

ipcMain.handle('get-status', async () => {
  if (!claudeWrapper) {
    claudeWrapper = new ClaudeWrapper();
  }
  return claudeWrapper.getStatus();
});

ipcMain.handle('get-usage-data', async () => {
  if (!claudeWrapper) {
    claudeWrapper = new ClaudeWrapper();
  }
  return await claudeWrapper.scanUsageData();
});

ipcMain.handle('upload-now', async () => {
  if (!claudeWrapper) {
    claudeWrapper = new ClaudeWrapper();
  }
  return await claudeWrapper.uploadUsageData();
});

ipcMain.handle('get-logs', async () => {
  if (!claudeWrapper) {
    claudeWrapper = new ClaudeWrapper();
  }
  return claudeWrapper.getLogs();
});
