import { createClient } from 'webdav';
import fs from 'fs/promises';
import path from 'path';
import { encryptBuffer, decryptBuffer } from './galleryCrypto.js';
import { toSafeLocalName, resolveInsideDir, pushError, ENCRYPTED_EXT, DOWNLOAD_TMP_EXT } from './galleryFiles.js';
import { keepPreviousVersion, pruneOldVersions, MAX_CLOUD_VERSIONS } from './cloudVersions.js';
import { describeCloudError } from '../src/shared/errorMessages.ts';

// 全局取消旗標
let abortSync = false;

/**
 * 設定中斷旗標
 */
export function setAbortFlag(value) {
    abortSync = value;
}

export function setupCloudHandlers(ipcMain, { GALLERY_DIR }) {
  // 注意：取消功能現在由 main.js 統一調用 setAbortFlag

  ipcMain.handle('cloud-test-connection', async (event, config) => {
    const client = createClient(config.url, {
      username: config.username,
      password: config.password,
    });
    try {
      await client.getDirectoryContents('/');
      return { success: true };
    } catch (error) {
      return { success: false, error: describeCloudError(error, { action: 'test' }) };
    }
  });

  ipcMain.handle('cloud-upload', async (event, { config, fileName, encryptedData }) => {
    const client = createClient(config.url, {
      username: config.username,
      password: config.password,
    });
    // 1. 蓋掉之前，先把雲端上原本那份複製成舊版；做不到就不上傳，免得唯一的一份被蓋掉後救不回來
    let previous;
    try {
      previous = await keepPreviousVersion(client, fileName);
    } catch (error) {
      return {
        success: false,
        error: `沒辦法先把雲端上原本那份另存為舊版，為了安全，這次沒有上傳，雲端上的檔案也沒有被改動。\n\n${describeCloudError(error, { action: 'upload' })}`,
      };
    }
    // 2. 上傳
    try {
      await client.putFileContents(fileName, Buffer.from(encryptedData), { overwrite: true });
    } catch (error) {
      return { success: false, error: describeCloudError(error, { action: 'upload' }), versionedAs: previous.versionedAs };
    }
    // 3. 舊版超過保留份數時刪掉最舊的（只刪符合舊版命名規則的檔案）；刪不掉不影響這次上傳
    let warning = null;
    if (previous.versionedAs) {
      const { errors } = await pruneOldVersions(client, fileName, previous.siblingNames, MAX_CLOUD_VERSIONS);
      if (errors.length > 0) {
        warning = `有 ${errors.length} 份較舊的舊版沒有刪掉，雲端上的舊版可能超過 ${MAX_CLOUD_VERSIONS} 份：${errors.join('；')}`;
      }
    }
    return { success: true, versionedAs: previous.versionedAs, keep: MAX_CLOUD_VERSIONS, warning };
  });

  ipcMain.handle('cloud-download', async (event, { config, fileName }) => {
    const client = createClient(config.url, {
      username: config.username,
      password: config.password,
    });
    try {
      const content = await client.getFileContents(fileName);
      return { success: true, data: content };
    } catch (error) {
      return { success: false, error: describeCloudError(error, { action: 'download' }) };
    }
  });

  ipcMain.handle('cloud-sync-gallery', async (event, { config, masterPassword }) => {
    setAbortFlag(false);
    const client = createClient(config.url, {
      username: config.username,
      password: config.password,
    });

    try {
      // 新電腦或剛安裝時圖庫資料夾可能還不存在，先建立，避免 readdir 丟出 ENOENT
      await fs.mkdir(GALLERY_DIR, { recursive: true });

      try {
        await client.createDirectory('/gallery');
      } catch {
        // 資料夾已存在時伺服器會回錯誤，忽略即可
      }

      // 下載到一半留下的暫存檔不是正式圖片，不上傳
      const localFiles = (await fs.readdir(GALLERY_DIR)).filter(name => !name.endsWith(DOWNLOAD_TMP_EXT));
      const total = localFiles.length;
      const results = { uploaded: 0, skipped: 0, failed: 0, total, aborted: false, errors: [] };

      const cloudItems = await client.getDirectoryContents('/gallery');
      const cloudFileNames = new Set(cloudItems.map(i => i.basename));

      for (let i = 0; i < localFiles.length; i++) {
        if (abortSync) {
            results.aborted = true;
            break;
        }

        const fileName = localFiles[i];
        const encryptedName = fileName + ENCRYPTED_EXT;

        event.sender.send('cloud-progress', {
            current: i + 1,
            total,
            message: `正在上傳圖庫：${fileName}`
        });

        if (cloudFileNames.has(encryptedName)) {
          results.skipped++;
          continue;
        }

        try {
          const fileBuffer = await fs.readFile(path.join(GALLERY_DIR, fileName));
          const encryptedBuffer = await encryptBuffer(fileBuffer, masterPassword);
          await client.putFileContents(`/gallery/${encryptedName}`, encryptedBuffer);
          results.uploaded++;
        } catch (err) {
          results.failed++;
          pushError(results.errors, fileName, err?.message || String(err));
        }
      }
      return { success: true, results, aborted: results.aborted };
    } catch (error) {
      return { success: false, error: describeCloudError(error, { action: 'gallery-upload' }) };
    }
  });

  ipcMain.handle('cloud-restore-gallery', async (event, { config, masterPassword }) => {
    setAbortFlag(false);
    const client = createClient(config.url, {
      username: config.username,
      password: config.password,
    });

    try {
      // 新電腦或剛安裝時圖庫資料夾可能還不存在，先建立，否則每張都會寫入失敗
      await fs.mkdir(GALLERY_DIR, { recursive: true });

      const cloudItems = await client.getDirectoryContents('/gallery');
      const files = cloudItems.filter(i => i.type === 'file' && typeof i.basename === 'string' && i.basename.endsWith(ENCRYPTED_EXT));
      const total = files.length;
      const results = { downloaded: 0, skipped: 0, failed: 0, total, aborted: false, errors: [] };

      for (let i = 0; i < files.length; i++) {
        if (abortSync) {
            results.aborted = true;
            break;
        }

        const item = files[i];
        const originalName = toSafeLocalName(item.basename);
        const localPath = originalName ? resolveInsideDir(GALLERY_DIR, originalName) : null;

        event.sender.send('cloud-progress', {
            current: i + 1,
            total,
            message: `正在下載圖庫：${originalName || item.basename}`
        });

        if (!localPath) {
          // 檔名不安全（可能讓檔案寫到圖庫資料夾以外），略過
          results.failed++;
          pushError(results.errors, item.basename, '檔名不安全，已略過');
          continue;
        }

        try {
          await fs.access(localPath);
          results.skipped++;
          continue;
        } catch {
          // 本機沒有這個檔案，繼續下載
        }

        // 先寫到暫存檔，完整寫完才改成正式檔名；中斷時不會留下半截的正式檔
        const tmpPath = localPath + DOWNLOAD_TMP_EXT;
        let stage = 'download';
        try {
          const encryptedBuffer = await client.getFileContents(item.filename);
          stage = 'decrypt';
          const decryptedBuffer = await decryptBuffer(encryptedBuffer, masterPassword);
          stage = 'write';
          await fs.writeFile(tmpPath, decryptedBuffer);
          await fs.rename(tmpPath, localPath);
          results.downloaded++;
        } catch (err) {
          results.failed++;
          const reason = stage === 'decrypt'
            ? '解密失敗（主密碼錯誤或檔案損壞）'
            : (err?.message || String(err));
          pushError(results.errors, originalName, reason);
          try {
            await fs.unlink(tmpPath);
          } catch {
            // 暫存檔可能根本沒建立，忽略
          }
        }
      }
      return { success: true, results, aborted: results.aborted };
    } catch (error) {
      return { success: false, error: describeCloudError(error, { action: 'gallery-download' }) };
    }
  });
}
