// 還原完整備份時，把備份資料夾裡的 gallery\ 圖片複製回圖庫（electron/main.ts 的 import-full-backup）。
// 獨立成一個檔案，才能不開 Electron、直接用暫存資料夾測試（tests/backupGallery.test.ts）。
//
// 以前整段包在一個 try 裡，只要一張出錯（例如備份裡有子資料夾、檔案被鎖住），
// 就當成「備份裡沒有圖庫」、後面的圖片全部不複製，畫面卻說圖片都已複製。現在：
// - 備份裡沒有 gallery 資料夾：正常，不算錯（只匯出資料檔的舊備份、或沒有圖片時）。
// - 只複製檔案，子資料夾略過（匯出時只會放檔案；圖庫本身也沒有子資料夾）。
// - 一張失敗就記下來，繼續複製下一張；最後回報複製了幾張、失敗幾張和前幾筆原因。

import fs from 'fs/promises';
import path from 'path';
import { pushError } from './galleryFiles.ts';
import { nodeError } from './nodeError.ts';
import { describeFileError } from '../src/shared/errorMessages.ts';
import type { BackupGalleryRestore, CloudProgress } from '../src/types/electronApi.ts';

export interface RestoreBackupGalleryOptions {
  /** 每張複製前呼叫；回傳 true 就停下來（使用者按了取消） */
  shouldAbort?: () => boolean;
  /** 每張開始複製時呼叫，用來更新畫面上的進度 */
  onProgress?: (progress: CloudProgress) => void;
}

/**
 * 把 srcDir（備份裡的 gallery 資料夾）裡的檔案複製到 destDir（圖庫），同名的會被蓋掉。
 * destDir 要先建立好。這個函式不會丟出錯誤：所有問題都寫在回傳值裡。
 */
export async function restoreBackupGallery(
  srcDir: string,
  destDir: string,
  { shouldAbort = () => false, onProgress }: RestoreBackupGalleryOptions = {},
): Promise<BackupGalleryRestore & { aborted: boolean }> {
  const result: BackupGalleryRestore & { aborted: boolean } = {
    found: true, total: 0, copied: 0, failed: 0, errors: [], listError: null, aborted: false,
  };

  let files: string[];
  try {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });
    files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    const { code } = nodeError(error);
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      // 備份裡沒有圖庫資料夾：沒有圖片要複製，不算錯
      result.found = false;
      return result;
    }
    // 資料夾在，但讀不到（例如沒有權限）：一張都沒辦法複製，要讓使用者知道
    result.listError = describeFileError(error);
    return result;
  }

  result.total = files.length;
  for (let i = 0; i < files.length; i++) {
    if (shouldAbort()) {
      result.aborted = true;
      break;
    }
    const file = files[i];
    onProgress?.({ current: i + 1, total: files.length, message: `正在還原圖庫：${file}` });
    try {
      await fs.copyFile(path.join(srcDir, file), path.join(destDir, file));
      result.copied++;
    } catch (error) {
      result.failed++;
      pushError(result.errors, file, nodeError(error)?.message || String(error));
    }
  }
  return result;
}
