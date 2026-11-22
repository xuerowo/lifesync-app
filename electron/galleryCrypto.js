import crypto from 'crypto';
import { promisify } from 'util';

/**
 * 雲端圖庫加解密（主程序用）
 *
 * 檔案格式（不可更改，否則舊備份會解不開，也會和畫面端 src/utils/crypto.ts 不相容）：
 *   [salt 16 bytes][iv 12 bytes][密文][GCM 驗證標籤 16 bytes]
 * 金鑰：PBKDF2-SHA256，100000 次，32 bytes；加密：AES-256-GCM。
 *
 * 金鑰衍生用非同步的 crypto.pbkdf2，運算在 libuv 執行緒池進行，不會卡住主程序。
 */

export const ITERATIONS = 100000;
export const SALT_LENGTH = 16;
export const IV_LENGTH = 12;
export const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';
const ALGO = 'aes-256-gcm';

const pbkdf2 = promisify(crypto.pbkdf2);

export function deriveKey(password, salt) {
  return pbkdf2(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
}

export async function encryptBuffer(buffer, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = await deriveKey(password, salt);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, encrypted, tag]);
}

export async function decryptBuffer(buffer, password) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH) {
    throw new Error('加密檔案格式不正確（長度不足）');
  }
  const salt = buf.subarray(0, SALT_LENGTH);
  const iv = buf.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const data = buf.subarray(SALT_LENGTH + IV_LENGTH, buf.length - TAG_LENGTH);
  const key = await deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
