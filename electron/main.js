import { app, BaseWindow, BrowserWindow, ipcMain, Menu, safeStorage, dialog, session, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { setupCloudHandlers, setAbortFlag } from './cloudManager.js';
import { createStorage } from './storage.js';
import { resolveImageReadPath, copyImageIntoGallery } from './galleryFiles.js';
import { stripCloudSecrets } from '../src/shared/cloudSecrets.js';
import { decideWindowOpen } from './windowOpen.js';
import { setupSingleInstance } from './singleInstance.js';
import { buildMessageBoxOptions, confirmResultFromResponse } from './nativeDialogs.js';

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

// 打包版同時只能開一個程式，第二次開啟時把已開的視窗叫到前面（開發版不限制，原因見 singleInstance.js）。
// 必須在上面換掉 userData 之後才申請：鎖是依 userData 區分的，沙盒才會有自己的一把鎖。
const isPrimaryInstance = setupSingleInstance(app, () => mainWindow);
if (!isPrimaryInstance) {
  // 已經有一個在跑了：這個程序不開視窗、不讀寫資料，直接結束
  app.quit();
}

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

// 打包版載入的頁面
const INDEX_HTML = path.join(__dirname, '../dist/index.html');

/**
 * 主視窗只能停留在程式自己的頁面：
 * 開發時是 Vite 開發伺服器的同一個網站，打包後是本機的 dist/index.html。
 * 重新整理（Ctrl+R）與 Vite 熱更新的整頁重載都是回到同一頁，不受影響。
 */
function isOwnPage(targetUrl) {
  let url;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }
  if (process.env.VITE_DEV_SERVER_URL) {
    try {
      return url.origin === new URL(process.env.VITE_DEV_SERVER_URL).origin;
    } catch {
      return false;
    }
  }
  if (url.protocol !== 'file:') return false;
  try {
    const target = path.resolve(fileURLToPath(url));
    const index = path.resolve(INDEX_HTML);
    return process.platform === 'win32'
      ? target.toLowerCase() === index.toLowerCase()
      : target === index;
  } catch {
    return false;
  }
}

/**
 * 除錯輸出（只在設定 LIFESYNC_DEBUG=1 時啟用）：
 * 把畫面的主控台訊息（含 CSP 違規）、載入失敗，以及載入完成後的畫面概況印到主程序的輸出。
 */
function attachDebugOutput(webContents) {
  webContents.on('console-message', (event) => {
    const { level, message, lineNumber, sourceId } = event;
    console.log(`[debug][console:${level}] ${message}${sourceId ? ` (${sourceId}:${lineNumber})` : ''}`);
  });
  webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.log(`[debug][did-fail-load] ${errorCode} ${errorDescription} ${validatedURL} mainFrame=${isMainFrame}`);
  });
  const printSummary = (label) =>
    webContents
      .executeJavaScript(
        "JSON.stringify({ textLength: document.body.innerText.length, styleTags: document.querySelectorAll('style').length })",
      )
      .then((summary) => console.log(`[debug][${label}] ${summary}`))
      .catch((error) => console.log(`[debug][${label}] executeJavaScript 失敗: ${error.message}`));
  webContents.on('did-finish-load', () => {
    printSummary('did-finish-load');
    // 資料是非同步載入的，幾秒後再看一次實際畫面
    setTimeout(() => {
      if (!webContents.isDestroyed()) printSummary('did-finish-load+3s');
    }, 3000);
  });
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

  // 禁止畫面被導到別的網址（例如把檔案拖進視窗、點到沒開新視窗的外部連結）
  mainWindow.webContents.on('will-navigate', (event, legacyUrl) => {
    const targetUrl = event.url ?? legacyUrl;
    if (!isOwnPage(targetUrl)) {
      event.preventDefault();
      console.warn('[security] 已阻止頁面跳轉:', targetUrl);
    }
  });

  // 攔截所有「開新視窗」（設定頁的外部連結、window.open）：
  // http／https 網址交給系統預設的瀏覽器開，看得到網址；其他一律不開，也從不開新的 Electron 視窗
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const decision = decideWindowOpen(url);
    if (decision.action === 'external') {
      shell.openExternal(decision.url).catch((error) => {
        console.error('[security] 無法用瀏覽器開啟連結:', decision.url, error.message);
      });
    } else {
      console.warn('[security] 已阻止開新視窗:', url);
    }
    return { action: 'deny' };
  });

  // 保險：視窗重新拿到焦點時，一併把鍵盤焦點交給頁面（開發者工具正在用時不搶它的焦點）。
  // 注意：實測「原生 confirm 關掉後頁面沒有焦點」那種狀態，這一行修不好（Electron 以為頁面已有焦點，
  // webContents.focus() 什麼都不做），真正修好的是下面 page-refocus 的做法；這裡只是成本很低的額外保險。
  mainWindow.on('focus', () => {
    const contents = mainWindow?.webContents;
    if (!contents || contents.isDestroyed()) return;
    if (contents.isDevToolsOpened() && contents.isDevToolsFocused()) return;
    contents.focus();
  });

  if (process.env.LIFESYNC_DEBUG === '1') attachDebugOutput(mainWindow.webContents);

  // 開發環境使用 Vite 開發伺服器，生產環境加載打包後的 index.html
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(INDEX_HTML);
  }
}


app.whenReady().then(() => {
  if (!isPrimaryInstance) return;

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

  // 程式沒有用到相機、麥克風、通知、剪貼簿等需要權限的功能，網頁提出的權限要求一律拒絕
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(false);
  });

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
    // 讀檔失敗的錯誤畫面會顯示資料檔放在哪裡，方便使用者自己去看
    return { ...result, dataFile: storage.dataFile, backupDir: storage.backupDir };
  }
  if (result.secretsUnavailable.length > 0) {
    console.warn('[storage] 無法解密的密碼欄位:', result.secretsUnavailable.join(', '));
  }
  return result;
});

// 讀檔失敗時，從 backups\ 裡最近一份可用的自動備份還原。
// 壞掉的資料檔會先改名保留（lifesync-data.corrupt-時間.json），絕不刪除。
// 只有上一次讀檔失敗時才會執行；資料讀得好好的時候會回傳 RESTORE_NOT_ALLOWED，不動任何檔案。
// 回傳和 get-data 相同的格式，另外加上 restoredFrom、restoredFromTime、preservedAs。
ipcMain.handle('restore-latest-backup', async () => {
  try {
    const result = await storage.restoreLatestBackup();
    if (result.status === 'error') {
      console.error('[storage] 從備份還原失敗:', result.code, result.error);
      return { ...result, dataFile: storage.dataFile, backupDir: storage.backupDir };
    }
    console.warn('[storage] 已從備份還原:', result.restoredFrom, '壞檔保留為:', result.preservedAs);
    return result;
  } catch (e) {
    console.error('[storage] 從備份還原失敗:', e.message);
    return {
      status: 'error',
      code: e.code || 'RESTORE_FAILED',
      error: e.message,
      dataFile: storage.dataFile,
      backupDir: storage.backupDir,
    };
  }
});

// 保存數據。失敗時回傳 { success: false, code, error }，不用丟錯：
// 丟錯經過 IPC 之後錯誤碼會不見，畫面就分不出「讀檔失敗而被擋下（SAVE_BLOCKED，不該重試）」和一般的寫入失敗。
ipcMain.handle('save-data', async (event, data) => {
  try {
    return await storage.save(data);
  } catch (e) {
    console.error('[storage] 存檔失敗:', e.code, e.message);
    return { success: false, code: e.code || 'SAVE_FAILED', error: e.message };
  }
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

// 番茄鐘時間到、等使用者按「開始休息／開始專注」：讓工作列的圖示閃爍，提醒回到程式。
// 視窗已經在最前面時不閃；使用者切回視窗時 Windows 會自動停止閃爍，畫面端按下按鈕後也會送 false 停止。
// 只接受布林值，只作用在送出訊息的那個視窗，不做其他事。
ipcMain.on('pomodoro-attention', (event, on) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  if (on === true) {
    if (!win.isFocused()) win.flashFrame(true);
  } else {
    win.flashFrame(false);
  }
});

// 畫面的 alert()／confirm() 改由這裡顯示 Windows 標準訊息框（畫面端在 src/utils/nativeDialogs.js 換掉）。
// 原因：畫面原生的 alert／confirm 關掉後，頁面常會失去鍵盤焦點，點輸入框不出現游標、打不了字。
// 這裡指定父視窗顯示，關掉後把焦點還給視窗與頁面。
// 用非同步的 showMessageBox：畫面端照樣等使用者按完才繼續（sendSync 會等到 returnValue 設好），
// 但主程序不會被卡住，雲端同步等背景工作在訊息框開著時仍會繼續。
// 只接受主視窗、而且是程式自己頁面送來的要求；其他一律當作按了「取消」。
function handleDialogRequest(kind, event, message) {
  const fallback = kind === 'confirm' ? false : undefined;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== mainWindow || win.isDestroyed() || !isOwnPage(event.senderFrame?.url)) {
    console.warn('[security] 已拒絕不明來源的訊息框要求');
    event.returnValue = fallback;
    return;
  }
  dialog
    .showMessageBox(win, buildMessageBoxOptions(kind, message))
    .then(
      ({ response }) => (kind === 'confirm' ? confirmResultFromResponse(response) : undefined),
      (error) => {
        console.error('[dialog] 顯示訊息框失敗:', error.message);
        return fallback;
      },
    )
    .then((result) => {
      // 先把焦點還給頁面，再讓畫面端繼續
      if (!win.isDestroyed()) {
        win.focus();
        win.webContents.focus();
      }
      event.returnValue = result;
    });
}

ipcMain.on('dialog-alert-sync', (event, message) => handleDialogRequest('alert', event, message));
ipcMain.on('dialog-confirm-sync', (event, message) => handleDialogRequest('confirm', event, message));

// 畫面被點了、頁面卻沒有鍵盤焦點（src/utils/focusGuard.js）：讓視窗真的「失去焦點再拿回來」一次。
// 實測（打包版、真的滑鼠點擊）：原生 confirm 關掉後，Windows 的前景視窗是這個視窗，
// Electron 也認為視窗和頁面都有焦點（isFocused() 都是 true），但頁面裡 document.hasFocus() 是 false，
// 點輸入框不出現游標、打字進不去。這時 win.focus()、webContents.focus()、blurWebView() 都沒有用
// （Electron 以為已經有焦點，什麼都不做）；要讓視窗真的換一次焦點才會好。
// 做法：開一個 1×1、透明、不在工作列的小視窗（掛在主視窗底下）拿走焦點，馬上關掉再把焦點還給主視窗。
// 只在程式自己的視窗之間切換，不會動到別的程式（win.blur() 也有效，但會讓別的程式短暫跑到前面，所以不用）。
// 視窗本身不在前面時不做事，不會把視窗搶到前面。
let refocusing = false;
function cycleWindowFocus(win) {
  if (refocusing) return;
  refocusing = true;
  const bounds = win.getBounds();
  let helper = null;
  try {
    helper = new BaseWindow({
      x: bounds.x + 10,
      y: bounds.y + 10,
      width: 1,
      height: 1,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      parent: win,
    });
    helper.show();
    helper.focus();
  } catch (error) {
    console.error('[focus] 無法建立暫時的視窗:', error.message);
  }
  setTimeout(() => {
    refocusing = false;
    if (helper && !helper.isDestroyed()) helper.destroy();
    if (win.isDestroyed()) return;
    win.focus();
    win.webContents.focus();
  }, 30);
}

ipcMain.on('page-refocus', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== mainWindow || win.isDestroyed() || !win.isFocused()) return;
  if (win.webContents.isDevToolsOpened() && win.webContents.isDevToolsFocused()) return;
  if (process.env.LIFESYNC_DEBUG === '1') console.log('[debug][page-refocus] 頁面沒有鍵盤焦點，重新切換一次視窗焦點');
  cycleWindowFocus(win);
});

// 覆蓋本機資料（雲端還原、匯入 JSON、還原完整備份）之前，先在 backups\ 拍一份快照。
// data 是畫面上目前的資料：先存好再拍，快照才不會漏掉最後幾秒的修改。
// 回傳 { success, path?, code?, error? }；失敗時畫面端不可繼續覆蓋。
// code 是錯誤碼（例如 EEXIST、ENOSPC、SNAPSHOT_BLOCKED），畫面用它寫出白話的原因。
ipcMain.handle('snapshot-data', async (event, { reason, data } = {}) => {
  try {
    const snapshotPath = await storage.snapshotCurrent(reason, data);
    return { success: true, path: snapshotPath };
  } catch (e) {
    console.error('[storage] 覆蓋前快照失敗:', e.code, e.message);
    return { success: false, code: e.code || 'SNAPSHOT_FAILED', error: e.message };
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
      try {
        // 同名但內容不同時自動改名，不會蓋掉舊卡池在用的圖片；內容相同就直接沿用
        const { name: fileName } = await copyImageIntoGallery(sourcePath, GALLERY_DIR);
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
  // 只讀圖片檔；相對路徑（圖庫）以資料資料夾為基準，且不能跳出資料資料夾
  const absolutePath = resolveImageReadPath(DATA_DIR, filePath);
  if (!absolutePath) {
    console.warn('[IPC Image] 不允許讀取:', filePath);
    return null;
  }
  try {
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
  // 先寫到「.partial」資料夾，全部完成才改成正式名稱；
  // 中途取消或失敗時保留 .partial 名稱，一看就知道這份備份不完整。
  let partialDir = null;
  try {
    const timestamp = getPreciseTimestamp();
    let finalDir = path.join(targetDir, `LifeSync_Backup_${timestamp}`);
    // 同一秒內重複匯出時，不要和既有的資料夾混在一起
    for (let n = 2; existsSync(finalDir) || existsSync(`${finalDir}.partial`); n++) {
      finalDir = path.join(targetDir, `LifeSync_Backup_${timestamp}_${n}`);
    }
    partialDir = `${finalDir}.partial`;
    const galleryBackupDir = path.join(partialDir, 'gallery');

    await fs.mkdir(galleryBackupDir, { recursive: true });

    // 1. 保存 JSON（不含 WebDAV 密碼與主密碼：備份檔外流時不會連帶洩漏雲端帳號和解密鑰匙）
    await fs.writeFile(path.join(partialDir, 'lifesync-data.json'), JSON.stringify(stripCloudSecrets(data), null, 2), 'utf-8');

    // 2. 複製圖庫（圖庫資料夾不存在＝沒有圖片；複製途中出錯則整份備份視為失敗）
    let files = [];
    try {
      const entries = await fs.readdir(GALLERY_DIR, { withFileTypes: true });
      files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    } catch (readError) {
      if (readError.code !== 'ENOENT') throw readError;
      console.warn('圖庫資料夾不存在，只備份資料檔');
    }
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

    if (abortLocalSync) {
      return { success: true, path: partialDir, aborted: true };
    }

    // 3. 全部完成，改成正式名稱（Windows 上剛寫好的資料夾可能被防毒軟體暫時鎖住，失敗時重試幾次）
    try {
      for (let attempt = 1; ; attempt++) {
        try {
          await fs.rename(partialDir, finalDir);
          break;
        } catch (renameError) {
          const retryable = ['EPERM', 'EACCES', 'EBUSY'].includes(renameError.code);
          if (!retryable || attempt >= 5) throw renameError;
          await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
        }
      }
    } catch (renameError) {
      return {
        success: false,
        path: partialDir,
        error: `備份已寫入「${partialDir}」，但改成正式名稱時失敗：${renameError.message}`,
      };
    }
    return { success: true, path: finalDir, aborted: false };
  } catch (error) {
    const leftPartial = partialDir && existsSync(partialDir);
    return {
      success: false,
      path: leftPartial ? partialDir : null,
      error: leftPartial ? `${error.message}（未完成的備份留在「${partialDir}」）` : error.message,
    };
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
