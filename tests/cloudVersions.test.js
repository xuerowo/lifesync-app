import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  versionName, parseVersionName, selectVersionsToPrune, cloudPathParts, utcStamp,
  keepPreviousVersion, pruneOldVersions, MAX_CLOUD_VERSIONS,
} from '../electron/cloudVersions.js';
import { cloudUploadSuccessMessage } from '../src/domain/cloudUpload.js';

// ---- 模擬的 WebDAV 雲端：只存在記憶體裡，不連任何真實伺服器 ----
const cloud = {
  files: new Map(), // 完整路徑（例如 /lifesync_backup_e2ee.dat）→ Buffer
  failExists: false,
  failCopy: false,
  failGet: false,
  failPut: new Set(), // 寫入這些路徑時失敗
  failDelete: new Set(),
  calls: [],
};

const resetCloud = () => {
  cloud.files.clear();
  cloud.failExists = false;
  cloud.failCopy = false;
  cloud.failGet = false;
  cloud.failPut.clear();
  cloud.failDelete.clear();
  cloud.calls = [];
};

const norm = (p) => `/${String(p).replace(/^\/+/, '')}`;

const fakeClient = {
  exists: async (p) => {
    cloud.calls.push(['exists', norm(p)]);
    if (cloud.failExists) throw new Error('network down');
    return cloud.files.has(norm(p));
  },
  getDirectoryContents: async (dir) => {
    cloud.calls.push(['list', dir]);
    const prefix = dir === '/' ? '/' : `${dir}/`;
    return [...cloud.files.keys()]
      .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('/'))
      .map((k) => ({ type: 'file', filename: k, basename: k.slice(prefix.length) }));
  },
  copyFile: async (from, to, options = {}) => {
    cloud.calls.push(['copy', norm(from), norm(to), options]);
    if (cloud.failCopy) throw new Error('405 Method Not Allowed');
    if (options.overwrite === false && cloud.files.has(norm(to))) throw new Error('412 Precondition Failed');
    cloud.files.set(norm(to), Buffer.from(cloud.files.get(norm(from))));
  },
  getFileContents: async (p) => {
    cloud.calls.push(['get', norm(p)]);
    if (cloud.failGet) throw new Error('download failed');
    return cloud.files.get(norm(p));
  },
  putFileContents: async (p, content, options = {}) => {
    cloud.calls.push(['put', norm(p), options]);
    if (cloud.failPut.has(norm(p))) throw new Error('507 Insufficient Storage');
    // 和真正的 webdav 套件一樣：overwrite: false 而目標已存在時回傳 false，不丟錯
    if (options.overwrite === false && cloud.files.has(norm(p))) return false;
    cloud.files.set(norm(p), Buffer.from(content));
    return true;
  },
  deleteFile: async (p) => {
    cloud.calls.push(['delete', norm(p)]);
    if (cloud.failDelete.has(norm(p))) throw new Error('403 Forbidden');
    cloud.files.delete(norm(p));
  },
};

vi.mock('webdav', () => ({ createClient: () => fakeClient }));
const { setupCloudHandlers } = await import('../electron/cloudManager.js');

const FILE = 'lifesync_backup_e2ee.dat';
const MAIN = `/${FILE}`;
const at = (iso) => new Date(iso);

beforeEach(resetCloud);

describe('檔名規則', () => {
  it('舊版檔名用 UTC 時間，同一秒的第 2 份起加尾碼', () => {
    const d = at('2026-11-20T01:41:12Z');
    expect(utcStamp(d)).toBe('20261120-014112');
    expect(versionName(FILE, d)).toBe('lifesync_backup_e2ee.prev-20261120-014112Z.dat');
    expect(versionName(FILE, d, 2)).toBe('lifesync_backup_e2ee.prev-20261120-014112Z-2.dat');
    expect(versionName('noext', d)).toBe('noext.prev-20261120-014112Z');
  });

  it('只認得自己的舊版檔名', () => {
    expect(parseVersionName(FILE, 'lifesync_backup_e2ee.prev-20261120-014112Z.dat')).toEqual({
      name: 'lifesync_backup_e2ee.prev-20261120-014112Z.dat', stamp: '20261120-014112', n: 1,
    });
    expect(parseVersionName(FILE, 'lifesync_backup_e2ee.prev-20261120-014112Z-3.dat').n).toBe(3);
    for (const other of [
      FILE,
      'lifesync_backup_e2ee.prev-20261120-014112.dat', // 少了 Z
      'lifesync_backup_e2ee.prev-2026112-014112Z.dat',
      'lifesync_backup_e2ee.prev-20261120-014112Z.dat.bak',
      'xlifesync_backup_e2ee.prev-20261120-014112Z.dat',
      'lifesync_backup_e2eeXprev-20261120-014112Z.dat', // 「.」不能被當成任意字元
      'my-notes.prev-20261120-014112Z.dat',
      'gallery',
    ]) {
      expect(parseVersionName(FILE, other)).toBeNull();
    }
  });

  it('清理時依時間刪最舊的，同一秒內依尾碼排序，其他檔案不列入', () => {
    const names = [
      FILE,
      'other.txt',
      'lifesync_backup_e2ee.prev-20261120-010000Z-2.dat',
      'lifesync_backup_e2ee.prev-20261119-230000Z.dat',
      'lifesync_backup_e2ee.prev-20261120-010000Z.dat',
      'lifesync_backup_e2ee.prev-20261121-000000Z.dat',
    ];
    expect(selectVersionsToPrune(FILE, names, 2)).toEqual([
      'lifesync_backup_e2ee.prev-20261119-230000Z.dat',
      'lifesync_backup_e2ee.prev-20261120-010000Z.dat',
    ]);
    expect(selectVersionsToPrune(FILE, names, 5)).toEqual([]);
  });

  it('雲端路徑：有沒有開頭的 / 都一樣，子資料夾也可以', () => {
    expect(cloudPathParts(FILE)).toEqual({ dir: '/', base: FILE, full: MAIN });
    expect(cloudPathParts(MAIN)).toEqual({ dir: '/', base: FILE, full: MAIN });
    expect(cloudPathParts('backup/a.dat')).toEqual({ dir: '/backup', base: 'a.dat', full: '/backup/a.dat' });
  });
});

describe('keepPreviousVersion', () => {
  it('雲端上還沒有檔案：不必保留舊版', async () => {
    expect(await keepPreviousVersion(fakeClient, FILE)).toEqual({ versionedAs: null, siblingNames: [] });
    expect(cloud.calls.some(([op]) => op === 'copy')).toBe(false);
  });

  it('有檔案：在伺服器上複製一份舊版，原檔不動', async () => {
    cloud.files.set(MAIN, Buffer.from('OLD'));
    const res = await keepPreviousVersion(fakeClient, FILE, { now: at('2026-11-20T01:41:12Z') });
    expect(res.versionedAs).toBe('lifesync_backup_e2ee.prev-20261120-014112Z.dat');
    expect(cloud.files.get('/lifesync_backup_e2ee.prev-20261120-014112Z.dat').toString()).toBe('OLD');
    expect(cloud.files.get(MAIN).toString()).toBe('OLD');
    expect(res.siblingNames).toContain(res.versionedAs);
  });

  it('同一秒已經有舊版：改用 -2，不蓋掉既有的舊版', async () => {
    cloud.files.set(MAIN, Buffer.from('NEW'));
    cloud.files.set('/lifesync_backup_e2ee.prev-20261120-014112Z.dat', Buffer.from('EARLIER'));
    const res = await keepPreviousVersion(fakeClient, FILE, { now: at('2026-11-20T01:41:12Z') });
    expect(res.versionedAs).toBe('lifesync_backup_e2ee.prev-20261120-014112Z-2.dat');
    expect(cloud.files.get('/lifesync_backup_e2ee.prev-20261120-014112Z.dat').toString()).toBe('EARLIER');
  });

  it('伺服器不支援複製：改成下載再另外上傳一份（不覆蓋既有檔案）', async () => {
    cloud.files.set(MAIN, Buffer.from('OLD'));
    cloud.failCopy = true;
    const res = await keepPreviousVersion(fakeClient, FILE, { now: at('2026-11-20T01:41:12Z') });
    expect(cloud.files.get(`/${res.versionedAs}`).toString()).toBe('OLD');
    const put = cloud.calls.find(([op]) => op === 'put');
    expect(put[2]).toEqual({ overwrite: false });
  });

  it('複製時不允許蓋掉同名檔案', async () => {
    cloud.files.set(MAIN, Buffer.from('OLD'));
    await keepPreviousVersion(fakeClient, FILE);
    expect(cloud.calls.find(([op]) => op === 'copy')[3]).toEqual({ overwrite: false });
  });

  it('備援方式遇到同名檔案（伺服器回傳「沒寫入」）：當成失敗', async () => {
    cloud.files.set(MAIN, Buffer.from('OLD'));
    cloud.failCopy = true;
    const realList = fakeClient.getDirectoryContents;
    // 模擬：清單裡還看不到，但伺服器上其實已經有同名檔案（例如另一台電腦剛好同時上傳）
    fakeClient.getDirectoryContents = async () => [];
    cloud.files.set('/lifesync_backup_e2ee.prev-20261120-014112Z.dat', Buffer.from('RACE'));
    try {
      await expect(keepPreviousVersion(fakeClient, FILE, { now: at('2026-11-20T01:41:12Z') })).rejects.toThrow('同名');
      expect(cloud.files.get('/lifesync_backup_e2ee.prev-20261120-014112Z.dat').toString()).toBe('RACE');
    } finally {
      fakeClient.getDirectoryContents = realList;
    }
  });

  it('複製和備援方式都失敗：丟錯', async () => {
    cloud.files.set(MAIN, Buffer.from('OLD'));
    cloud.failCopy = true;
    cloud.failGet = true;
    await expect(keepPreviousVersion(fakeClient, FILE)).rejects.toThrow(/download failed.*405/);
  });

  it('連線失敗（不確定雲端上有沒有檔案）：丟錯，不會當成「沒有檔案」', async () => {
    cloud.failExists = true;
    await expect(keepPreviousVersion(fakeClient, FILE)).rejects.toThrow('network down');
  });
});

describe('pruneOldVersions', () => {
  it('刪除失敗的會回報，其餘照刪', async () => {
    const names = [1, 2, 3].map((h) => `lifesync_backup_e2ee.prev-20261120-0${h}0000Z.dat`);
    for (const n of names) cloud.files.set(`/${n}`, Buffer.from(n));
    cloud.failDelete.add(`/${names[0]}`);
    const res = await pruneOldVersions(fakeClient, FILE, names, 1);
    expect(res.pruned).toEqual([names[1]]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain('403');
  });
});

describe('cloud-upload（模擬的雲端）', () => {
  let upload;
  beforeEach(() => {
    const handlers = {};
    setupCloudHandlers({ handle: (name, fn) => { handlers[name] = fn; } }, { GALLERY_DIR: '/unused' });
    upload = (content) =>
      handlers['cloud-upload']({}, {
        config: { url: 'https://webdav.invalid', username: 'u', password: 'p' },
        fileName: FILE,
        encryptedData: content,
      });
  });

  // 只算符合舊版命名規則、放在根目錄的檔案
  const versionNames = () => [...cloud.files.keys()].filter((k) => parseVersionName(FILE, k.slice(1))).sort();

  it('第一次上傳：沒有舊版可留，直接上傳', async () => {
    const res = await upload('V1');
    expect(res).toMatchObject({ success: true, versionedAs: null });
    expect(cloud.files.get(MAIN).toString()).toBe('V1');
    expect(versionNames()).toEqual([]);
  });

  it('之後每次上傳，先把原本那份留成舊版再覆蓋', async () => {
    await upload('V1');
    const res = await upload('V2');
    expect(res.success).toBe(true);
    expect(res.versionedAs).toMatch(/^lifesync_backup_e2ee\.prev-\d{8}-\d{6}Z(-\d+)?\.dat$/);
    expect(cloud.files.get(MAIN).toString()).toBe('V2');
    expect(cloud.files.get(`/${res.versionedAs}`).toString()).toBe('V1');
    // 先複製、後覆蓋
    const ops = cloud.calls.map(([op]) => op);
    expect(ops.lastIndexOf('copy')).toBeLessThan(ops.lastIndexOf('put'));
  });

  it(`最多保留 ${MAX_CLOUD_VERSIONS} 份舊版，刪最舊的；別的檔案（含名字很像的）不會被刪`, async () => {
    const unrelated = [
      '/notes.txt',
      '/lifesync_backup_e2ee.dat.bak',
      '/lifesync_backup_e2ee.prev-manual.dat',
      '/gallery/a.png.e2ee',
    ];
    for (const f of unrelated) cloud.files.set(f, Buffer.from('keep me'));
    // 先放 6 份舊版（比上限多 1），檔名時間都比現在早
    const oldVersions = [1, 2, 3, 4, 5, 6].map((d) => `/lifesync_backup_e2ee.prev-2026010${d}-000000Z.dat`);
    for (const f of oldVersions) cloud.files.set(f, Buffer.from(f));
    cloud.files.set(MAIN, Buffer.from('CURRENT'));

    const res = await upload('NEXT');
    expect(res.success).toBe(true);
    expect(res.warning).toBeNull();
    const versions = versionNames();
    expect(versions).toHaveLength(MAX_CLOUD_VERSIONS);
    // 留下最新的 4 份舊的 + 這次新留的那份
    expect(versions).toEqual([...oldVersions.slice(2), `/${res.versionedAs}`].sort());
    expect(cloud.files.get(`/${res.versionedAs}`).toString()).toBe('CURRENT');
    for (const f of unrelated) expect(cloud.files.get(f).toString()).toBe('keep me');
  });

  it('留舊版失敗：不上傳，雲端那份維持原樣，並說明原因', async () => {
    cloud.files.set(MAIN, Buffer.from('ONLY COPY'));
    cloud.failCopy = true;
    cloud.failGet = true;
    const res = await upload('BAD');
    expect(res.success).toBe(false);
    expect(res.error).toContain('這次沒有上傳');
    expect(cloud.files.get(MAIN).toString()).toBe('ONLY COPY');
    expect(cloud.calls.some(([op, p]) => op === 'put' && p === MAIN)).toBe(false);
  });

  it('連不上雲端（確認不了有沒有檔案）：不上傳', async () => {
    cloud.failExists = true;
    const res = await upload('X');
    expect(res.success).toBe(false);
    expect(res.error).toContain('network down');
    expect(cloud.calls.some(([op]) => op === 'put')).toBe(false);
  });

  it('上傳本身失敗：回報錯誤，留下的舊版還在、原檔不變', async () => {
    cloud.files.set(MAIN, Buffer.from('OLD'));
    cloud.failPut.add(MAIN);
    const res = await upload('NEW');
    expect(res.success).toBe(false);
    expect(res.error).toContain('507');
    expect(cloud.files.get(MAIN).toString()).toBe('OLD');
    expect(cloud.files.get(`/${res.versionedAs}`).toString()).toBe('OLD');
  });

  it('刪舊版失敗：上傳仍算成功，但附上提醒', async () => {
    const oldVersions = [1, 2, 3, 4, 5].map((d) => `/lifesync_backup_e2ee.prev-2026010${d}-000000Z.dat`);
    for (const f of oldVersions) cloud.files.set(f, Buffer.from(f));
    cloud.files.set(MAIN, Buffer.from('CURRENT'));
    cloud.failDelete.add(oldVersions[0]);
    const res = await upload('NEXT');
    expect(res.success).toBe(true);
    expect(cloud.files.get(MAIN).toString()).toBe('NEXT');
    expect(res.warning).toContain('沒有刪掉');
  });
});

describe('cloudUploadSuccessMessage', () => {
  it('第一次上傳只說成功', () => {
    expect(cloudUploadSuccessMessage({ success: true, versionedAs: null })).toBe('加密數據上傳成功！');
  });

  it('有留舊版時說明檔名、保留份數與怎麼找回', () => {
    const msg = cloudUploadSuccessMessage({ success: true, versionedAs: 'lifesync_backup_e2ee.prev-20261120-014112Z.dat', keep: 5 });
    expect(msg).toContain('lifesync_backup_e2ee.prev-20261120-014112Z.dat');
    expect(msg).toContain('最近 5 份');
    expect(msg).toContain('改名');
  });

  it('附上刪舊版失敗的提醒', () => {
    expect(cloudUploadSuccessMessage({ success: true, versionedAs: 'x', keep: 5, warning: '有 1 份' })).toContain('注意：有 1 份');
  });
});
