import path from 'path';

/** 雲端加密檔的副檔名 */
export const ENCRYPTED_EXT = '.e2ee';

/** 下載中的暫存檔副檔名；寫完才改成正式檔名，避免中斷時留下半截檔 */
export const DOWNLOAD_TMP_EXT = '.download.tmp';

/** 回傳給畫面的錯誤明細最多幾筆 */
export const MAX_ERROR_DETAILS = 20;

// Windows 不允許出現在檔名中的字元，以及控制字元（0x00-0x1F、0x7F）
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[<>:"|?*\u0000-\u001f\u007f]/;

// Windows 保留的裝置名稱（CON、NUL、COM1…），不論有沒有副檔名都不能當檔名
const RESERVED_DEVICE_NAMES = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

/**
 * 把雲端上的檔名（例如 `photo.png.e2ee`）轉成可以安全寫進圖庫的本地檔名。
 *
 * - 只去掉「結尾」的 `.e2ee`：`a.e2ee.e2ee` → `a.e2ee`
 * - 名稱不安全時回傳 null：空字串、`.`、`..`、含 `/` 或 `\`、
 *   含 Windows 不允許的字元 `<>:"|?*`、含控制字元、Windows 保留裝置名稱、
 *   或是下載暫存檔的名稱
 *
 * @param {string} remoteBasename 雲端檔名（已由 webdav 套件解碼）
 * @returns {string|null}
 */
export function toSafeLocalName(remoteBasename) {
  if (typeof remoteBasename !== 'string') return null;

  const name = remoteBasename.endsWith(ENCRYPTED_EXT)
    ? remoteBasename.slice(0, -ENCRYPTED_EXT.length)
    : remoteBasename;

  if (name === '' || name === '.' || name === '..') return null;
  if (name.includes('/') || name.includes('\\')) return null;
  if (FORBIDDEN_CHARS.test(name)) return null;
  if (RESERVED_DEVICE_NAMES.test(name)) return null;
  if (name.endsWith(DOWNLOAD_TMP_EXT)) return null;

  return name;
}

/**
 * 把檔名接在資料夾後面，並確認結果就在該資料夾「正下方」。
 * 不是的話回傳 null（多一層防護，避免檔案寫到資料夾以外）。
 *
 * @param {string} dir
 * @param {string} name
 * @returns {string|null}
 */
export function resolveInsideDir(dir, name) {
  const root = path.resolve(dir);
  const target = path.resolve(root, name);
  if (path.dirname(target) !== root) return null;
  if (target === root) return null;
  return target;
}

/** 允許讀取的圖片副檔名（與掃描卡池資料夾時篩選的格式相同） */
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

/** 檔名（或路徑）的副檔名是不是允許的圖片格式，不分大小寫 */
export function hasImageExtension(filePath) {
  if (typeof filePath !== 'string') return false;
  return IMAGE_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

/**
 * 決定「讀圖片」功能實際要讀哪個檔案；不允許讀的就回傳 null。
 *
 * - 一律只讀圖片副檔名的檔案（不論相對或絕對路徑）。
 * - 相對路徑（例如圖庫的 `gallery\a.png`）以資料資料夾為基準，
 *   解析後必須仍在資料資料夾裡面，不能用 `..` 跳出去。
 * - 絕對路徑（舊卡池直接指向原始資料夾的圖片）照常允許。
 *
 * @param {string} dataDir 資料資料夾
 * @param {string} filePath 畫面傳來的路徑
 * @returns {string|null} 要讀取的絕對路徑
 */
export function resolveImageReadPath(dataDir, filePath) {
  if (typeof filePath !== 'string' || filePath === '' || filePath.includes('\0')) return null;
  if (!hasImageExtension(filePath)) return null;

  if (path.isAbsolute(filePath)) return path.resolve(filePath);

  const root = path.resolve(dataDir);
  const target = path.resolve(root, filePath);
  const rel = path.relative(root, target);
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null;
  return target;
}

/**
 * 記錄一筆失敗明細（最多 MAX_ERROR_DETAILS 筆）
 */
export function pushError(errors, name, reason) {
  if (errors.length < MAX_ERROR_DETAILS) {
    errors.push({ name, reason });
  }
}
