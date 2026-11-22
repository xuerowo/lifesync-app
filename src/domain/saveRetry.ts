/**
 * 存檔失敗（H9）：自動重試的間隔，以及紅色提示要顯示的白話文字。
 * 只處理規則與文字，不碰畫面和檔案，所以可以直接測試。
 */

import type { SaveResult } from '../types/electronApi.ts';

/** 存檔失敗時記下的狀態（toSaveFailure 產生） */
export interface SaveFailure {
  code: string;
  error: string;
  /** 存檔被主程序擋下（不自動重試） */
  blocked: boolean;
  /** 包含這一次，連續失敗了幾次 */
  failures: number;
  /** 多久後自動重試（毫秒）；blocked 時是 null */
  retryInMs: number | null;
  at: string;
}

/** 紅色提示的文字 */
export interface SaveErrorText {
  title: string;
  lines: string[];
  canRetry: boolean;
}

/** 第 1、2、3…次失敗之後，隔多久自動再試一次；超過的一律用最後一個（每分鐘一次） */
export const SAVE_RETRY_DELAYS_MS = [2000, 5000, 10000, 30000, 60000];

/** 主程序因為「資料沒有成功載入」而拒絕存檔。這種情況重試也沒用，不自動重試 */
export const SAVE_BLOCKED = 'SAVE_BLOCKED';

/**
 * 連續失敗 failureCount 次之後，下一次自動重試要等多久（毫秒）。
 * @param failureCount 從 1 開始
 */
export function saveRetryDelay(failureCount: number): number {
  const n = Number.isFinite(failureCount) ? Math.floor(failureCount) : 1;
  const index = Math.min(Math.max(n, 1), SAVE_RETRY_DELAYS_MS.length) - 1;
  return SAVE_RETRY_DELAYS_MS[index];
}

/**
 * 主程序 save-data 的回傳值：成功是 { success: true }，失敗是 { success: false, code, error }。
 * 失敗時回傳一個帶 code 的 Error（給呼叫端丟出），成功時回傳 null。
 */
export function saveResultError(
  res: SaveResult | { success?: boolean; code?: string; error?: string } | null | undefined,
): (Error & { code: string }) | null {
  if (!res || res.success !== false) return null;
  const failed: { code?: string; error?: string } = res;
  return Object.assign(new Error(failed.error || '存檔失敗'), { code: failed.code || 'SAVE_FAILED' });
}

/**
 * 把一次存檔失敗整理成要記下的狀態。
 * @param error 丟出來的錯誤
 * @param failureCount 包含這一次，連續失敗了幾次
 */
export function toSaveFailure(error: unknown, failureCount: number, now: Date = new Date()): SaveFailure {
  // 錯誤物件的 code、message 照理是字串；萬一不是，和原本的 JS 一樣原樣記下（下面的 as string 只是型別上的說法）
  const fields = error as { code?: unknown; message?: unknown };
  const code = ((error && typeof error === 'object' && fields.code) || 'SAVE_FAILED') as string;
  const message = ((error && typeof error === 'object' && fields.message) || String(error || '存檔失敗')) as string;
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
function plainReason(code: string): string | null {
  if (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') {
    return '資料檔被別的程式鎖住，或沒有寫入的權限（例如防毒軟體、雲端硬碟同步軟體正在處理它）。';
  }
  if (code === 'ENOSPC') return '硬碟空間不足。';
  if (code === 'EROFS') return '資料所在的磁碟是唯讀的，不能寫入。';
  if (code === 'SERVER_UNREACHABLE') return '連不到資料伺服器（瀏覽器模式下負責存檔的 server.js），它可能已經關掉了。';
  if (code.startsWith('HTTP_')) return '資料伺服器（瀏覽器模式下負責存檔的 server.js）回報錯誤。';
  return null;
}

const formatSeconds = (ms: number) => `${Math.round(ms / 1000)} 秒`;

/**
 * 紅色提示的文字。
 * 沒有錯誤時回傳 null
 */
export function describeSaveError(saveError: SaveFailure | null | undefined): SaveErrorText | null {
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
