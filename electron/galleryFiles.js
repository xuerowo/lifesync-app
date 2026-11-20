import path from 'path';
import fs from 'fs/promises';
import { createReadStream, constants as fsConstants } from 'fs';
import crypto from 'crypto';

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

/** 計算檔案內容的 sha256（十六進位字串），用串流讀取以免大檔吃光記憶體 */
export function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** 同名檔案的內容不同、改用的檔名最多試幾次 */
const MAX_NAME_ATTEMPTS = 100;

/**
 * 把一張圖片複製進圖庫，且不蓋掉圖庫裡原有的同名圖片。
 *
 * 1. 圖庫裡沒有同名檔案：直接複製。
 * 2. 有同名檔案而且內容相同（先比大小，再比 sha256）：直接沿用，不再複製。
 * 3. 有同名檔案但內容不同：改用 `<原檔名>-<內容 sha256 前 8 碼><副檔名>`；
 *    該名稱也存在時，內容相同就沿用，不同就再加上 `-2`、`-3`…（幾乎不會發生）。
 *
 * 複製時使用「目標已存在就失敗」的模式，所以絕不會覆寫圖庫裡的檔案。
 * 副檔名不是圖片（IMAGE_EXTENSIONS）的檔案一律拒絕，丟出 code 為 NOT_IMAGE 的錯誤。
 *
 * @param {string} sourcePath 原始圖片的路徑
 * @param {string} galleryDir 圖庫資料夾（需已存在）
 * @returns {Promise<{ name: string, targetPath: string, reused: boolean }>}
 *   name 是圖庫裡實際使用的檔名；reused 表示沿用了內容相同的既有檔案
 */
export async function copyImageIntoGallery(sourcePath, galleryDir) {
  // 只複製圖片檔（和讀圖片、掃描卡池資料夾用同一份副檔名清單）：
  // 畫面傳來的路徑不一定是掃描結果，不能讓任意檔案（例如 .exe、.json）被複製進圖庫
  if (!hasImageExtension(sourcePath) || sourcePath.includes('\0')) {
    throw Object.assign(new Error(`不是允許的圖片格式，不加入圖庫：${sourcePath}`), { code: 'NOT_IMAGE' });
  }
  const baseName = path.basename(sourcePath);
  const ext = path.extname(baseName);
  const stem = baseName.slice(0, baseName.length - ext.length);

  let sourceStat = null;
  let sourceHash = null;
  const getSourceHash = async () => (sourceHash ??= await sha256File(sourcePath));

  const hasSameContent = async (targetPath) => {
    sourceStat ??= await fs.stat(sourcePath);
    const targetStat = await fs.stat(targetPath);
    if (!targetStat.isFile() || targetStat.size !== sourceStat.size) return false;
    return (await sha256File(targetPath)) === (await getSourceHash());
  };

  for (let attempt = 0; attempt < MAX_NAME_ATTEMPTS; attempt++) {
    let name = baseName;
    if (attempt > 0) {
      const shortHash = (await getSourceHash()).slice(0, 8);
      name = attempt === 1 ? `${stem}-${shortHash}${ext}` : `${stem}-${shortHash}-${attempt}${ext}`;
    }
    const targetPath = path.join(galleryDir, name);

    try {
      await fs.copyFile(sourcePath, targetPath, fsConstants.COPYFILE_EXCL);
      return { name, targetPath, reused: false };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    if (await hasSameContent(targetPath)) {
      return { name, targetPath, reused: true };
    }
  }
  throw new Error(`圖庫裡同名的檔案太多，無法加入 ${baseName}`);
}

/**
 * 記錄一筆失敗明細（最多 MAX_ERROR_DETAILS 筆）
 */
export function pushError(errors, name, reason) {
  if (errors.length < MAX_ERROR_DETAILS) {
    errors.push({ name, reason });
  }
}
