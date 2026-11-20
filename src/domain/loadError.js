/**
 * 讀檔失敗畫面（H8）與啟動提示用的白話文字。
 * 只處理文字，不碰畫面和檔案，所以可以直接測試。
 */

/** 檔案暫時被別的程式鎖住、或沒有權限時的錯誤碼（Windows 上常見於防毒、雲端硬碟同步軟體） */
const LOCKED_CODES = new Set(['EBUSY', 'EPERM', 'EACCES']);

const pad = (n) => String(n).padStart(2, '0');

/** 把 ISO 時間轉成本地時間「2026/11/20 09:30」；看不懂就回傳 null */
export function formatLocalDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 只取完整路徑最後的檔名（Windows 與其他系統的路徑都適用） */
export function baseName(fullPath) {
  if (!fullPath) return '';
  const parts = String(fullPath).split(/[\\/]/);
  return parts[parts.length - 1];
}

/**
 * 讀檔失敗的白話說明。
 * @param {{ code?: string, error?: string }} loadError
 * @returns {{ reason: string, suggestRetryFirst: boolean }}
 *   reason：發生了什麼事；suggestRetryFirst：這種錯誤通常等一下按「重試」就會好
 */
export function describeLoadError(loadError) {
  const code = loadError?.code || '';
  if (code === 'PARSE_ERROR') {
    return {
      reason: '資料檔的內容壞掉了，程式看不懂。常見的原因是存檔到一半時突然斷電或當機。',
      suggestRetryFirst: false,
    };
  }
  if (code === 'INVALID_FORMAT') {
    return {
      reason: '資料檔的內容不是程式預期的格式，可能被別的程式改過，或者不是 LifeSync 的資料檔。',
      suggestRetryFirst: false,
    };
  }
  if (code === 'MISSING_WITH_BACKUPS') {
    return {
      reason: '找不到資料檔，但是備份資料夾裡有備份。為了避免用一份空白資料蓋掉你的紀錄，程式沒有自動開始一份新的。',
      suggestRetryFirst: false,
    };
  }
  if (LOCKED_CODES.has(code)) {
    return {
      reason: '資料檔暫時被別的程式鎖住，或沒有權限讀取（例如防毒軟體、雲端硬碟同步軟體正在處理它）。通常等幾秒再按「重試」就會好。',
      suggestRetryFirst: true,
    };
  }
  if (code.startsWith('HTTP_')) {
    return {
      reason: '資料伺服器（瀏覽器模式下負責讀寫資料的 server.js）回報錯誤。',
      suggestRetryFirst: true,
    };
  }
  return {
    reason: '讀取資料時發生了預料之外的錯誤。',
    suggestRetryFirst: true,
  };
}

/**
 * 檔案被鎖住或沒有權限（EBUSY、EPERM、EACCES）時，資料檔本身多半是好的，只是暫時打不開。
 * 這時「載入最近一次自動備份」會把這份好的資料檔改名成 .corrupt、改用比較舊的備份，
 * 所以錯誤畫面把這個按鈕收起來，按下去還要再確認一次。
 * @param {{ code?: string }} loadError
 * @returns {string|null} 要再確認時的文字；不需要多確認時回傳 null
 */
export function restoreConfirmMessage(loadError) {
  if (!LOCKED_CODES.has(loadError?.code || '')) return null;
  return (
    '資料檔目前只是被別的程式鎖住、或沒有讀取的權限，檔案本身很可能是好的。\n\n' +
    '從備份載入會把它改名成 lifesync-data.corrupt-時間.json（不會刪除），改用比較舊的自動備份；' +
    '備份之後做的修改不會在裡面。\n\n' +
    '建議先關掉防毒軟體或雲端硬碟同步軟體，等幾分鐘再按「重試」。確定還是要從備份載入嗎？'
  );
}

/** 錯誤畫面最下面那句「你的資料沒事」的保證 */
export const LOAD_ERROR_SAFETY_NOTE =
  '你的資料檔沒有被改動。在資料成功讀出來之前，程式會暫停存檔，不會用空白資料蓋掉它。';

/**
 * 「載入最近一次自動備份」失敗時的說明。
 * @param {{ code?: string, error?: string }} failure
 */
export function describeRestoreFailure(failure) {
  if (failure?.code === 'NO_BACKUP') {
    return '備份資料夾裡沒有可以用的自動備份，所以沒辦法從備份載入。資料檔維持原樣，沒有被動過。';
  }
  const detail = failure?.error ? `（${failure.error}）` : '';
  return `從備份載入失敗${detail}。沒有任何檔案被刪除，可以再按一次「重試」或「載入最近一次自動備份」。`;
}

/**
 * 從備份還原成功後，畫面上方的提示。
 * @param {{ restoredFrom?: string, restoredFromTime?: string|null, preservedAs?: string|null }} info
 * @returns {string[]} 一句一行
 */
export function describeRestoreSuccess(info) {
  const when = formatLocalDateTime(info?.restoredFromTime);
  const name = baseName(info?.restoredFrom);
  const lines = [
    `已載入${when ? ` ${when} 的` : ''}自動備份${name ? `（${name}）` : ''}。這份備份之後做的修改不在裡面。`,
  ];
  if (info?.preservedAs) {
    lines.push(`原本讀不出來的資料檔沒有刪除，已改名保留在：${info.preservedAs}`);
  }
  return lines;
}

const SECRET_LABELS = {
  password: 'WebDAV 應用程式密碼',
  masterPassword: '數據加密主密碼',
};

/**
 * 有存起來的雲端密碼在這台電腦解不開時（例如資料是從另一台電腦搬過來的）的提示。
 * @param {string[]} fields 解不開的欄位名稱（password、masterPassword）
 * @returns {string|null} 沒有解不開的欄位時回傳 null
 */
export function describeSecretsUnavailable(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return null;
  const labels = fields.map((f) => SECRET_LABELS[f] || f);
  return (
    `這台電腦解不開之前存起來的${labels.join('和')}（例如資料是從另一台電腦搬過來的），所以設定頁的${labels.length > 1 ? '這兩個欄位' : '這個欄位'}會是空白。` +
    '請到「設定」頁重新輸入一次。原本加密的內容沒有被刪除，重新輸入之前也不會被清掉。'
  );
}
