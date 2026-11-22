import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { IpcMainInvokeEvent } from 'electron';
import { encryptBuffer, decryptBuffer } from '../electron/galleryCrypto.ts';
import type { GalleryDownloadResults, GalleryUploadResults } from '../src/types/electronApi.ts';

/** 測試只讀存在的檔案，所以 get 當作一定有值（不存在時照樣是 undefined，測試會失敗） */
interface FileStore extends Map<string, Buffer> {
  get(key: string): Buffer;
}
/** 上傳、下載圖庫的結果：測試直接讀各個欄位（值不對時斷言本身會失敗），所以型別放寬成兩種結果的欄位都有 */
interface GalleryRun {
  success: boolean;
  error: string;
  aborted: boolean;
  results: GalleryUploadResults & GalleryDownloadResults;
}
type Handler = (event: IpcMainInvokeEvent, payload: unknown) => Promise<GalleryRun>;

// 模擬的 WebDAV 雲端：不連任何真實伺服器
const cloud = {
  files: new Map() as FileStore, // basename -> Buffer
  failDownload: new Set<string>(),
  calls: [] as string[],
};

vi.mock('webdav', () => ({
  createClient: () => ({
    createDirectory: async () => {
      throw new Error('already exists');
    },
    getDirectoryContents: async () =>
      [...cloud.files.keys()].map(basename => ({
        type: 'file',
        basename,
        filename: `/gallery/${basename}`,
      })),
    getFileContents: async (filename: string) => {
      const basename = filename.replace('/gallery/', '');
      if (cloud.failDownload.has(basename)) throw new Error('network down');
      return cloud.files.get(basename);
    },
    putFileContents: async (filename: string, buffer: Buffer) => {
      cloud.calls.push(filename);
      cloud.files.set(filename.replace('/gallery/', ''), Buffer.from(buffer));
      return true;
    },
  }),
}));

const { setupCloudHandlers } = await import('../electron/cloudManager.ts');

const PASSWORD = 'pw-for-tests';
const config = { url: 'https://webdav.invalid', username: 'u', password: 'p' };
// 處理程序只用到 event.sender.send（送進度給畫面）
const event = { sender: { send: () => {} } } as unknown as IpcMainInvokeEvent;

let tmpRoot: string;
let galleryDir: string;
let handlers: Record<string, Handler>;

beforeEach(async () => {
  cloud.files.clear();
  cloud.failDownload.clear();
  cloud.calls = [];
  // 測試只在系統暫存資料夾內操作，不碰真實資料
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lifesync-gallery-test-'));
  galleryDir = path.join(tmpRoot, 'userData', 'gallery'); // 刻意不先建立
  handlers = {};
  setupCloudHandlers({ handle: (name: string, fn: Handler) => { handlers[name] = fn; } }, { GALLERY_DIR: galleryDir });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

const restore = () => handlers['cloud-restore-gallery'](event, { config, masterPassword: PASSWORD });
const sync = () => handlers['cloud-sync-gallery'](event, { config, masterPassword: PASSWORD });
const putCloud = async (basename: string, content: string, password = PASSWORD) => {
  cloud.files.set(basename, await encryptBuffer(Buffer.from(content), password));
};

describe('cloud-restore-gallery', () => {
  it('圖庫資料夾不存在時會自動建立並成功還原', async () => {
    await putCloud('a.png.e2ee', 'AAA');
    await putCloud('b.jpg.e2ee', 'BBB');
    const res = await restore();
    expect(res.success).toBe(true);
    expect(res.results).toMatchObject({ downloaded: 2, skipped: 0, failed: 0, total: 2 });
    expect(res.results.errors).toEqual([]);
    expect(await fs.readFile(path.join(galleryDir, 'a.png'), 'utf-8')).toBe('AAA');
    expect(await fs.readFile(path.join(galleryDir, 'b.jpg'), 'utf-8')).toBe('BBB');
  });

  it('只去掉結尾的 .e2ee', async () => {
    await putCloud('a.e2ee.e2ee', 'X');
    const res = await restore();
    expect(res.results.downloaded).toBe(1);
    expect(await fs.readFile(path.join(galleryDir, 'a.e2ee'), 'utf-8')).toBe('X');
  });

  it('惡意檔名（含已解碼的反斜線）被略過，且不會寫到圖庫以外', async () => {
    await putCloud('..\\evil.txt.e2ee', 'EVIL');
    await putCloud('../evil2.txt.e2ee', 'EVIL');
    await putCloud('ok.png.e2ee', 'OK');
    const res = await restore();
    expect(res.results).toMatchObject({ downloaded: 1, failed: 2 });
    expect(res.results.errors.map(e => e.name).sort()).toEqual(['../evil2.txt.e2ee', '..\\evil.txt.e2ee'].sort());
    const parentEntries = await fs.readdir(path.dirname(galleryDir));
    expect(parentEntries).toEqual(['gallery']);
    expect(await fs.readdir(galleryDir)).toEqual(['ok.png']);
  });

  it('本地已存在的檔案略過', async () => {
    await fs.mkdir(galleryDir, { recursive: true });
    await fs.writeFile(path.join(galleryDir, 'a.png'), 'LOCAL');
    await putCloud('a.png.e2ee', 'CLOUD');
    const res = await restore();
    expect(res.results).toMatchObject({ downloaded: 0, skipped: 1, failed: 0 });
    expect(await fs.readFile(path.join(galleryDir, 'a.png'), 'utf-8')).toBe('LOCAL');
  });

  it('密碼錯誤：計為失敗、說明原因、不留下任何檔案（含暫存檔）', async () => {
    await putCloud('a.png.e2ee', 'AAA', 'other-password');
    const res = await restore();
    expect(res.results).toMatchObject({ downloaded: 0, failed: 1 });
    expect(res.results.errors[0].name).toBe('a.png');
    expect(res.results.errors[0].reason).toMatch(/解密失敗/);
    expect(await fs.readdir(galleryDir)).toEqual([]);
  });

  it('下載失敗：不留下半截檔，下次還原可以重新下載', async () => {
    await putCloud('a.png.e2ee', 'AAA');
    cloud.failDownload.add('a.png.e2ee');
    const first = await restore();
    expect(first.results).toMatchObject({ downloaded: 0, failed: 1 });
    expect(first.results.errors[0]).toEqual({ name: 'a.png', reason: 'network down' });
    expect(await fs.readdir(galleryDir)).toEqual([]);

    cloud.failDownload.clear();
    const second = await restore();
    expect(second.results).toMatchObject({ downloaded: 1, skipped: 0, failed: 0 });
  });

  it('寫入正式檔名失敗時刪除暫存檔', async () => {
    await putCloud('a.png.e2ee', 'AAA');
    const renameSpy = vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('disk full'));
    const res = await restore();
    renameSpy.mockRestore();
    expect(res.results.failed).toBe(1);
    expect(res.results.errors[0].reason).toBe('disk full');
    expect(await fs.readdir(galleryDir)).toEqual([]);
  });

  it('失敗明細最多 20 筆', async () => {
    for (let i = 0; i < 25; i++) await putCloud(`bad${i}|.png.e2ee`, 'x');
    const res = await restore();
    expect(res.results.failed).toBe(25);
    expect(res.results.errors).toHaveLength(20);
  });
});

describe('cloud-sync-gallery', () => {
  it('圖庫資料夾不存在時不會丟出 ENOENT，並建立資料夾', async () => {
    const res = await sync();
    expect(res.success).toBe(true);
    expect(res.results).toMatchObject({ uploaded: 0, skipped: 0, failed: 0, total: 0 });
    expect((await fs.stat(galleryDir)).isDirectory()).toBe(true);
  });

  it('上傳加密檔，已存在的略過，下載暫存檔不上傳', async () => {
    await fs.mkdir(galleryDir, { recursive: true });
    await fs.writeFile(path.join(galleryDir, 'new.png'), 'NEW');
    await fs.writeFile(path.join(galleryDir, 'old.png'), 'OLD');
    await fs.writeFile(path.join(galleryDir, 'half.png.download.tmp'), 'HALF');
    await putCloud('old.png.e2ee', 'OLD');
    const res = await sync();
    expect(res.results).toMatchObject({ uploaded: 1, skipped: 1, failed: 0, total: 2 });
    expect(cloud.calls).toEqual(['/gallery/new.png.e2ee']);
    const decrypted = await decryptBuffer(cloud.files.get('new.png.e2ee'), PASSWORD);
    expect(decrypted.toString()).toBe('NEW');
  });

  it('讀不到的項目計為失敗並記下原因', async () => {
    await fs.mkdir(path.join(galleryDir, 'subdir'), { recursive: true });
    const res = await sync();
    expect(res.results.failed).toBe(1);
    expect(res.results.errors[0].name).toBe('subdir');
    expect(typeof res.results.errors[0].reason).toBe('string');
  });
});
