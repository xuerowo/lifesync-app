// 在 Electron 裡把 window.alert／window.confirm 換成由主程序顯示的 Windows 標準訊息框。
//
// 原因：Electron 在 Windows 上，畫面原生的 alert／confirm 關掉之後，頁面常會失去鍵盤焦點，
// 點輸入框不會出現游標、打不了字，要切到別的視窗再切回來才恢復。
// 主程序那邊（electron/main.js 的 dialog-alert-sync／dialog-confirm-sync）會指定父視窗顯示，
// 關掉後再把焦點還給頁面。呼叫端照舊寫 alert(...)／confirm(...)，不用改。
// 瀏覽器模式（沒有 electronAPI）維持瀏覽器原本的對話框。

import type { ElectronAPI } from '../types/electronApi.ts';

/** 換掉 alert／confirm 需要的 api */
type DialogApi = Pick<ElectronAPI, 'alertSync' | 'confirmSync'>;

/** 照瀏覽器的規則把參數轉成字串：沒給或 undefined 是空字串，其他（含 null）用 String() 轉 */
export function toDialogText(message?: unknown): string {
  return message === undefined ? '' : String(message);
}

/** 用 preload 提供的 api 做出 alert／confirm 的替代品（純函式，方便測試） */
export function createNativeDialogs(api: DialogApi): { alert(message?: unknown): void; confirm(message?: unknown): boolean } {
  return {
    alert(message) {
      api.alertSync(toDialogText(message));
    },
    confirm(message) {
      return api.confirmSync(toDialogText(message)) === true;
    },
  };
}

/** 換掉 alert／confirm 用得到的部分（window 符合） */
export interface NativeDialogTarget {
  electronAPI?: Partial<DialogApi>;
  alert: (message?: unknown) => void;
  confirm: (message?: unknown) => boolean;
}

/** 有 Electron 的 api 時換掉 target（通常是 window）的 alert／confirm；回傳有沒有換 */
export function installNativeDialogs(target: NativeDialogTarget | null | undefined): boolean {
  const api = target?.electronAPI;
  if (!target || !api || typeof api.confirmSync !== 'function' || typeof api.alertSync !== 'function') return false;
  // 上一行已經確認兩個函式都有
  const { alert, confirm } = createNativeDialogs(api as DialogApi);
  target.alert = alert;
  target.confirm = confirm;
  return true;
}
