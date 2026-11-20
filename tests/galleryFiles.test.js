import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import {
  toSafeLocalName, resolveInsideDir, pushError, MAX_ERROR_DETAILS,
  resolveImageReadPath, hasImageExtension, IMAGE_EXTENSIONS, copyImageIntoGallery, sha256File,
} from '../electron/galleryFiles.js';

describe('toSafeLocalName', () => {
  it('正常名稱只去掉結尾的 .e2ee', () => {
    expect(toSafeLocalName('photo.png.e2ee')).toBe('photo.png');
    expect(toSafeLocalName('我的 圖片 (1).jpg.e2ee')).toBe('我的 圖片 (1).jpg');
  });

  it('只去掉「結尾」的 .e2ee，不是第一個出現的', () => {
    expect(toSafeLocalName('a.e2ee.e2ee')).toBe('a.e2ee');
    expect(toSafeLocalName('x.e2ee.png.e2ee')).toBe('x.e2ee.png');
  });

  it('沒有 .e2ee 結尾時原樣回傳', () => {
    expect(toSafeLocalName('plain.png')).toBe('plain.png');
  });

  it('名稱中間有連續的點仍視為正常檔名', () => {
    expect(toSafeLocalName('wow...png.e2ee')).toBe('wow...png');
  });

  it('拒絕含路徑分隔符號的名稱（含 %5C 解碼後的反斜線）', () => {
    expect(toSafeLocalName('..\\..\\evil.png.e2ee')).toBeNull();
    expect(toSafeLocalName('..%5Cevil.png.e2ee'.replace('%5C', '\\'))).toBeNull();
    expect(toSafeLocalName(decodeURIComponent('..%5C..%5Cstartup.bat.e2ee'))).toBeNull();
    expect(toSafeLocalName('../evil.png.e2ee')).toBeNull();
    expect(toSafeLocalName('sub/evil.png.e2ee')).toBeNull();
    expect(toSafeLocalName('C:\\Windows\\evil.png.e2ee')).toBeNull();
  });

  it('拒絕空字串、. 與 ..', () => {
    expect(toSafeLocalName('')).toBeNull();
    expect(toSafeLocalName('.e2ee')).toBeNull();
    expect(toSafeLocalName('..e2ee')).toBeNull(); // 去掉 .e2ee 後變成 '.'
    expect(toSafeLocalName('...e2ee')).toBeNull(); // 去掉 .e2ee 後變成 '..'
    expect(toSafeLocalName('.')).toBeNull();
    expect(toSafeLocalName('..')).toBeNull();
  });

  it('拒絕 Windows 保留字元與控制字元', () => {
    for (const ch of ['<', '>', ':', '"', '|', '?', '*']) {
      expect(toSafeLocalName(`a${ch}b.png.e2ee`)).toBeNull();
    }
    expect(toSafeLocalName('C:evil.png.e2ee')).toBeNull();
    expect(toSafeLocalName('a\u0000b.png.e2ee')).toBeNull();
    expect(toSafeLocalName('a\nb.png.e2ee')).toBeNull();
    expect(toSafeLocalName('a\u001fb.png.e2ee')).toBeNull();
  });

  it('拒絕 Windows 保留裝置名稱與下載暫存檔名稱', () => {
    expect(toSafeLocalName('CON.e2ee')).toBeNull();
    expect(toSafeLocalName('nul.png.e2ee')).toBeNull();
    expect(toSafeLocalName('com1.jpg.e2ee')).toBeNull();
    expect(toSafeLocalName('a.png.download.tmp.e2ee')).toBeNull();
    // 只是開頭相同的正常名稱不受影響
    expect(toSafeLocalName('console.png.e2ee')).toBe('console.png');
  });

  it('非字串回傳 null', () => {
    expect(toSafeLocalName(undefined)).toBeNull();
    expect(toSafeLocalName(null)).toBeNull();
    expect(toSafeLocalName(123)).toBeNull();
  });
});

describe('resolveInsideDir', () => {
  const dir = path.resolve('some', 'gallery');

  it('正常檔名得到資料夾正下方的路徑', () => {
    expect(resolveInsideDir(dir, 'a.png')).toBe(path.join(dir, 'a.png'));
  });

  it('會跳出資料夾或落在子資料夾的名稱回傳 null', () => {
    expect(resolveInsideDir(dir, '../a.png')).toBeNull();
    expect(resolveInsideDir(dir, 'sub/a.png')).toBeNull();
    expect(resolveInsideDir(dir, '..')).toBeNull();
    expect(resolveInsideDir(dir, '.')).toBeNull();
    expect(resolveInsideDir(dir, path.resolve('elsewhere', 'a.png'))).toBeNull();
  });
});

describe('pushError', () => {
  it(`最多只保留 ${MAX_ERROR_DETAILS} 筆`, () => {
    const errors = [];
    for (let i = 0; i < 30; i++) pushError(errors, `f${i}`, 'x');
    expect(errors).toHaveLength(MAX_ERROR_DETAILS);
    expect(errors[0]).toEqual({ name: 'f0', reason: 'x' });
  });
});

describe('resolveImageReadPath', () => {
  const dataDir = path.resolve('some', 'data');

  it('圖庫的相對路徑以資料資料夾為基準', () => {
    expect(resolveImageReadPath(dataDir, path.join('gallery', 'a.png'))).toBe(path.join(dataDir, 'gallery', 'a.png'));
    expect(resolveImageReadPath(dataDir, 'gallery/b.JPG')).toBe(path.join(dataDir, 'gallery', 'b.JPG'));
    expect(resolveImageReadPath(dataDir, 'c.webp')).toBe(path.join(dataDir, 'c.webp'));
  });

  it('相對路徑不能跳出資料資料夾', () => {
    expect(resolveImageReadPath(dataDir, '../a.png')).toBeNull();
    expect(resolveImageReadPath(dataDir, 'gallery/../../a.png')).toBeNull();
    expect(resolveImageReadPath(dataDir, '..\\..\\Windows\\a.png')).toBeNull();
  });

  it('資料夾內以「..」開頭的檔名仍可讀', () => {
    expect(resolveImageReadPath(dataDir, '..a.png')).toBe(path.join(dataDir, '..a.png'));
  });

  it('絕對路徑只要是圖片檔就允許（舊卡池直接指向原始資料夾）', () => {
    const abs = path.resolve('pictures', '原圖', 'x.jpeg');
    expect(resolveImageReadPath(dataDir, abs)).toBe(abs);
    for (const ext of IMAGE_EXTENSIONS) {
      expect(resolveImageReadPath(dataDir, path.resolve('p', `x${ext.toUpperCase()}`))).not.toBeNull();
    }
  });

  it('不是圖片副檔名一律拒絕', () => {
    expect(resolveImageReadPath(dataDir, 'lifesync-data.json')).toBeNull();
    expect(resolveImageReadPath(dataDir, path.join(dataDir, 'lifesync-data.json'))).toBeNull();
    expect(resolveImageReadPath(dataDir, path.resolve('Windows', 'win.ini'))).toBeNull();
    expect(resolveImageReadPath(dataDir, path.resolve('p', 'a.png.exe'))).toBeNull();
    expect(resolveImageReadPath(dataDir, path.resolve('p', 'png'))).toBeNull();
  });

  it('空值、非字串與含 NUL 字元的路徑拒絕', () => {
    expect(resolveImageReadPath(dataDir, '')).toBeNull();
    expect(resolveImageReadPath(dataDir, undefined)).toBeNull();
    expect(resolveImageReadPath(dataDir, 42)).toBeNull();
    expect(resolveImageReadPath(dataDir, 'a\u0000.png')).toBeNull();
  });

  it.runIf(process.platform === 'win32')('Windows 的「磁碟機相對路徑」（C:a.png）不會落到資料資料夾外', () => {
    const other = dataDir.startsWith('C:') ? 'Z:a.png' : 'C:a.png';
    expect(resolveImageReadPath(dataDir, other)).toBeNull();
  });
});

describe('hasImageExtension', () => {
  it('不分大小寫判斷圖片副檔名', () => {
    expect(hasImageExtension('a.PNG')).toBe(true);
    expect(hasImageExtension('a.svg')).toBe(true);
    expect(hasImageExtension('a.txt')).toBe(false);
    expect(hasImageExtension('a')).toBe(false);
    expect(hasImageExtension(null)).toBe(false);
  });
});

describe('copyImageIntoGallery', () => {
  let root;
  let gallery;
  let source;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifesync-gallery-test-'));
    gallery = path.join(root, 'gallery');
    source = path.join(root, 'source');
    fs.mkdirSync(gallery);
    fs.mkdirSync(source);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const write = (dir, name, content) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, content);
    return p;
  };
  const hash8 = (content) => crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);

  it('只複製圖片檔：其他副檔名一律拒絕，圖庫裡不會多出檔案', async () => {
    for (const name of ['evil.exe', 'data.json', 'notes.txt', 'noext', 'photo.png.exe', 'archive.png.zip']) {
      const src = write(source, name, 'X');
      await expect(copyImageIntoGallery(src, gallery)).rejects.toMatchObject({ code: 'NOT_IMAGE' });
    }
    await expect(copyImageIntoGallery(undefined, gallery)).rejects.toMatchObject({ code: 'NOT_IMAGE' });
    expect(fs.readdirSync(gallery)).toEqual([]);
  });

  it('圖片副檔名不分大小寫都可以複製', async () => {
    const src = write(source, 'CAT.JPEG', 'AAA');
    expect((await copyImageIntoGallery(src, gallery)).name).toBe('CAT.JPEG');
  });

  it('圖庫裡沒有同名檔案時直接複製', async () => {
    const src = write(source, 'cat.png', 'AAA');
    const result = await copyImageIntoGallery(src, gallery);
    expect(result).toEqual({ name: 'cat.png', targetPath: path.join(gallery, 'cat.png'), reused: false });
    expect(fs.readFileSync(path.join(gallery, 'cat.png'), 'utf8')).toBe('AAA');
  });

  it('同名且內容相同時直接沿用，不再複製', async () => {
    write(gallery, 'cat.png', 'AAA');
    const before = fs.statSync(path.join(gallery, 'cat.png')).mtimeMs;
    const src = write(source, 'cat.png', 'AAA');
    const result = await copyImageIntoGallery(src, gallery);
    expect(result.name).toBe('cat.png');
    expect(result.reused).toBe(true);
    expect(fs.readdirSync(gallery)).toEqual(['cat.png']);
    expect(fs.statSync(path.join(gallery, 'cat.png')).mtimeMs).toBe(before);
  });

  it('同名、大小相同但內容不同時改名，原檔不被蓋掉', async () => {
    write(gallery, 'cat.png', 'AAA');
    const src = write(source, 'cat.png', 'BBB');
    const result = await copyImageIntoGallery(src, gallery);
    const expected = `cat-${hash8('BBB')}.png`;
    expect(result).toEqual({ name: expected, targetPath: path.join(gallery, expected), reused: false });
    expect(fs.readFileSync(path.join(gallery, 'cat.png'), 'utf8')).toBe('AAA');
    expect(fs.readFileSync(path.join(gallery, expected), 'utf8')).toBe('BBB');
  });

  it('同名但大小不同時改名', async () => {
    write(gallery, 'cat.png', 'AAA');
    const src = write(source, 'cat.png', 'BBBBBB');
    const result = await copyImageIntoGallery(src, gallery);
    expect(result.name).toBe(`cat-${hash8('BBBBBB')}.png`);
    expect(fs.readFileSync(path.join(gallery, 'cat.png'), 'utf8')).toBe('AAA');
  });

  it('改名後的名稱已存在且內容相同時沿用（同一張圖再加入一次）', async () => {
    write(gallery, 'cat.png', 'AAA');
    const src = write(source, 'cat.png', 'BBB');
    const first = await copyImageIntoGallery(src, gallery);
    const second = await copyImageIntoGallery(src, gallery);
    expect(second).toEqual({ ...first, reused: true });
    expect(fs.readdirSync(gallery).sort()).toEqual(['cat.png', first.name].sort());
  });

  it('改名後的名稱也被不同內容占用時，再加上序號', async () => {
    write(gallery, 'cat.png', 'AAA');
    write(gallery, `cat-${hash8('BBB')}.png`, 'CCC');
    const src = write(source, 'cat.png', 'BBB');
    const result = await copyImageIntoGallery(src, gallery);
    expect(result.name).toBe(`cat-${hash8('BBB')}-2.png`);
    expect(fs.readFileSync(path.join(gallery, result.name), 'utf8')).toBe('BBB');
    expect(fs.readFileSync(path.join(gallery, `cat-${hash8('BBB')}.png`), 'utf8')).toBe('CCC');
  });

  it('來源就是圖庫裡的那個檔案時直接沿用', async () => {
    const inGallery = write(gallery, 'cat.png', 'AAA');
    const result = await copyImageIntoGallery(inGallery, gallery);
    expect(result).toEqual({ name: 'cat.png', targetPath: inGallery, reused: true });
    expect(fs.readFileSync(inGallery, 'utf8')).toBe('AAA');
  });

  it('沒有副檔名或含多個點的檔名也能正確改名', async () => {
    write(gallery, 'photo.final.jpg', 'AAA');
    const src = write(source, 'photo.final.jpg', 'BBB');
    expect((await copyImageIntoGallery(src, gallery)).name).toBe(`photo.final-${hash8('BBB')}.jpg`);
  });

  it('來源不存在時丟出錯誤', async () => {
    await expect(copyImageIntoGallery(path.join(source, 'none.png'), gallery)).rejects.toThrow();
    expect(fs.readdirSync(gallery)).toEqual([]);
  });
});

describe('sha256File', () => {
  it('與一次讀完計算的結果相同', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lifesync-hash-test-'));
    try {
      const content = Buffer.alloc(300 * 1024, 7);
      const p = path.join(dir, 'big.bin');
      fs.writeFileSync(p, content);
      expect(await sha256File(p)).toBe(crypto.createHash('sha256').update(content).digest('hex'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});