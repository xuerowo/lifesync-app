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
