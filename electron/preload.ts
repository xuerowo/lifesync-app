// 注意：此檔會在沙盒（sandbox）中執行，只能使用 require，請勿改用 import。
// （建置時保留這行 require 原樣輸出；改成 import 會被輸出成 ES 模組的 import，沙盒裡的 preload 不支援，視窗會拿不到 electronAPI。
//  下面的 import type 只是型別，建置時整行刪掉，不會出現在輸出裡。）
//
// 提供給畫面的功能照 src/types/electronApi.ts 的 ElectronAPI 實作：少一個、多一個或格式不對，型別檢查都會報錯。
import type { ContextBridge, IpcRenderer, IpcRendererEvent } from 'electron';
import type { CloudProgress, ElectronAPI } from '../src/types/electronApi.ts';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- 原因見檔案開頭
const { contextBridge, ipcRenderer }: { contextBridge: ContextBridge; ipcRenderer: IpcRenderer } = require('electron');

const electronAPI: ElectronAPI = {
  // 回傳 { status: 'ok' | 'new' | 'error', data?, secretsUnavailable?, code?, error? }
  getData: () => ipcRenderer.invoke('get-data'),
  // 讀檔失敗時用：從最近一份自動備份還原（壞檔會改名保留），回傳格式同 getData，另有 restoredFrom、preservedAs
  restoreLatestBackup: () => ipcRenderer.invoke('restore-latest-backup'),
  // 回傳 { success: true } 或 { success: false, code, error }（code 為 SAVE_BLOCKED 時表示讀檔失敗而被擋下）
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  // 關窗或重新整理前使用：同步等到寫入完成，回傳 { success, error? }
  saveDataSync: (data) => ipcRenderer.sendSync('save-data-sync', data),
  // 覆蓋本機資料前先存好目前資料並拍快照，回傳 { success, path?, error? }
  snapshotData: (payload) => ipcRenderer.invoke('snapshot-data', payload),
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
    const handler = (event: IpcRendererEvent, data: CloudProgress) => callback(data);
    ipcRenderer.on('cloud-progress', handler);
    return () => ipcRenderer.removeListener('cloud-progress', handler);
  },
  cancelCloudSync: () => ipcRenderer.invoke('cloud-cancel-sync'),
  // 番茄鐘時間到、等你按按鈕時：true 讓工作列圖示閃爍（視窗已在前面就不閃），false 停止閃爍
  setAttention: (on) => ipcRenderer.send('pomodoro-attention', on === true),
  // 取代畫面的 alert()／confirm()：由主程序顯示 Windows 標準訊息框，等使用者按完才回傳
  // （畫面原生的訊息框關掉後頁面常會失去鍵盤焦點，詳見 src/utils/nativeDialogs.ts）
  alertSync: (message) => {
    ipcRenderer.sendSync('dialog-alert-sync', String(message ?? ''));
  },
  confirmSync: (message) => ipcRenderer.sendSync('dialog-confirm-sync', String(message ?? '')) === true,
  // 點了畫面、頁面卻沒有鍵盤焦點時呼叫：請主程序把鍵盤焦點交回頁面（見 src/utils/focusGuard.ts）
  refocusPage: () => ipcRenderer.send('page-refocus'),
  // 焦點診斷（見 src/utils/focusDiagnostics.ts）：記錄有沒有開、開關切換、主程序要狀態時回傳
  isFocusDiagnosticsEnabled: () => ipcRenderer.invoke('focus-diagnostics-enabled'),
  onFocusDiagnosticsToggle: (callback) => {
    const handler = (event: IpcRendererEvent, enabled: unknown) => callback(enabled === true);
    ipcRenderer.on('focus-diagnostics-toggle', handler);
    return () => ipcRenderer.removeListener('focus-diagnostics-toggle', handler);
  },
  onFocusDiagnosticsRequest: (callback) => {
    const handler = (event: IpcRendererEvent, requestId: number) => callback(requestId);
    ipcRenderer.on('focus-diagnostics-request', handler);
    return () => ipcRenderer.removeListener('focus-diagnostics-request', handler);
  },
  sendFocusDiagnostics: (requestId, result) => ipcRenderer.send('focus-diagnostics-result', requestId, result),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
