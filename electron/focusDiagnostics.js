// 焦點診斷（主程序這一半）。畫面那一半與完整說明見 src/utils/focusDiagnostics.ts。
// - Ctrl+Shift+F11：開始／停止記錄（設定存在 Electron 設定資料夾的 focus-diagnostics.json，重開程式後維持）
// - Ctrl+Shift+F12：把現在的狀態寫到資料資料夾的 diagnostics\focus-時間.json
// 平常不開；LIFESYNC_DEBUG=1 啟動時一律開啟。
import fs from 'fs';
import path from 'path';

export const SNAPSHOT_TIMEOUT_MS = 10000;
const EVENT_LIMIT = 40;

/** 檔名用的時間：20261121_093012_345 */
export function diagnosticFileStamp(date) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}_${pad(date.getMilliseconds(), 3)}`;
}

/** 讀「要不要記錄」的設定；檔案不存在或壞掉都當作沒開 */
export function readEnabledSetting(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))?.enabled === true;
  } catch {
    return false;
  }
}

/** 各程序的 CPU 用量，只留看得懂、用得到的欄位 */
export function summarizeMetrics(metrics) {
  return (Array.isArray(metrics) ? metrics : []).map((m) => ({
    type: m.type,
    pid: m.pid,
    cpuPercent: m.cpu ? Math.round(m.cpu.percentCPUUsage * 10) / 10 : null,
    memoryMB: m.memory ? Math.round(m.memory.workingSetSize / 1024) : null,
  }));
}

export function createFocusDiagnostics({ app, BrowserWindow, ipcMain, dialog, getWindow, dataDir, settingsFile, forceEnabled }) {
  let enabled = forceEnabled || readEnabledSetting(settingsFile);
  const events = [];
  const record = (type, extra) => {
    if (!enabled) return;
    events.push({ time: new Date().toISOString(), type, ...extra });
    if (events.length > EVENT_LIMIT) events.splice(0, events.length - EVENT_LIMIT);
  };
  const pending = new Map();
  let nextRequestId = 1;

  const isOwnSender = (event) => {
    const win = getWindow();
    return Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
  };

  ipcMain.handle('focus-diagnostics-enabled', (event) => (isOwnSender(event) ? enabled : false));
  ipcMain.on('focus-diagnostics-result', (event, requestId, result) => {
    if (!isOwnSender(event)) return;
    const resolve = pending.get(requestId);
    if (resolve) {
      pending.delete(requestId);
      resolve(result);
    }
  });

  /** 把視窗與頁面的焦點變化記下來（主程序看到的，和畫面看到的可能不同，所以兩邊都記） */
  const attach = (win) => {
    win.on('focus', () => record('window-focus'));
    win.on('blur', () => record('window-blur'));
    win.on('show', () => record('window-show'));
    win.on('minimize', () => record('window-minimize'));
    win.on('restore', () => record('window-restore'));
    win.webContents.on('focus', () => record('page-focus'));
    win.webContents.on('blur', () => record('page-blur'));
  };

  const showInfo = (win, message) => {
    const options = { type: 'info', title: 'LifeSync', message, buttons: ['確定'], defaultId: 0, noLink: true };
    const done = () => {
      if (!win.isDestroyed()) {
        win.focus();
        win.webContents.focus();
      }
    };
    dialog.showMessageBox(win, options).then(done, done);
  };

  const toggle = () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    enabled = !enabled;
    try {
      fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
      fs.writeFileSync(settingsFile, JSON.stringify({ enabled }), 'utf-8');
    } catch (error) {
      console.error('[focus-diagnostics] 無法存設定:', error.message);
    }
    win.webContents.send('focus-diagnostics-toggle', enabled);
    showInfo(
      win,
      enabled
        ? '已開始記錄焦點狀態（之後開程式也會繼續記錄）。\n下次發生「點輸入框沒有游標、打不了字」時，馬上按 Ctrl+Shift+F12。'
        : '已停止記錄焦點狀態。',
    );
  };

  const snapshot = async () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    const contents = win.webContents;
    // 先記主程序看到的狀態（在跳出任何視窗之前）
    const main = {
      time: new Date().toISOString(),
      recording: enabled,
      windowFocused: win.isFocused(),
      pageFocused: contents.isFocused(),
      windowVisible: win.isVisible(),
      windowMinimized: win.isMinimized(),
      focusedWindowIsMain: win === BrowserWindow.getFocusedWindow(),
      devToolsOpened: contents.isDevToolsOpened(),
      devToolsFocused: contents.isDevToolsOpened() ? contents.isDevToolsFocused() : false,
      processes: summarizeMetrics(app.getAppMetrics()),
      gpu: app.getGPUFeatureStatus(),
      recentEvents: events.slice(),
    };
    const requestId = nextRequestId++;
    const startedAt = Date.now();
    const page = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        resolve({ timedOut: true });
      }, SNAPSHOT_TIMEOUT_MS);
      pending.set(requestId, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      contents.send('focus-diagnostics-request', requestId);
    });
    // 畫面多久才回應：很久代表畫面那時正忙（卡住）
    const pageReplyMs = Date.now() - startedAt;
    const file = path.join(dataDir, 'diagnostics', `focus-${diagnosticFileStamp(new Date())}.json`);
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        JSON.stringify({ app: app.getVersion(), electron: process.versions.electron, main, pageReplyMs, page }, null, 2),
        'utf-8',
      );
      showInfo(win, `已記下現在的狀態：\n${file}\n\n請把這個檔案交給開發者。${enabled ? '' : '\n\n（記錄沒有開，內容比較少。可以按 Ctrl+Shift+F11 開啟記錄。）'}`);
    } catch (error) {
      console.error('[focus-diagnostics] 無法寫入:', error.message);
      showInfo(win, `無法寫入診斷檔：${error.message}`);
    }
  };

  // 放進選單（選單列平常隱藏，按 Alt 才會出現），快速鍵在頁面沒有鍵盤焦點時也有效
  const menuItems = [
    { label: '焦點診斷：開始／停止記錄', accelerator: 'CmdOrCtrl+Shift+F11', click: toggle },
    { label: '焦點診斷：記下現在的狀態', accelerator: 'CmdOrCtrl+Shift+F12', click: () => snapshot() },
  ];

  return { attach, menuItems, record, isEnabled: () => enabled };
}
