import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  encryptBuffer,
  decryptBuffer,
  ITERATIONS,
  SALT_LENGTH,
  IV_LENGTH,
  TAG_LENGTH,
} from '../electron/galleryCrypto.js';
import { encryptData, decryptData, DECRYPT_FAILED } from '../src/utils/crypto.ts';
import { cloudRestoreFailureMessage } from '../src/domain/cloudUpload.ts';

const PASSWORD = 'correct horse battery staple';

describe('galleryCrypto（主程序圖庫加解密）', () => {
  it('加密後再解密可以還原原始內容', async () => {
    const original = crypto.randomBytes(1000);
    const encrypted = await encryptBuffer(original, PASSWORD);
    const decrypted = await decryptBuffer(encrypted, PASSWORD);
    expect(Buffer.compare(decrypted, original)).toBe(0);
  });

  it('空內容也能加解密', async () => {
    const encrypted = await encryptBuffer(Buffer.alloc(0), PASSWORD);
    expect(encrypted.length).toBe(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const decrypted = await decryptBuffer(encrypted, PASSWORD);
    expect(decrypted.length).toBe(0);
  });

  it('輸出格式：salt16 + iv12 + 密文（與明文等長）+ tag16', async () => {
    const original = Buffer.from('hello gallery');
    const encrypted = await encryptBuffer(original, PASSWORD);
    expect(SALT_LENGTH).toBe(16);
    expect(IV_LENGTH).toBe(12);
    expect(TAG_LENGTH).toBe(16);
    expect(ITERATIONS).toBe(100000);
    expect(encrypted.length).toBe(16 + 12 + original.length + 16);
  });

  it('每次加密使用不同的 salt 與 iv', async () => {
    const original = Buffer.from('same input');
    const a = await encryptBuffer(original, PASSWORD);
    const b = await encryptBuffer(original, PASSWORD);
    expect(a.subarray(0, 28).equals(b.subarray(0, 28))).toBe(false);
  });

  it('格式與舊版同步演算法（pbkdf2Sync）完全相同', async () => {
    // 用舊版的寫法手動解開新版產生的檔案，確認格式沒變
    const original = Buffer.from('format check');
    const encrypted = await encryptBuffer(original, PASSWORD);
    const salt = encrypted.subarray(0, 16);
    const iv = encrypted.subarray(16, 28);
    const tag = encrypted.subarray(-16);
    const data = encrypted.subarray(28, -16);
    const key = crypto.pbkdf2Sync(PASSWORD, salt, 100000, 32, 'sha256');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    expect(decrypted.toString()).toBe('format check');
  });

  it('產生金鑰時不會卡住事件迴圈（非同步）', async () => {
    // 同步版 pbkdf2Sync 會在 await 結束前就算完，setImmediate 來不及執行
    let ticked = false;
    setImmediate(() => { ticked = true; });
    await encryptBuffer(Buffer.from('x'), PASSWORD);
    expect(ticked).toBe(true);
  });

  it('密碼錯誤時丟出錯誤', async () => {
    const encrypted = await encryptBuffer(Buffer.from('secret'), PASSWORD);
    await expect(decryptBuffer(encrypted, 'wrong password')).rejects.toThrow();
  });

  it('資料被竄改時丟出錯誤', async () => {
    const encrypted = await encryptBuffer(Buffer.from('secret'), PASSWORD);
    encrypted[30] ^= 0xff;
    await expect(decryptBuffer(encrypted, PASSWORD)).rejects.toThrow();
  });

  it('長度不足的資料丟出錯誤', async () => {
    await expect(decryptBuffer(Buffer.alloc(10), PASSWORD)).rejects.toThrow();
  });
});

describe('與畫面端 src/utils/crypto.ts 格式相容', () => {
  it('畫面端加密 → 主程序解密', async () => {
    const text = '雲端備份 JSON {"a":1}';
    const arrayBuffer = await encryptData(text, PASSWORD);
    const decrypted = await decryptBuffer(Buffer.from(arrayBuffer), PASSWORD);
    expect(decrypted.toString('utf-8')).toBe(text);
  });

  it('主程序加密 → 畫面端解密', async () => {
    const text = '圖庫測試 image bytes';
    const encrypted = await encryptBuffer(Buffer.from(text, 'utf-8'), PASSWORD);
    // 轉成獨立的 ArrayBuffer（避免 Buffer 共用底層記憶體池）
    const arrayBuffer = encrypted.buffer.slice(
      encrypted.byteOffset,
      encrypted.byteOffset + encrypted.byteLength
    );
    const decrypted = await decryptData(arrayBuffer, PASSWORD);
    expect(decrypted).toBe(text);
  });

  it('畫面端加密二進位資料，主程序可還原', async () => {
    const bytes = new Uint8Array(crypto.randomBytes(500));
    const arrayBuffer = await encryptData(bytes, PASSWORD);
    const decrypted = await decryptBuffer(Buffer.from(arrayBuffer), PASSWORD);
    expect(Buffer.compare(decrypted, Buffer.from(bytes))).toBe(0);
  });
});

describe('雲端還原失敗的訊息（主密碼錯誤時不會出現兩次「解密失敗」）', () => {
  it('主密碼錯誤：decryptData 丟出帶 DECRYPT_FAILED 的錯誤，訊息只有一次「解密失敗」', async () => {
    const encrypted = await encryptData('{"a":1}', 'right-password');
    const error = await decryptData(encrypted, 'wrong-password').catch((e) => e);
    expect(error.code).toBe(DECRYPT_FAILED);
    const msg = cloudRestoreFailureMessage(error);
    expect(msg.match(/解密失敗/g)).toHaveLength(1);
    expect(msg).toContain('主密碼');
    expect(msg).toContain('資料沒有變動');
  });

  it('解密成功但內容不是 JSON：說明檔案可能損壞', () => {
    let error;
    try {
      JSON.parse('not json');
    } catch (e) {
      error = e;
    }
    const msg = cloudRestoreFailureMessage(error);
    expect(msg).toContain('檔案可能損壞');
    expect(msg).not.toContain('解密失敗');
  });

  it('其他錯誤附上原因，不說成解密失敗', () => {
    const msg = cloudRestoreFailureMessage(new Error('雲端上的檔案不是 LifeSync 的資料格式'));
    expect(msg).toContain('還原失敗：雲端上的檔案不是 LifeSync 的資料格式');
    expect(msg).not.toContain('解密失敗');
  });
});
