import { createClient } from 'webdav';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ITERATIONS = 100000;
const ALGO = 'aes-256-gcm';

// 全局取消旗標
let abortSync = false;

/**
 * 設定中斷旗標
 */
export function setAbortFlag(value) {
    abortSync = value;
}

function deriveKey(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
}

function encryptBuffer(buffer, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, encrypted, tag]);
}

function decryptBuffer(buffer, password) {
  const salt = buffer.slice(0, 16);
  const iv = buffer.slice(16, 28);
  const tag = buffer.slice(-16);
  const data = buffer.slice(28, -16);
  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
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
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud-upload', async (event, { config, fileName, encryptedData }) => {
    const client = createClient(config.url, {
      username: config.username,
      password: config.password,
    });
    try {
      await client.putFileContents(fileName, Buffer.from(encryptedData), { overwrite: true });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
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
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud-sync-gallery', async (event, { config, masterPassword }) => {
    setAbortFlag(false);
    const client = createClient(config.url, {
      username: config.username,
      password: config.password,
    });

    try {
      try { await client.createDirectory('/gallery'); } catch (e) {}

      const localFiles = await fs.readdir(GALLERY_DIR);
      const total = localFiles.length;
      const results = { uploaded: 0, skipped: 0, failed: 0, total, aborted: false };
      
      const cloudItems = await client.getDirectoryContents('/gallery');
      const cloudFileNames = new Set(cloudItems.map(i => i.basename));

      for (let i = 0; i < localFiles.length; i++) {
        if (abortSync) {
            results.aborted = true;
            break;
        }

        const fileName = localFiles[i];
        const encryptedName = fileName + '.e2ee';
        
        event.sender.send('cloud-progress', { 
            current: i + 1, 
            total, 
            message: `正在同步: ${fileName}` 
        });

        if (cloudFileNames.has(encryptedName)) {
          results.skipped++;
          continue;
        }

        try {
          const fileBuffer = await fs.readFile(path.join(GALLERY_DIR, fileName));
          const encryptedBuffer = encryptBuffer(fileBuffer, masterPassword);
          await client.putFileContents(`/gallery/${encryptedName}`, encryptedBuffer);
          results.uploaded++;
        } catch (err) {
          results.failed++;
        }
      }
      return { success: true, results, aborted: results.aborted };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('cloud-restore-gallery', async (event, { config, masterPassword }) => {
    setAbortFlag(false);
    const client = createClient(config.url, {
      username: config.username,
      password: config.password,
    });

    try {
      const cloudItems = await client.getDirectoryContents('/gallery');
      const files = cloudItems.filter(i => i.type === 'file' && i.basename.endsWith('.e2ee'));
      const total = files.length;
      const results = { downloaded: 0, skipped: 0, failed: 0, total, aborted: false };

      for (let i = 0; i < files.length; i++) {
        if (abortSync) {
            results.aborted = true;
            break;
        }

        const item = files[i];
        const originalName = item.basename.replace('.e2ee', '');
        const localPath = path.join(GALLERY_DIR, originalName);

        event.sender.send('cloud-progress', { 
            current: i + 1, 
            total, 
            message: `正在下載: ${originalName}` 
        });

        try {
          await fs.access(localPath);
          results.skipped++;
          continue;
        } catch {}

        try {
          const encryptedBuffer = await client.getFileContents(item.filename);
          const decryptedBuffer = decryptBuffer(encryptedBuffer, masterPassword);
          await fs.writeFile(localPath, decryptedBuffer);
          results.downloaded++;
        } catch (err) {
          results.failed++;
        }
      }
      return { success: true, results, aborted: results.aborted };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}
