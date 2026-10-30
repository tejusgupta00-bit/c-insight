const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cinsight', {
  isDesktop: true,
  startCompileRun: (source) => ipcRenderer.invoke('compile-run:start', source),
  writeCompileRunInput: (id, data, end) => ipcRenderer.invoke('compile-run:input', id, data, end === true),
  cancelCompileRun: (id) => ipcRenderer.invoke('compile-run:cancel', id),
  onCompileRunEvent: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('compile-run:event', handler);
    return () => ipcRenderer.removeListener('compile-run:event', handler);
  }
});