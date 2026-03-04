import { app, BrowserWindow, ipcMain, protocol, Menu, net, safeStorage, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { setupCloudHandlers, setAbortFlag } from './cloudManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


let mainWindow;
let abortLocalSync = false;

// 數據文件路徑
const DATA_DIR = path.join(app.getAppPath(), 'data');
const GALLERY_DIR = path.join(DATA_DIR, 'gallery');
const DATA_FILE = path.join(DATA_DIR, 'lifesync-data.json');

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

// 讀取數據
ipcMain.handle('get-data', async () => {
  try {
    await ensureDataDir();
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        goals: { learning: [], health: [], happiness: [] },
        majorTasks: [],
        subTasks: [],
        archivedTasks: [],
        archivedSubTasks: [],
        rewardFolderPath: '',
        lotteryPrizes: { N: [], R: [], SR: [], SSR: [], UR: [] },
        lotteryProbability: { N: 50, R: 25, SR: 15, SSR: 8, UR: 2 },
        rewardHistory: [],
        archivedGoals: [],
        achievements: [],
        notes: [],
        rules: [],
        pomodoroHistory: [],
        lotteryTickets: 0,
        taskHistory: []
      };
    }
    throw error;
  }
});

// 保存數據
ipcMain.handle('save-data', async (event, data) => {
  await ensureDataDir();
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  return { success: true };
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

// 安全存儲加密
ipcMain.handle('encrypt-string', async (event, plainText) => {
  if (!safeStorage.isEncryptionAvailable()) return plainText;
  return safeStorage.encryptString(plainText).toString('base64');
});

// 安全存儲解密
ipcMain.handle('decrypt-string', async (event, encryptedBase64) => {
  if (!safeStorage.isEncryptionAvailable()) return encryptedBase64;
  try {
    const buffer = Buffer.from(encryptedBase64, 'base64');
    return safeStorage.decryptString(buffer);
  } catch (e) {
    console.error('解密失敗:', e);
    return '';
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
    } catch (e) {
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
    } catch (e) {
      console.warn('備份中無圖庫');
    }
    
    return { success: true, data: jsonData, aborted: abortLocalSync };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
