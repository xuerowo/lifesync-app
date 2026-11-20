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

export const confirmJsonImportMessage = (fileName) =>
  `確定要匯入${fileName ? `「${fileName}」` : '這個 JSON 檔'}，取代這台電腦上目前的資料嗎？\n\n` +
  '檔案裡有的項目（例如計畫、任務、完成紀錄、抽卡券、筆記）會整個換成檔案裡的內容。\n' +
  CLOUD_CONFIG_NOTE + '\n\n' +
  KEEP_NOTE;

/**
 * 請主程序拍快照。
 * @returns {Promise<{ ok: true, skipped: boolean, path: string|null } | { ok: false, error: string }>}
 *   skipped：瀏覽器模式，沒有拍快照；path：快照檔的完整路徑（沒有原檔可拍時是 null）
 */
export async function snapshotBeforeOverwrite(api, { reason, data } = {}) {
  if (typeof api?.snapshotData !== 'function') return { ok: true, skipped: true, path: null };
  try {
    const result = await api.snapshotData({ reason, data });
    if (result?.success) return { ok: true, skipped: false, path: result.path ?? null };
    return { ok: false, error: result?.error || '未知的錯誤' };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

/** 快照失敗時給使用者看的說明 */
export const snapshotFailedMessage = (error) =>
  `沒辦法先備份目前的資料，為了安全，這次沒有覆蓋，本機資料完全沒有變動。\n\n原因：${error}`;

/** 覆蓋成功後，告訴使用者原本的資料備份到哪裡（瀏覽器模式或沒有拍快照時回傳空字串） */
export const snapshotSavedNote = (snapshot) =>
  snapshot?.ok && snapshot.path ? `\n\n原本的資料已備份到：\n${snapshot.path}` : '';
