/**
 * 雲端「同步數據」（上傳）成功後的訊息（H7）。
 * @param {{ versionedAs?: string|null, keep?: number, warning?: string|null }} result 主程序 cloud-upload 的回傳值
 */
export function cloudUploadSuccessMessage(result) {
  const lines = ['加密數據上傳成功！'];
  if (result?.versionedAs) {
    lines.push(
      '',
      `雲端上原本那份已另存為舊版「${result.versionedAs}」，最多保留最近 ${result.keep || 5} 份舊版。` +
        '萬一傳錯了，可以到雲端硬碟的網頁上，先把現在的 lifesync_backup_e2ee.dat 改成別的名字，再把想要的舊版改名成 lifesync_backup_e2ee.dat，然後按「還原數據」。'
    );
  }
  if (result?.warning) lines.push('', `注意：${result.warning}`);
  return lines.join('\n');
}

/**
 * 雲端「還原數據」失敗時的訊息（這時本機資料一定還沒被覆蓋）。
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
