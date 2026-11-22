import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { restoreBackupGallery } from '../electron/backupGallery.ts';
import type { CloudProgress } from '../src/types/electronApi.ts';

// 測試只在系統暫存資料夾內操作，不碰真實資料
let tmpRoot: string;
let srcDir: string;
let destDir: string;

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lifesync-backup-gallery-test-'));
  srcDir = path.join(tmpRoot, 'backup', 'gallery');
  destDir = path.join(tmpRoot, 'data', 'gallery');
  await fs.mkdir(destDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

const writeSrc = async (name: string, content: string) => {
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(path.join(srcDir, name), content);
};

describe('restoreBackupGallery', () => {
  it('備份裡沒有 gallery 資料夾：不算錯，回報 found: false', async () => {
    const result = await restoreBackupGallery(srcDir, destDir);
    expect(result).toEqual({ found: false, total: 0, copied: 0, failed: 0, errors: [], listError: null, aborted: false });
  });

  it('複製所有圖片，同名的會被蓋掉', async () => {
    await writeSrc('a.png', 'A');
    await writeSrc('b.jpg', 'B-new');
    await fs.writeFile(path.join(destDir, 'b.jpg'), 'B-old');
    const result = await restoreBackupGallery(srcDir, destDir);
    expect(result).toMatchObject({ found: true, total: 2, copied: 2, failed: 0, errors: [], listError: null });
    expect(await fs.readFile(path.join(destDir, 'a.png'), 'utf-8')).toBe('A');
    expect(await fs.readFile(path.join(destDir, 'b.jpg'), 'utf-8')).toBe('B-new');
  });

  it('備份裡的子資料夾略過，不算失敗，也不會擋住其他圖片', async () => {
    await writeSrc('a.png', 'A');
    await fs.mkdir(path.join(srcDir, 'sub'), { recursive: true });
    await fs.writeFile(path.join(srcDir, 'sub', 'inner.png'), 'X');
    await writeSrc('z.png', 'Z');
    const result = await restoreBackupGallery(srcDir, destDir);
    expect(result).toMatchObject({ total: 2, copied: 2, failed: 0 });
    expect((await fs.readdir(destDir)).sort()).toEqual(['a.png', 'z.png']);
  });

  it('有一張複製失敗：記下檔名和原因，繼續複製後面的', async () => {
    await writeSrc('a.png', 'A');
    await writeSrc('b.png', 'B');
    await writeSrc('c.png', 'C');
    // 圖庫裡已經有一個叫 b.png 的資料夾：這張一定複製不過去（模擬檔案被鎖住之類的狀況）
    await fs.mkdir(path.join(destDir, 'b.png'));
    const result = await restoreBackupGallery(srcDir, destDir);
    expect(result).toMatchObject({ found: true, total: 3, copied: 2, failed: 1, listError: null });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe('b.png');
    expect(result.errors[0].reason).not.toBe('');
    expect(await fs.readFile(path.join(destDir, 'c.png'), 'utf-8')).toBe('C');
  });

  it('gallery 不是資料夾（是檔案）時當成沒有圖庫', async () => {
    await fs.mkdir(path.dirname(srcDir), { recursive: true });
    await fs.writeFile(srcDir, 'not a folder');
    const result = await restoreBackupGallery(srcDir, destDir);
    expect(result.found).toBe(false);
    expect(result.listError).toBeNull();
  });

  it('取消時停在下一張之前，回報 aborted 和已經複製的張數', async () => {
    await writeSrc('a.png', 'A');
    await writeSrc('b.png', 'B');
    await writeSrc('c.png', 'C');
    let calls = 0;
    const progress: CloudProgress[] = [];
    const result = await restoreBackupGallery(srcDir, destDir, {
      shouldAbort: () => calls++ >= 1, // 第一張之後就取消
      onProgress: (p) => progress.push(p),
    });
    expect(result).toMatchObject({ aborted: true, total: 3, copied: 1, failed: 0 });
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ current: 1, total: 3 });
    expect(progress[0].message).toMatch(/^正在還原圖庫：/);
  });
});
