/**
 * 端到端加密 (E2EE) 工具模組
 * 使用 Web Crypto API (AES-GCM) 進行本地加解密
 */

const ITERATIONS = 100000;
const ALGO = 'AES-GCM';

/** decryptData 解不開時，丟出的錯誤所帶的 code */
export const DECRYPT_FAILED = 'DECRYPT_FAILED';

/**
 * 從密碼與鹽值衍生加密金鑰
 */
async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGO, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 加密數據
 * @param data - 要加密的數據
 * @param password - 用戶主密碼
 * @returns 包含 [鹽(16位) + IV(12位) + 加密數據] 的 ArrayBuffer
 */
export async function encryptData(data: string | Uint8Array<ArrayBuffer>, password: string): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const encodedData = typeof data === 'string' ? enc.encode(data) : data;
  
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGO, iv: iv },
    key,
    encodedData
  );

  // 合併鹽、IV 與加密數據
  const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return result.buffer;
}

/**
 * 解密數據
 * @param encryptedBuffer - 包含 [鹽 + IV + 加密數據] 的 ArrayBuffer（或雲端下載回來的 Uint8Array）
 * @param password - 用戶主密碼
 * @returns 解密後的字串
 */
export async function decryptData(encryptedBuffer: ArrayBuffer | Uint8Array, password: string): Promise<string> {
  const fullData = new Uint8Array(encryptedBuffer);
  const salt = fullData.slice(0, 16);
  const iv = fullData.slice(16, 28);
  const data = fullData.slice(28);

  const key = await deriveKey(password, salt);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGO, iv: iv },
      key,
      data
    );
    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (e) {
    // 帶上錯誤碼，讓畫面自己決定怎麼說明（訊息本身已經以「解密失敗」開頭，畫面不要再加一次）
    throw Object.assign(new Error('解密失敗，可能是主密碼錯誤或資料損壞'), { code: DECRYPT_FAILED, cause: e });
  }
}
