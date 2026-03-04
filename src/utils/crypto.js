/**
 * 端到端加密 (E2EE) 工具模組
 * 使用 Web Crypto API (AES-GCM) 進行本地加解密
 */

const ITERATIONS = 100000;
const ALGO = 'AES-GCM';

/**
 * 從密碼與鹽值衍生加密金鑰
 */
async function deriveKey(password, salt) {
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
 * @param {string|Uint8Array} data - 要加密的數據
 * @param {string} password - 用戶主密碼
 * @returns {Promise<ArrayBuffer>} - 返回包含 [鹽(16位) + IV(12位) + 加密數據] 的 ArrayBuffer
 */
export async function encryptData(data, password) {
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
 * @param {ArrayBuffer} encryptedBuffer - 包含 [鹽 + IV + 加密數據] 的 ArrayBuffer
 * @param {string} password - 用戶主密碼
 * @returns {Promise<string>} - 返回解密後的字串
 */
export async function decryptData(encryptedBuffer, password) {
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
    throw new Error('解密失敗，可能是密碼錯誤或數據損壞');
  }
}
