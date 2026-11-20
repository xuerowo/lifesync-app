import { app, BrowserWindow, ipcMain, Menu, safeStorage, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { setupCloudHandlers, setAbortFlag } from './cloudManager.js';
import { createStorage } from './storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


let mainWindow;
let abortLocalSync = false;

// 數據文件路徑
// 設了 LIFESYNC_DATA_DIR（沙盒、測試用）時，資料與 Electron 自己的設定、快取都放進該資料夾，
// 完全不碰安裝版的真實資料。setPath 必須在 app ready 之前呼叫。
const SANDBOX_DATA_DIR = process.env.LIFESYNC_DATA_DIR ? path.resolve(process.env.LIFESYNC_DATA_DIR) : null;
if (SANDBOX_DATA_DIR) {
  app.setPath('userData', path.join(SANDBOX_DATA_DIR, '.electron-userdata'));
}
const DATA_DIR = SANDBOX_DATA_DIR
  ? SANDBOX_DATA_DIR
  : app.isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : path.join(app.getAppPath(), 'data');
const GALLERY_DIR = path.join(DATA_DIR, 'gallery');

// 密碼的加密方式與舊版相同（safeStorage + base64），舊資料可以照常解開。
// safeStorage 要在 app ready 之後才能用；這兩個函式只會在 IPC 呼叫時執行，那時視窗已建立。
const storage = createStorage({
  dataDir: DATA_DIR,
  encrypt: (plainText) => {
    if (!safeStorage.isEncryptionAvailable()) return plainText;
    return safeStorage.encryptString(plainText).toString('base64');
  },
  decrypt: (encryptedBase64) => {
    if (!safeStorage.isEncryptionAvailable()) return encryptedBase64;
    // 解不開時會丟錯，由 storage 保留原本的加密字串
    return safeStorage.decryptString(Buffer.from(encryptedBase64, 'base64'));
  },
});

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function ensureGalleryDir() {
  await ensureDataDir();
  try {
    await fs.access(GALLERY_DIR);
  } catch {
    await fs.mkdir(GALLERY_DIR, { recursive: true });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true, // 自動隱藏選單列（按下 Alt 鍵才會顯示）
    webPreferences: {
      backgroundThrottling: false, // 禁用背景節流，確保番茄鐘在視窗不在焦點時也能持續運行
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'LifeSync',
    icon: path.join(__dirname, '../public/app-icon.png'),
  });

  // 開發環境使用 Vite 開發伺服器，生產環境加載打包後的 index.html
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}


app.whenReady().then(() => {
  // 定義基本的快速鍵選單，保留全螢幕與開發者工具功能
  const template = [
    {
      label: 'View',
      submenu: [
        { role: 'reload', accelerator: 'CmdOrCtrl+R' },
        { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' },
        { role: 'toggleDevTools', accelerator: 'F12' },
        { type: 'separator' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+Plus', visible: false },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+numadd', visible: false },
        { role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
        { role: 'zoomOut', accelerator: 'CmdOrCtrl+numsub', visible: false },
        { role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
        { role: 'resetZoom', accelerator: 'CmdOrCtrl+num0', visible: false },
        { type: 'separator' },
        { role: 'togglefullscreen', accelerator: 'F11' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers (遷移自 server.js) ---

// 註冊雲端處理程序
setupCloudHandlers(ipcMain, { GALLERY_DIR });

// 讀取數據：回傳 { status: 'ok' | 'new' | 'error', ... }
ipcMain.handle('get-data', async () => {
  const result = await storage.load();
  if (result.status === 'error') {
    console.error('[storage] 讀取資料失敗，已停止存檔:', result.code, result.error);
  } else if (result.secretsUnavailable.length > 0) {
    console.warn('[storage] 無法解密的密碼欄位:', result.secretsUnavailable.join(', '));
  }
  return result;
});

// 保存數據（讀檔失敗時會被 storage 擋下並丟錯）
ipcMain.handle('save-data', async (event, data) => {
  return storage.save(data);
});

// 關窗或重新整理前的同步存檔
ipcMain.on('save-data-sync', (event, data) => {
  try {
    storage.saveSync(data);
    event.returnValue = { success: true };
  } catch (e) {
    console.error('[storage] 同步存檔失敗:', e.message);
    event.returnValue = { success: false, error: e.message };
  }
});

// 掃描資料夾
ipcMain.handle('scan-folder', async (event, folderPath) => {
  if (!folderPath) throw new Error('請提供資料夾路徑');
  
  await fs.access(folderPath);
  const files = await fs.readdir(folderPath);
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
  
  const imageFiles = files
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    })
    .map(file => ({
      name: file,
      path: path.join(folderPath, file)
    }));

  return {
    success: true,
    images: imageFiles,
    count: imageFiles.length
  };
});

// 同步圖片到本地資料夾
ipcMain.handle('sync-images', async (event, imagePaths) => {
  try {
    await ensureGalleryDir();
    const syncedImages = [];

    for (const sourcePath of imagePaths) {
      const fileName = path.basename(sourcePath);
      const targetPath = path.join(GALLERY_DIR, fileName);
      
      try {
        await fs.copyFile(sourcePath, targetPath);
        // 返回相對路徑，增加數據的可移植性
        syncedImages.push({
          originalPath: sourcePath,
          path: path.join('gallery', fileName),
          name: fileName
        });
      } catch (copyError) {
        console.error(`[Sync] Failed to copy ${sourcePath}:`, copyError);
      }
    }

    return {
      success: true,
      images: syncedImages,
      count: syncedImages.length
    };
  } catch (error) {
    console.error('[Sync] Error:', error);
    return { success: false, error: error.message };
  }
});

// 備援機制：直接透過 IPC 讀取圖片 Base64
ipcMain.handle('read-image-base64', async (event, filePath) => {
  try {
    let absolutePath = filePath;
    // 如果不是絕對路徑，則認為是相對於 DATA_DIR 的路徑
    if (!path.isAbsolute(filePath)) {
      absolutePath = path.join(DATA_DIR, filePath);
    }

    const ext = path.extname(absolutePath).toLowerCase().replace('.', '');
    const buffer = await fs.readFile(absolutePath);
    const base64 = buffer.toString('base64');
    return `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${base64}`;
  } catch (error) {
    console.error('[IPC Image] Error:', error);
    return null;
  }
});

// --- 完整本地備份 ---

// 選擇目錄
ipcMain.handle('select-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  if (canceled) return null;
  return filePaths[0];
});

// 獲取格式化時間標記 (避免檔案名稱不合法字符)
function getPreciseTimestamp() {
    const now = new Date();
    const Y = now.getFullYear();
    const M = String(now.getMonth() + 1).padStart(2, '0');
    const D = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `${Y}${M}${D}_${h}${m}${s}`;
}

// 修改取消同步的 IPC 處理 (整合雲端與本地)
ipcMain.handle('cloud-cancel-sync', async () => {
    abortLocalSync = true;
    setAbortFlag(true); // 通知雲端管理器
    return { success: true };
});

// 執行完整匯出 (JSON + Gallery)
ipcMain.handle('export-full-backup', async (event, { targetDir, data }) => {
  abortLocalSync = false;
  setAbortFlag(false);
  try {
    const timestamp = getPreciseTimestamp();
    const backupDir = path.join(targetDir, `LifeSync_Backup_${timestamp}`);
    const galleryBackupDir = path.join(backupDir, 'gallery');
    
    await fs.mkdir(galleryBackupDir, { recursive: true });
    
    // 1. 保存 JSON
    await fs.writeFile(path.join(backupDir, 'lifesync-data.json'), JSON.stringify(data, null, 2), 'utf-8');
    
    // 2. 複製圖庫
    try {
      const files = await fs.readdir(GALLERY_DIR);
      const total = files.length;
      for (let i = 0; i < files.length; i++) {
        if (abortLocalSync) break;
        const file = files[i];
        event.sender.send('cloud-progress', { 
            current: i + 1, 
            total, 
            message: `正在備份圖庫: ${file}` 
        });
        await fs.copyFile(path.join(GALLERY_DIR, file), path.join(galleryBackupDir, file));
      }
    } catch {
      console.warn('圖庫為空或無法讀取');
    }
    
    return { success: true, path: backupDir, aborted: abortLocalSync };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// 執行完整還原
ipcMain.handle('import-full-backup', async (event, backupDir) => {
  abortLocalSync = false;
  setAbortFlag(false);
  try {
    const jsonPath = path.join(backupDir, 'lifesync-data.json');
    const gallerySrcDir = path.join(backupDir, 'gallery');
    
    // 1. 讀取 JSON
    const jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
    
    // 2. 恢復圖庫
    await ensureGalleryDir();
    try {
      const files = await fs.readdir(gallerySrcDir);
      const total = files.length;
      for (let i = 0; i < files.length; i++) {
        if (abortLocalSync) break;
        const file = files[i];
        event.sender.send('cloud-progress', { 
            current: i + 1, 
            total, 
            message: `正在還原圖庫: ${file}` 
        });
        await fs.copyFile(path.join(gallerySrcDir, file), path.join(GALLERY_DIR, file));
      }
    } catch {
      console.warn('備份中無圖庫');
    }
    
    return { success: true, data: jsonData, aborted: abortLocalSync };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
