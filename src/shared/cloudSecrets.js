// 雲端密碼不跟著資料流出、也不被外來資料蓋掉的規則。
// 主程序（electron/main.js 匯出完整備份）與畫面端（設定頁的匯入、還原、雲端上傳下載）共用。
// 這個檔案必須維持純 JS，不可 import 瀏覽器或 Electron 專用模組。
import { normalizeData } from './defaultData.js';

/** cloudConfig 裡屬於機密、不可寫進備份檔的欄位（WebDAV 密碼與加密用的主密碼） */
export const CLOUD_SECRET_FIELDS = ['password', 'masterPassword'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * 回傳一份「密碼欄位清空」的資料，用於本地完整備份與雲端上傳。
 * 不修改傳入的物件；沒有 cloudConfig 時原樣回傳（淺層複製）。
 */
export function stripCloudSecrets(data) {
  if (!isPlainObject(data)) return data;
  if (!isPlainObject(data.cloudConfig)) return { ...data };
  const cloudConfig = { ...data.cloudConfig };
  for (const field of CLOUD_SECRET_FIELDS) {
    if (field in cloudConfig) cloudConfig[field] = '';
  }
  return { ...data, cloudConfig };
}

/** 匯入、還原、雲端下載拿到的內容是否像一份資料（必須是物件，不能是陣列、數字等） */
export function isImportableData(incoming) {
  return isPlainObject(incoming);
}

/**
 * 用外來資料（JSON 匯入、本地完整備份、雲端下載）蓋掉目前資料：
 * 外來資料有的欄位就取代，沒有的保留；但雲端設定一律保留這台電腦目前的
 * （網址、帳號、密碼、主密碼、是否啟用都不換），因為外來那份的密碼可能是空的、舊的，
 * 或是另一台電腦加密過、這台解不開的字串。
 * 外來資料不是物件時丟錯，呼叫端應視為匯入失敗。
 */
export function mergeIncomingData(current, incoming) {
  if (!isImportableData(incoming)) {
    throw new Error('檔案內容不是 LifeSync 的資料格式');
  }
  const base = isPlainObject(current) ? current : {};
  const merged = { ...base, ...incoming };
  if (isPlainObject(base.cloudConfig)) {
    merged.cloudConfig = base.cloudConfig;
  } else {
    delete merged.cloudConfig;
  }
  return normalizeData(merged);
}
