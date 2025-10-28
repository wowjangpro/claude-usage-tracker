import { app, BrowserWindow } from 'electron';

console.log('Electron main process started!');
console.log('App path:', app.getAppPath());
console.log('Node version:', process.version);

app.whenReady().then(() => {
  console.log('App is ready!');

  const win = new BrowserWindow({
    width: 800,
    height: 600,
  });

  win.loadURL('https://www.google.com');
  console.log('Window created and loaded Google');
});

app.on('window-all-closed', () => {
  console.log('All windows closed');
  app.quit();
});
