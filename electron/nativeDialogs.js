// 畫面的 alert()／confirm() 改由主程序顯示 Windows 標準訊息框時，用來組訊息框設定的純函式（方便測試）。
//
// 為什麼不用畫面自己的 alert／confirm：Electron 在 Windows 上有個老問題，
// 畫面原生的 alert／confirm 關掉之後，頁面常會失去鍵盤焦點，點輸入框不會出現游標、打不了字，
// 要切到別的視窗再切回來才恢復。改成由主程序顯示、指定父視窗，關掉後再把焦點還給頁面，就不會發生。
// 詳見 docs/decisions.md「畫面不要直接用 alert／confirm」。

export const DIALOG_TITLE = 'LifeSync';

// 訊息太長時截斷：避免異常資料撐出超出螢幕、按鈕按不到的訊息框
export const MAX_DIALOG_MESSAGE_LENGTH = 4000;

/** 把畫面傳來的訊息轉成字串並限制長度；undefined／null 視為空字串（畫面端已先照瀏覽器規則轉好字串） */
export function normalizeDialogMessage(message) {
  let text;
  if (typeof message === 'string') {
    text = message;
  } else if (message === undefined || message === null) {
    text = '';
  } else {
    try {
      text = String(message);
    } catch {
      text = '';
    }
  }
  if (text.length > MAX_DIALOG_MESSAGE_LENGTH) {
    text = `${text.slice(0, MAX_DIALOG_MESSAGE_LENGTH)}…`;
  }
  return text;
}

/**
 * 組出 dialog.showMessageBox 的設定。
 * kind 為 'alert'（只有「確定」）或 'confirm'（「確定」「取消」，按 Esc 或關閉鈕等於取消）。
 */
export function buildMessageBoxOptions(kind, message) {
  const base = {
    title: DIALOG_TITLE,
    message: normalizeDialogMessage(message),
    defaultId: 0,
    // 按鈕照原樣顯示，不要被 Windows 改成大型「命令連結」樣式
    noLink: true,
  };
  if (kind === 'confirm') {
    return { ...base, type: 'question', buttons: ['確定', '取消'], cancelId: 1 };
  }
  return { ...base, type: 'info', buttons: ['確定'] };
}

/** 把訊息框按下的按鈕編號換成 confirm() 的回傳值：只有按「確定」（編號 0）才是 true */
export function confirmResultFromResponse(response) {
  return response === 0;
}
