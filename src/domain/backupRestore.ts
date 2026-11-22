// 「還原完整備份」完成（或中斷）後的訊息：資料有沒有還原、備份裡的圖片複製了幾張、哪些失敗、下一步。
// 主程序回傳的圖片結果見 src/types/electronApi.ts 的 BackupGalleryRestore（electron/backupGallery.ts 產生）。

import { fileErrorReason, rawErrorText } from '../shared/errorMessages.ts';
import type { BackupGalleryRestore } from '../types/electronApi.ts';

/** 最多列出幾張失敗的圖片（和雲端圖庫的結果一樣） */
const MAX_LISTED_FAILURES = 3;

/** 再試一次的方法：還原會重新複製全部圖片，資料也會再換一次 */
const RETRY_STEP =
  '再按一次「還原完整備份」、選同一個資料夾，會重新複製全部圖片（資料也會再換成備份裡的內容一次）。';

type GalleryInfo = Partial<BackupGalleryRestore> | null | undefined;

/** 失敗的圖片：認得的錯誤寫白話＋技術細節，認不得的照原文 */
function failureLines(gallery: NonNullable<GalleryInfo>, failed: number): string[] {
  const errors = Array.isArray(gallery.errors) ? gallery.errors : [];
  const listed = errors.slice(0, MAX_LISTED_FAILURES);
  const lines = listed.map((e) => {
    const raw = rawErrorText(e?.reason) || '未知的錯誤';
    const plain = fileErrorReason(e?.reason, { action: 'copy-gallery-image' });
    return `・${e?.name || '（沒有檔名）'}：${plain ? `${plain}（技術細節：${raw}）` : raw}`;
  });
  if (failed > listed.length) lines.push(`……還有 ${failed - listed.length} 張沒有列出`);
  return lines;
}

/**
 * 還原成功（資料已換成備份裡的內容）時的訊息。圖片有失敗時也算還原成功，但要說清楚哪些圖片沒有複製。
 * @param gallery 主程序 import-full-backup 回傳的 gallery
 */
export function backupRestoreSuccessMessage(gallery: GalleryInfo): string {
  if (!gallery) {
    // 照理不會發生（主程序一定會回傳 gallery）；不知道圖片的結果，就不寫張數
    return '完整備份還原成功！資料已換成備份裡的內容，備份裡的圖片也已複製回圖庫（同名的會被蓋掉）。';
  }
  const copied = Number(gallery.copied) || 0;
  const failed = Number(gallery.failed) || 0;

  if (gallery.listError) {
    return [
      '完整備份還原成功，但備份裡的圖片沒有複製回圖庫。',
      '',
      '資料：已換成備份裡的內容。',
      '備份裡的圖片：讀不到備份資料夾裡的 gallery 資料夾，一張都沒有複製。',
      gallery.listError,
      '',
      `下一步：處理好之後，${RETRY_STEP}`,
    ].join('\n');
  }

  if (failed > 0) {
    return [
      `完整備份還原成功，但有 ${failed} 張圖片沒有複製回圖庫。`,
      '',
      '資料：已換成備份裡的內容。',
      `備份裡的圖片：已複製 ${copied} 張（圖庫裡同名的圖片已被蓋掉），${failed} 張失敗：`,
      ...failureLines(gallery, failed),
      '',
      `下一步：關掉可能正在使用這些圖片的程式（例如看圖軟體、防毒軟體、雲端硬碟同步軟體）後，${RETRY_STEP}`,
    ].join('\n');
  }

  if (copied === 0) {
    return '完整備份還原成功！資料已換成備份裡的內容。這份備份裡沒有圖片，圖庫沒有變動。';
  }
  return `完整備份還原成功！資料已換成備份裡的內容，備份裡的 ${copied} 張圖片也已複製回圖庫（同名的會被蓋掉）。`;
}

/**
 * 按了取消、還原中斷時的訊息：資料沒有換，但已經複製過來的圖片會留著。
 * @param gallery 主程序 import-full-backup 回傳的 gallery
 */
export function backupRestoreAbortedMessage(gallery: GalleryInfo): string {
  const copied = Number(gallery?.copied) || 0;
  if (gallery && copied === 0) return '還原已中斷。目前的資料和圖庫都沒有變動。';
  const count = gallery ? ` ${copied} 張` : '';
  return `還原已中斷。目前的資料沒有變動，但已經複製過來的${count}圖庫圖片會留著（同名的圖片已被蓋掉）。`;
}
