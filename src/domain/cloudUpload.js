import { cloudErrorReason, httpStatusOf, rawErrorText } from '../shared/errorMessages.js';

/**
 * 雲端上最多保留幾份舊版。必須和 electron/cloudVersions.js 的 MAX_CLOUD_VERSIONS 相同
 * （畫面不能 import 主程序的檔案；tests/cloudVersions.test.js 有對照）。
 */
export const CLOUD_VERSIONS_KEPT = 5;

/** 按「上傳到雲端」時的確認文字：上傳會整份取代雲端上的備份，不會合併 */
export const CONFIRM_CLOUD_UPLOAD =
  '確定要上傳到雲端嗎？\n\n' +
  '上傳後，雲端上的備份會整份換成這台電腦目前的資料，不會和雲端那份合併。\n' +
  `雲端上原本那份會先另存為舊版（最多保留最近 ${CLOUD_VERSIONS_KEPT} 份），萬一傳錯還救得回來。\n\n` +
  '如果這台電腦是剛安裝、還沒有你的資料，請改按「從雲端還原」，以免用空白的資料蓋掉雲端的備份。';

/**
 * 「上傳到雲端」成功後的訊息（H7）。
 * @param {{ versionedAs?: string|null, keep?: number, warning?: string|null }} result 主程序 cloud-upload 的回傳值
 */
export function cloudUploadSuccessMessage(result) {
  const lines = ['已加密並上傳到雲端！'];
  if (result?.versionedAs) {
    lines.push(
      '',
      `雲端上原本那份已另存為舊版「${result.versionedAs}」，最多保留最近 ${result.keep || CLOUD_VERSIONS_KEPT} 份舊版。` +
        '萬一傳錯了，可以到雲端硬碟的網頁上，先把現在的 lifesync_backup_e2ee.dat 改成別的名字，再把想要的舊版改名成 lifesync_backup_e2ee.dat，然後按「從雲端還原」。'
    );
  }
  if (result?.warning) lines.push('', `注意：${result.warning}`);
  return lines.join('\n');
}

/**
 * 「從雲端還原」失敗時的訊息（這時本機資料一定還沒被覆蓋）。
 * 解密失敗的錯誤（code 為 DECRYPT_FAILED）本身就以「解密失敗」開頭，這裡不再重複加前綴。
 * @param {Error & { code?: string }} error
 */
export function cloudRestoreFailureMessage(error) {
  const unchanged = '這台電腦上的資料沒有變動。';
  if (error?.code === 'DECRYPT_FAILED') {
    return `解密失敗：雲端上的備份解不開。最可能的原因是主密碼和上傳時用的不一樣，請檢查主密碼是否正確；也可能是雲端上的檔案損壞。\n\n${unchanged}`;
  }
  if (error instanceof SyntaxError) {
    return `還原失敗：雲端上的備份解密後不是正確的資料格式，檔案可能損壞了。\n\n${unchanged}`;
  }
  const detail = error?.message || String(error || '未知的錯誤');
  return `還原失敗：${detail}\n\n${unchanged}`;
}

/** 圖庫結果最多列出幾筆失敗原因 */
const MAX_LISTED_FAILURES = 3;

/**
 * 「上傳圖庫」「下載圖庫」完成（或中斷）後的訊息：張數、前幾筆失敗原因和下一步。
 * @param {'upload'|'download'} kind
 * @param {{ uploaded?: number, downloaded?: number, skipped?: number, failed?: number,
 *   errors?: { name: string, reason: string }[] }} results 主程序 cloud-sync-gallery／cloud-restore-gallery 的 results
 * @param {{ aborted?: boolean }} [options]
 */
export function galleryResultMessage(kind, results, { aborted = false } = {}) {
  const isUpload = kind === 'upload';
  const button = isUpload ? '「上傳圖庫」' : '「下載圖庫」';
  const done = Number(isUpload ? results?.uploaded : results?.downloaded) || 0;
  const skipped = Number(results?.skipped) || 0;
  const failed = Number(results?.failed) || 0;
  const errors = Array.isArray(results?.errors) ? results.errors : [];

  const lines = [
    aborted ? `圖庫${isUpload ? '上傳' : '下載'}已中斷。` : `圖庫${isUpload ? '上傳' : '下載'}完成！`,
    '',
    isUpload ? `新上傳：${done} 張` : `新下載：${done} 張`,
    isUpload ? `雲端已經有、略過：${skipped} 張` : `這台電腦已經有、略過：${skipped} 張`,
    `失敗：${failed} 張`,
  ];

  if (failed > 0) {
    const listed = errors.slice(0, MAX_LISTED_FAILURES);
    if (listed.length > 0) {
      lines.push('', `失敗的圖片${failed > listed.length ? `（前 ${listed.length} 張）` : ''}：`);
      // 認得的錯誤換成白話（例如連不上伺服器）並附上原文；認不得的照原文。
      // 單張圖片的 404 只代表那一張不在，不套用「網址打錯」的說明
      for (const e of listed) {
        const raw = rawErrorText(e?.reason) || '未知的錯誤';
        const plain = httpStatusOf(e?.reason) === 404 ? null : cloudErrorReason(e?.reason);
        lines.push(`・${e?.name || '（沒有檔名）'}：${plain ? `${plain}（技術細節：${raw}）` : raw}`);
      }
      if (failed > listed.length) lines.push(`……還有 ${failed - listed.length} 張沒有列出`);
    }
    lines.push(
      '',
      `下一步：再按一次${button}，${isUpload ? '已經上傳的不會重傳' : '已經下載的會略過'}，只會重試失敗和還沒處理的圖片。`
    );
    if (!isUpload && errors.some((e) => String(e?.reason || '').includes('解密失敗'))) {
      lines.push('有圖片解密失敗：請確認主密碼和上傳這些圖片時用的一樣。');
    }
  } else if (aborted) {
    lines.push('', `已經處理好的圖片會保留。之後再按一次${button}，會從還沒處理的圖片繼續。`);
  }
  return lines.join('\n');
}
