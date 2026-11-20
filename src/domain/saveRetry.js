/**
 * 存檔失敗（H9）：自動重試的間隔，以及紅色提示要顯示的白話文字。
 * 只處理規則與文字，不碰畫面和檔案，所以可以直接測試。
 */

/** 第 1、2、3…次失敗之後，隔多久自動再試一次；超過的一律用最後一個（每分鐘一次） */
export const SAVE_RETRY_DELAYS_MS = [2000, 5000, 10000, 30000, 60000];

/** 主程序因為「資料沒有成功載入」而拒絕存檔。這種情況重試也沒用，不自動重試 */
export const SAVE_BLOCKED = 'SAVE_BLOCKED';

/**
 * 連續失敗 failureCount 次之後，下一次自動重試要等多久（毫秒）。
 * @param {number} failureCount 從 1 開始
 */
export function saveRetryDelay(failureCount) {
  const n = Number.isFinite(failureCount) ? Math.floor(failureCount) : 1;
  const index = Math.min(Math.max(n, 1), SAVE_RETRY_DELAYS_MS.length) - 1;
  return SAVE_RETRY_DELAYS_MS[index];
}

/**
 * 主程序 save-data 的回傳值：成功是 { success: true }，失敗是 { success: false, code, error }。
 * 失敗時回傳一個帶 code 的 Error（給呼叫端丟出），成功時回傳 null。
 */
export function saveResultError(res) {
  if (!res || res.success !== false) return null;
  return Object.assign(new Error(res.error || '存檔失敗'), { code: res.code || 'SAVE_FAILED' });
}

/**
 * 把一次存檔失敗整理成要記下的狀態。
 * @param {unknown} error 丟出來的錯誤
 * @param {number} failureCount 包含這一次，連續失敗了幾次
 * @param {Date} [now]
 * @returns {{ code: string, error: string, blocked: boolean, failures: number, retryInMs: number|null, at: string }}
 *   blocked：存檔被主程序擋下（不自動重試）；retryInMs：多久後自動重試，blocked 時是 null
 */
export function toSaveFailure(error, failureCount, now = new Date()) {
  const code = (error && typeof error === 'object' && error.code) || 'SAVE_FAILED';
  const message = (error && typeof error === 'object' && error.message) || String(error || '存檔失敗');
  const blocked = code === SAVE_BLOCKED;
  return {
    code,
    error: message,
    blocked,
    failures: failureCount,
    retryInMs: blocked ? null : saveRetryDelay(failureCount),
    at: now.toISOString(),
  };
}

/** 常見錯誤碼的白話原因 */
function plainReason(code) {
  if (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') {
    return '資料檔被別的程式鎖住，或沒有寫入的權限（例如防毒軟體、雲端硬碟同步軟體正在處理它）。';
  }
  if (code === 'ENOSPC') return '硬碟空間不足。';
  if (code === 'EROFS') return '資料所在的磁碟是唯讀的，不能寫入。';
  if (code === 'SERVER_UNREACHABLE') return '連不到資料伺服器（瀏覽器模式下負責存檔的 server.js），它可能已經關掉了。';
  if (code.startsWith('HTTP_')) return '資料伺服器（瀏覽器模式下負責存檔的 server.js）回報錯誤。';
  return null;
}

const formatSeconds = (ms) => `${Math.round(ms / 1000)} 秒`;

/**
 * 紅色提示的文字。
 * @param {ReturnType<typeof toSaveFailure>} saveError
 * @returns {{ title: string, lines: string[], canRetry: boolean }}
 */
export function describeSaveError(saveError) {
  if (!saveError) return null;
  if (saveError.blocked) {
    return {
      title: '存檔已暫停，最近的修改沒有存到',
      lines: [
        '程式沒有成功讀到硬碟上的資料檔，為了不蓋掉它，暫停了存檔。',
        '請關閉程式再重新開啟；如果還是讀不出來，會出現讀檔失敗的畫面讓你處理。',
      ],
      canRetry: false,
    };
  }
  const reason = plainReason(saveError.code);
  return {
    title: '最近的修改還沒有存到硬碟',
    lines: [
      reason ? `原因：${reason}` : '存檔時發生錯誤。',
      `程式會自動再試${saveError.retryInMs ? `（約 ${formatSeconds(saveError.retryInMs)}後）` : ''}，存好之後這則提示會自己消失。存好之前，請先不要關閉程式。`,
    ],
    canRetry: true,
  };
}
