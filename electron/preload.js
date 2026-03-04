const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getData: () => ipcRenderer.invoke('get-data'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  syncImages: (imagePaths) => ipcRenderer.invoke('sync-images', imagePaths),
  readImageBase64: (filePath) => ipcRenderer.invoke('read-image-base64', filePath),
  encryptString: (plainText) => ipcRenderer.invoke('encrypt-string', plainText),
  decryptString: (encryptedBase64) => ipcRenderer.invoke('decrypt-string', encryptedBase64),
  cloudTestConnection: (config) => ipcRenderer.invoke('cloud-test-connection', config),
  cloudUpload: (payload) => ipcRenderer.invoke('cloud-upload', payload),
  cloudDownload: (payload) => ipcRenderer.invoke('cloud-download', payload),
  cloudSyncGallery: (payload) => ipcRenderer.invoke('cloud-sync-gallery', payload),
  cloudRestoreGallery: (payload) => ipcRenderer.invoke('cloud-restore-gallery', payload),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  exportFullBackup: (payload) => ipcRenderer.invoke('export-full-backup', payload),
  importFullBackup: (backupDir) => ipcRenderer.invoke('import-full-backup', backupDir),
  onCloudProgress: (callback) => ipcRenderer.on('cloud-progress', (event, data) => callback(data)),
  cancelCloudSync: () => ipcRenderer.invoke('cloud-cancel-sync'),
});
