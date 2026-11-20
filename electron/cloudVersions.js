// 雲端上傳前保留舊版（H7）。
// 上傳會整份蓋掉雲端上的資料檔，所以蓋掉之前，先把雲端上原本那份複製成「舊版」，最多保留 5 份。
//
// 舊版檔名：lifesync_backup_e2ee.prev-20261120-014112Z.dat
//   - 時間用 UTC（世界標準時間，台灣時間減 8 小時，結尾的 Z 就是這個意思）：
//     多台電腦在不同時區、或日光節約時間切換時，依檔名排序仍然是正確的新舊順序，刪舊版才不會刪錯。
//   - 同一秒內上傳兩次時，後面再加 -2、-3。
// 清理舊版時只會刪除完全符合上面命名規則的檔案，雲端上的其他檔案一律不碰。
//
// 這個檔案不 import webdav，client 由呼叫端傳入，方便用模擬的雲端測試。
import path from 'path';

export const MAX_CLOUD_VERSIONS = 5;

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pad = (n) => String(n).padStart(2, '0');

/** 20261120-014112（UTC） */
export function utcStamp(date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

/** 'lifesync_backup_e2ee.dat' → { stem: 'lifesync_backup_e2ee', ext: '.dat' } */
function splitName(fileName) {
  const ext = path.posix.extname(fileName);
  return { stem: ext ? fileName.slice(0, -ext.length) : fileName, ext };
}

/**
 * 舊版的檔名。
 * @param {string} fileName 資料檔的檔名（不含資料夾）
 * @param {Date} date
 * @param {number} [n] 同一秒內的第幾份（1 不加尾碼）
 */
export function versionName(fileName, date, n = 1) {
  const { stem, ext } = splitName(fileName);
  return `${stem}.prev-${utcStamp(date)}Z${n > 1 ? `-${n}` : ''}${ext}`;
}

/**
 * 判斷某個檔名是不是我們自己的舊版檔名；是的話回傳排序用的資訊，不是就回傳 null。
 * @returns {{ name: string, stamp: string, n: number } | null}
 */
export function parseVersionName(fileName, candidate) {
  const { stem, ext } = splitName(fileName);
  const re = new RegExp(`^${escapeRegExp(stem)}\\.prev-(\\d{8}-\\d{6})Z(?:-(\\d+))?${escapeRegExp(ext)}$`);
  const m = re.exec(candidate);
  if (!m) return null;
  return { name: candidate, stamp: m[1], n: m[2] ? Number(m[2]) : 1 };
}

/**
 * 從雲端資料夾的檔名清單中，挑出超過保留份數、要刪掉的舊版（最舊的先刪）。
 * 只會挑出符合舊版命名規則的檔案。
 */
export function selectVersionsToPrune(fileName, names, keep = MAX_CLOUD_VERSIONS) {
  const versions = names
    .map((name) => parseVersionName(fileName, name))
    .filter(Boolean)
    .sort((a, b) => (a.stamp === b.stamp ? a.n - b.n : a.stamp < b.stamp ? -1 : 1));
  const excess = versions.length - Math.max(0, keep);
  return excess > 0 ? versions.slice(0, excess).map((v) => v.name) : [];
}

/** 把上傳時用的檔名拆成雲端上的資料夾與檔名：'a.dat' → { dir: '/', base: 'a.dat', full: '/a.dat' } */
export function cloudPathParts(fileName) {
  const full = path.posix.normalize(`/${String(fileName).replace(/\\/g, '/').replace(/^\/+/, '')}`);
  return { dir: path.posix.dirname(full), base: path.posix.basename(full), full };
}

const joinCloud = (dir, name) => path.posix.join(dir, name);

/**
 * 上傳前：雲端上已經有這個檔案時，先把它複製成舊版。
 * 失敗會丟錯，呼叫端必須因此取消上傳（不然蓋掉之後就救不回來了）。
 *
 * @param {object} client webdav 的 client
 * @param {string} fileName 要上傳的檔名
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ versionedAs: string|null, siblingNames: string[] }>}
 *   versionedAs：舊版的檔名（雲端上原本沒有檔案時是 null）；siblingNames：同一個資料夾裡的檔名（含新的舊版），清理時用
 */
export async function keepPreviousVersion(client, fileName, { now = new Date() } = {}) {
  const { dir, base, full } = cloudPathParts(fileName);
  // exists 只有在「確定不存在（404）」時才回傳 false；連線失敗等其他錯誤會丟錯，這時不可以繼續上傳
  if (!(await client.exists(full))) return { versionedAs: null, siblingNames: [] };

  const listing = await client.getDirectoryContents(dir);
  const siblingNames = listing.map((item) => item.basename).filter((name) => typeof name === 'string');
  const taken = new Set(siblingNames);
  let n = 1;
  let name = versionName(base, now, n);
  while (taken.has(name)) name = versionName(base, now, ++n);
  const target = joinCloud(dir, name);

  try {
    // 在伺服器上直接複製，不必下載再上傳；overwrite: false＝絕不蓋掉同名的既有檔案
    await client.copyFile(full, target, { overwrite: false });
  } catch (copyError) {
    // 有些 WebDAV 服務不支援複製（COPY）：改成下載下來再另外上傳一份
    try {
      const content = await client.getFileContents(full);
      // overwrite: false 時，目標已存在的話 webdav 套件會回傳 false 而不是丟錯
      const written = await client.putFileContents(target, content, { overwrite: false });
      if (written === false) throw new Error(`雲端上已經有同名的檔案：${name}`);
    } catch (fallbackError) {
      throw new Error(`${fallbackError?.message || fallbackError}（伺服器端複製也失敗：${copyError?.message || copyError}）`);
    }
  }
  return { versionedAs: name, siblingNames: [...siblingNames, name] };
}

/**
 * 上傳成功後：舊版超過保留份數時，刪掉最舊的。刪除失敗不影響上傳結果，只回報。
 * @returns {Promise<{ pruned: string[], errors: string[] }>}
 */
export async function pruneOldVersions(client, fileName, siblingNames, keep = MAX_CLOUD_VERSIONS) {
  const { dir, base } = cloudPathParts(fileName);
  const pruned = [];
  const errors = [];
  for (const name of selectVersionsToPrune(base, siblingNames, keep)) {
    try {
      await client.deleteFile(joinCloud(dir, name));
      pruned.push(name);
    } catch (e) {
      errors.push(`${name}：${e?.message || e}`);
    }
  }
  return { pruned, errors };
}
