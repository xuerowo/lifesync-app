// 注意：此檔會建置成 CommonJS，並在沙盒（sandbox）中執行，只能使用 require，請勿改用 import。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 回傳 { status: 'ok' | 'new' | 'error', data?, secretsUnavailable?, code?, error? }
  getData: () => ipcRenderer.invoke('get-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  // 關窗或重新整理前使用：同步等到寫入完成，回傳 { success, error? }
  saveDataSync: (data) => ipcRenderer.sendSync('save-data-sync', data),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  syncImages: (imagePaths) => ipcRenderer.invoke('sync-images', imagePaths),
  readImageBase64: (filePath) => ipcRenderer.invoke('read-image-base64', filePath),
  cloudTestConnection: (config) => ipcRenderer.invoke('cloud-test-connection', config),
  cloudUpload: (payload) => ipcRenderer.invoke('cloud-upload', payload),
  cloudDownload: (payload) => ipcRenderer.invoke('cloud-download', payload),
  cloudSyncGallery: (payload) => ipcRenderer.invoke('cloud-sync-gallery', payload),
  cloudRestoreGallery: (payload) => ipcRenderer.invoke('cloud-restore-gallery', payload),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  exportFullBackup: (payload) => ipcRenderer.invoke('export-full-backup', payload),
  importFullBackup: (backupDir) => ipcRenderer.invoke('import-full-backup', backupDir),
  // 回傳取消監聽的函式；畫面卸載（或開發模式重跑 effect）時呼叫，監聽才不會越積越多
  onCloudProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('cloud-progress', handler);
    return () => ipcRenderer.removeListener('cloud-progress', handler);
  },
  cancelCloudSync: () => ipcRenderer.invoke('cloud-cancel-sync'),
});
