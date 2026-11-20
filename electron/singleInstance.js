// 同時只能開一個程式（H10）。不 import electron，讓它能在 Vitest 中用假的 app 測試。
//
// 只有打包版（安裝版、可攜版）才限制：開發版和安裝版共用同一個 Electron 設定資料夾（userData），
// 開發版如果也搶這把鎖，安裝版開著時就開不了開發版（反之亦然）。
// 這把鎖是依 userData 資料夾區分的；設了 LIFESYNC_DATA_DIR（沙盒）時 userData 會換到沙盒裡，
// 所以沙盒裡的打包版有自己的一把鎖，不會和平常用的安裝版互相擋住。
// 因此必須在 app.setPath('userData', …) 之後才呼叫。

/** 是否要限制只能開一個 */
export function shouldUseSingleInstanceLock(isPackaged) {
  return Boolean(isPackaged);
}

/** 把已經開著的視窗叫到最前面（最小化就先還原） */
export function focusWindow(win) {
  if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return false;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return true;
}

/**
 * 申請「只能開一個」的鎖。
 * @param {object} app Electron 的 app
 * @param {() => object|null|undefined} getWindow 取得目前的主視窗
 * @returns {boolean} true：這個程序可以繼續啟動；false：已經有一個在跑了，這個程序要結束
 */
export function setupSingleInstance(app, getWindow) {
  if (!shouldUseSingleInstanceLock(app.isPackaged)) return true;
  if (!app.requestSingleInstanceLock()) return false;
  // 有人再開一次時，不另外開視窗，改把原本的視窗叫到前面
  app.on('second-instance', () => {
    focusWindow(getWindow());
  });
  return true;
}
