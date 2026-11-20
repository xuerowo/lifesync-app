/**
 * 用別的資料（雲端備份、匯入的 JSON、本地完整備份）覆蓋本機資料之前的保護：
 * 先跳確認，再請主程序把目前的資料拍一份快照存到 backups\。
 * 快照失敗就不可覆蓋。瀏覽器模式（沒有 electronAPI.snapshotData）沒辦法拍快照，只做確認。
 */

export const SNAPSHOT_REASONS = {
  cloudRestore: 'before-cloud-restore',
  jsonImport: 'before-json-import',
  backupRestore: 'before-backup-restore',
};

const CLOUD_CONFIG_NOTE = '雲端設定（網址、帳號、密碼、主密碼）會保留這台電腦目前的，不會被換掉。';

const KEEP_NOTE = '覆蓋前會先自動把目前的資料備份一份（程式資料夾裡的 backups 資料夾），萬一按錯還救得回來。';

// 瀏覽器模式沒辦法拍快照，確認文字不可以承諾會自動備份
const NO_SNAPSHOT_NOTE =
  '注意：瀏覽器模式不會在覆蓋前自動備份目前的資料。想保留的話，請先自己把資料檔（lifesync-data.json）複製一份。';

/** 這個環境能不能在覆蓋前拍快照（桌面版可以；瀏覽器模式沒有 electronAPI.snapshotData，不行） */
export const canSnapshot = (api) => typeof api?.snapshotData === 'function';

export const CONFIRM_CLOUD_RESTORE =
  '確定要用雲端上的備份，取代這台電腦上目前的資料嗎？\n\n' +
  '目前所有的計畫、任務、完成紀錄、抽卡券、筆記等，都會換成雲端那一份的內容；' +
  '在雲端那一份之後才做的修改都會不見。\n' +
  CLOUD_CONFIG_NOTE + '\n\n' +
  KEEP_NOTE;

export const CONFIRM_BACKUP_RESTORE =
  '確定要用這份完整備份，取代這台電腦上目前的資料和圖庫嗎？\n\n' +
  '目前所有的計畫、任務、完成紀錄、抽卡券、筆記等，都會換成備份裡的內容；同名的圖庫圖片也會被備份裡的蓋掉。\n' +
  CLOUD_CONFIG_NOTE + '\n\n' +
  '覆蓋前會先自動把目前的資料備份一份（程式資料夾裡的 backups 資料夾，不含圖庫圖片），萬一按錯還救得回來。';

/**
 * 匯入單一 JSON 檔的確認文字。
 * @param {string} fileName
 * @param {{ canSnapshot?: boolean }} [options] canSnapshot：覆蓋前能不能自動拍快照（用 canSnapshot(window.electronAPI) 判斷）
 */
export const confirmJsonImportMessage = (fileName, { canSnapshot: snapshotPossible = true } = {}) =>
  `確定要匯入${fileName ? `「${fileName}」` : '這個 JSON 檔'}，取代這台電腦上目前的資料嗎？\n\n` +
  '檔案裡有的項目（例如計畫、任務、完成紀錄、抽卡券、筆記）會整個換成檔案裡的內容。\n' +
  CLOUD_CONFIG_NOTE + '\n\n' +
  (snapshotPossible ? KEEP_NOTE : NO_SNAPSHOT_NOTE);

/**
 * 請主程序拍快照。
 * @returns {Promise<{ ok: true, skipped: boolean, path: string|null } | { ok: false, error: string, code?: string }>}
 *   code：主程序回報的錯誤碼（例如 EEXIST、ENOSPC），snapshotFailedMessage 用它寫出白話原因
 *   skipped：瀏覽器模式，沒有拍快照；path：快照檔的完整路徑（沒有原檔可拍時是 null）
 */
export async function snapshotBeforeOverwrite(api, { reason, data } = {}) {
  if (!canSnapshot(api)) return { ok: true, skipped: true, path: null };
  try {
    const result = await api.snapshotData({ reason, data });
    if (result?.success) return { ok: true, skipped: false, path: result.path ?? null };
    const failure = { ok: false, error: result?.error || '未知的錯誤' };
    if (result?.code) failure.code = result.code;
    return failure;
  } catch (error) {
    const failure = { ok: false, error: error?.message || String(error) };
    if (error?.code) failure.code = error.code;
    return failure;
  }
}

// 常見錯誤碼的白話說明（原始的英文訊息另外附在後面，方便查問題）
const SNAPSHOT_ERROR_REASONS = {
  EEXIST:
    '要建立的備份資料夾或檔案已經存在，但不是預期的樣子（例如資料資料夾裡有一個叫 backups 的「檔案」，擋住了備份資料夾）。',
  EPERM: '沒有寫入備份資料夾的權限，或檔案正被別的程式（例如防毒軟體、雲端硬碟同步軟體）使用中。',
  EACCES: '沒有寫入備份資料夾的權限，或檔案正被別的程式（例如防毒軟體、雲端硬碟同步軟體）使用中。',
  EBUSY: '檔案正被別的程式（例如防毒軟體、雲端硬碟同步軟體）使用中。等一下再試通常就會好。',
  ENOSPC: '磁碟空間不足。請先清出一些空間再試。',
  SNAPSHOT_BLOCKED: '目前的資料檔讀不出來，所以沒有替它備份。',
  SAVE_BLOCKED: '資料沒有成功載入，程式已暫停存檔。',
};

/**
 * 快照失敗時給使用者看的說明。
 * @param {{ error?: string, code?: string } | string} failure snapshotBeforeOverwrite 回傳的失敗結果（舊的呼叫方式只傳錯誤文字）
 */
export function snapshotFailedMessage(failure) {
  const raw = typeof failure === 'string' ? failure : failure?.error || '未知的錯誤';
  // 主程序沒帶錯誤碼時，從「EEXIST: file already exists, …」這種訊息開頭取
  const code = (typeof failure === 'object' && failure?.code) || /^([A-Z][A-Z_]+):/.exec(raw)?.[1] || '';
  const reason = SNAPSHOT_ERROR_REASONS[code];
  const head = '沒辦法先備份目前的資料，為了安全，這次沒有覆蓋，本機資料完全沒有變動。';
  if (!reason) return `${head}\n\n原因：${raw}`;
  return `${head}\n\n原因：${reason}\n\n（技術細節：${raw}）`;
}

/** 覆蓋成功後，告訴使用者原本的資料備份到哪裡（瀏覽器模式或沒有拍快照時回傳空字串） */
export const snapshotSavedNote = (snapshot) =>
  snapshot?.ok && snapshot.path ? `\n\n原本的資料已備份到：\n${snapshot.path}` : '';
