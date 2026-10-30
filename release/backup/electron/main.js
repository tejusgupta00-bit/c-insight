import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startInteractiveSession, writeSessionInput, endSessionInput, cancelSession } from '../server/interactive-run.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    title: 'C-Insight: The Visual Static Analyzer',
    backgroundColor: '#0b0e14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function push(win, payload) {
  if (win && !win.isDestroyed()) win.webContents.send('compile-run:event', payload);
}

app.whenReady().then(() => {
  ipcMain.handle('compile-run:start', async (event, source) => {
    if (typeof source !== 'string') throw new Error('Source must be a string.');
    const win = BrowserWindow.fromWebContents(event.sender);

    let currentId = null;
    const tag = (payload) => ({ ...payload, id: currentId });

    const id = await startInteractiveSession(source, {
      onSession: sid => {
        currentId = sid;
        push(win, { id: sid, type: 'session', sessionId: sid });
      },
      onStdout: text => push(win, tag({ type: 'stdout', text })),
      onStderr: text => push(win, tag({ type: 'stderr', text })),
      onCompileWarning: diagnostics => push(win, tag({ type: 'compile-warning', diagnostics })),
      onCompileError: result => push(win, tag({ type: 'compile-error', ...result })),
      onExit: result => push(win, tag({ type: 'exit', ...result })),
      onError: message => push(win, tag({ type: 'error', message }))
    });

    if (!id) return { id: null };
    currentId = currentId || id;
    return { id };
  });

  ipcMain.handle('compile-run:input', async (_e, id, data, end) => {
    const str = typeof data === 'string' ? data : '';
    if (end) {
      if (str) writeSessionInput(id, str);
      return endSessionInput(id);
    }
    return writeSessionInput(id, str);
  });
  ipcMain.handle('compile-run:cancel', async (_e, id) => cancelSession(id));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});