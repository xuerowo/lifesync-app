// 雲端（WebDAV）與檔案錯誤的白話說明（docs/wording-review.md「雲端、檔案錯誤直接顯示英文」）。
//
// 主程序（electron/cloudManager.js、electron/main.js）、瀏覽器模式的 server.js 和畫面都用這一份：
// 這裡不 import 任何 Node 或瀏覽器專用的東西，只處理文字，所以可以直接測試。
//
// 認得的錯誤：白話說明＋下一步在前，英文原文接在後面當「技術細節」，方便查問題；
// 認不出來的錯誤原樣顯示，不會把原文吃掉。
//
// 錯誤可能是 Error、帶 code／status 的物件、已經變成文字的訊息，或任何東西，所以參數一律是 unknown。

/** 讀 value 的某個欄位，等同 JS 的 value?.[key]（null、undefined 回傳 undefined；字串、數字照 JS 規則讀） */
const fieldOf = (value: unknown, key: string): unknown =>
  value === null || value === undefined ? undefined : (value as Record<string, unknown>)[key]; // 只讀欄位，不是物件時 JS 會自動包裝，結果和 ?. 相同

/** 雲端錯誤的情境：測試連線、上傳、下載、上傳圖庫、下載圖庫 */
export type CloudErrorAction = 'test' | 'upload' | 'download' | 'gallery-upload' | 'gallery-download';

/** 檔案錯誤的情境：掃描圖片資料夾、還原完整備份、匯出完整備份 */
export type FileErrorAction = 'scan-folder' | 'restore-backup' | 'export-backup';

/** 連不上伺服器時常見的錯誤碼（DNS 查不到、被拒絕、逾時、網路斷線） */
const NETWORK_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'ESOCKETTIMEDOUT',
  'ENETUNREACH', 'ENETDOWN', 'EHOSTUNREACH', 'EHOSTDOWN', 'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
]);

/** 安全憑證有問題時的錯誤碼（過期、自簽、網域不符等） */
const CERT_CODE = /^(CERT_|UNABLE_TO_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT|ERR_TLS_CERT|ERR_SSL_)/;

/** 錯誤物件或文字的原文；什麼都沒有時是空字串 */
export function rawErrorText(error: unknown): string {
  if (error === null || error === undefined) return '';
  if (typeof error === 'string') return error;
  const message = fieldOf(error, 'message');
  // message 照理一定是字串；萬一是別的東西（例如數字），轉成文字（顯示出來的內容和原本相同）
  return message ? String(message) : String(error);
}

/**
 * HTTP 狀態碼：webdav 套件丟出的錯誤帶有 status，訊息是「Invalid response: 401 Unauthorized」。
 * 經過主程序傳到畫面後只剩文字，所以也從文字裡找（只認這個固定格式，免得把網址裡的 :443 當成狀態碼）。
 */
export function httpStatusOf(error: unknown): number | null {
  const status = Number(fieldOf(error, 'status') ?? fieldOf(fieldOf(error, 'response'), 'status'));
  if (Number.isInteger(status) && status >= 100 && status < 600) return status;
  const m = /Invalid response: (\d{3})\b/.exec(rawErrorText(error));
  return m ? Number(m[1]) : null;
}

/**
 * Node 的錯誤碼（ENOENT、ENOTFOUND……）：先看錯誤物件本身與 cause，再從文字裡找。
 */
export function errorCodeOf(error: unknown): string | null {
  if (error && typeof error === 'object') {
    const code = fieldOf(error, 'code') || fieldOf(fieldOf(error, 'cause'), 'code');
    if (typeof code === 'string' && code) return code;
  }
  const m =
    /\b(E[A-Z]{3,}|ERR_[A-Z_]+|CERT_[A-Z_]+|UNABLE_TO_[A-Z_]+|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UND_ERR_[A-Z_]+)\b/.exec(
      rawErrorText(error)
    );
  return m ? m[1] : null;
}

/** 白話說明＋技術細節；沒有白話說明時原樣回傳原文 */
function withDetail(reason: string | null, error: unknown): string {
  const raw = rawErrorText(error) || '未知的錯誤';
  return reason ? `${reason}\n（技術細節：${raw}）` : raw;
}

/**
 * 雲端錯誤的白話說明（含下一步）；認不出來時回傳 null。
 * @param error 錯誤物件，或已經變成文字的錯誤訊息
 * @param options.action 正在做什麼。同樣是 404，下載時代表「雲端上還沒有備份」，其他時候多半是網址打錯
 */
export function cloudErrorReason(error: unknown, { action }: { action?: CloudErrorAction } = {}): string | null {
  const raw = rawErrorText(error);
  const status = httpStatusOf(error);
  if (status === 401) {
    return '帳號或應用程式密碼錯誤。請確認「使用者名稱」和「應用程式密碼」（要用在雲端服務網站建立的應用程式密碼，不是你的登入密碼）。';
  }
  if (status === 403) {
    return '雲端伺服器拒絕了這次存取。請確認網址指到的是你有權限的資料夾，以及應用程式密碼有讀寫權限。';
  }
  if (status === 404) {
    if (action === 'download') {
      return '雲端上還沒有備份，請先在另一台電腦按「上傳到雲端」。如果已經上傳過，請確認兩台電腦的「WebDAV 伺服器網址」一樣。';
    }
    if (action === 'gallery-download') {
      return '雲端上還沒有圖庫，請先在另一台電腦按「上傳圖庫」。如果已經上傳過，請確認兩台電腦的「WebDAV 伺服器網址」一樣。';
    }
    return '雲端上找不到這個位置，請確認「WebDAV 伺服器網址」有沒有打錯。';
  }
  if (status === 405) return '這個網址不是 WebDAV 的位置，請確認「WebDAV 伺服器網址」有沒有打錯。';
  if (status === 409) return '雲端上找不到要存放的資料夾，請確認「WebDAV 伺服器網址」有沒有打錯。';
  if (status === 507) return '雲端空間不足。請到雲端服務網站清出一些空間再試。';
  if (status !== null && status >= 500) return '雲端伺服器暫時出問題，請稍後再試。';

  const code = errorCodeOf(error);
  if (code && CERT_CODE.test(code)) {
    return '伺服器的安全憑證有問題，為了安全沒有連上。請確認網址是否正確。';
  }
  if (code === 'ERR_INVALID_URL' || /Invalid URL/i.test(raw)) {
    return '網址格式不對，請確認「WebDAV 伺服器網址」（要以 https:// 開頭）。';
  }
  if ((code && NETWORK_CODES.has(code)) || /fetch failed|network|socket hang up|timed? ?out/i.test(raw)) {
    return '連不上伺服器，請檢查網址和網路。';
  }
  return null;
}

/**
 * 雲端錯誤要給使用者看的完整文字：白話說明在前，英文原文當「技術細節」接在後面。
 */
export function describeCloudError(error: unknown, options?: Parameters<typeof cloudErrorReason>[1]): string {
  return withDetail(cloudErrorReason(error, options), error);
}

/** 還原完整備份時，資料檔打得開，但內容不是 LifeSync 的資料（選錯資料夾，或檔案被換掉） */
export const NOT_LIFESYNC_BACKUP_MESSAGE =
  '這個資料夾裡的 lifesync-data.json 不是 LifeSync 的資料，可能選錯了資料夾。請選擇匯出時建立的「LifeSync_Backup_日期_時間」資料夾。';

/**
 * 檔案、資料夾錯誤的白話說明（含下一步）；認不出來時回傳 null。
 * @param options.action restore-backup：還原完整備份。找不到資料檔代表選錯資料夾，而不是資料夾不存在
 */
export function fileErrorReason(error: unknown, { action }: { action?: FileErrorAction } = {}): string | null {
  const code = errorCodeOf(error);
  if (action === 'restore-backup') {
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return '這個資料夾不是 LifeSync 的完整備份（裡面沒有 lifesync-data.json）。請選擇匯出時建立的「LifeSync_Backup_日期_時間」資料夾。';
    }
    if (error instanceof SyntaxError || fieldOf(error, 'name') === 'SyntaxError') {
      return '備份裡的資料檔（lifesync-data.json）壞掉了，打不開。請改用另一份備份。';
    }
  }
  if (code === 'ENOENT') return '找不到這個資料夾，請確認路徑。';
  if (code === 'ENOTDIR') return '這個路徑不是資料夾，請確認路徑。';
  if (code === 'EACCES' || code === 'EPERM') {
    return '沒有權限讀寫這個資料夾，或檔案正被別的程式（例如防毒軟體、雲端硬碟同步軟體）使用中。可以換一個資料夾再試。';
  }
  if (code === 'EBUSY') return '檔案正被別的程式使用中，請等一下再試。';
  if (code === 'ENOSPC') return '磁碟空間不足，請先清出一些空間再試。';
  return null;
}

/**
 * 檔案、資料夾錯誤要給使用者看的完整文字（格式同 describeCloudError）。
 */
export function describeFileError(error: unknown, options?: Parameters<typeof fileErrorReason>[1]): string {
  return withDetail(fileErrorReason(error, options), error);
}
