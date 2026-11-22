import { describe, it, expect } from 'vitest';
import { galleryResultMessage } from '../src/domain/cloudUpload.ts';

describe('galleryResultMessage', () => {
  it('全部成功：張數都有單位，沒有失敗清單', () => {
    const msg = galleryResultMessage('upload', { uploaded: 3, skipped: 10, failed: 0, errors: [] });
    expect(msg).toBe('圖庫上傳完成！\n\n新上傳：3 張\n雲端已經有、略過：10 張\n失敗：0 張');
  });

  it('有失敗：列出前 3 筆原因（認得的錯誤換成白話）、還有幾張沒列出，以及下一步', () => {
    const errors = [
      { name: 'a.png', reason: 'request to https://x/ failed, reason: getaddrinfo ENOTFOUND x' },
      { name: 'b.png', reason: 'Invalid response: 507 Insufficient Storage' },
      { name: 'c.png', reason: 'something odd' },
      { name: 'd.png', reason: 'something odd' },
    ];
    const msg = galleryResultMessage('upload', { uploaded: 1, skipped: 0, failed: 5, errors });
    expect(msg).toContain('失敗：5 張');
    expect(msg).toContain('失敗的圖片（前 3 張）：');
    expect(msg).toContain('・a.png：連不上伺服器，請檢查網址和網路。');
    expect(msg).toContain('・b.png：雲端空間不足');
    expect(msg).toContain('・c.png：something odd');
    expect(msg).not.toContain('d.png');
    expect(msg).toContain('……還有 2 張沒有列出');
    expect(msg).toContain('下一步：再按一次「上傳圖庫」');
  });

  it('換成白話的原因會附上原文；單張圖片的 404 照原文，不說成網址打錯', () => {
    const errors = [
      { name: 'a.png', reason: 'Invalid response: 507 Insufficient Storage' },
      { name: 'b.png', reason: 'Invalid response: 404 Not Found' },
    ];
    const msg = galleryResultMessage('download', { downloaded: 0, skipped: 0, failed: 2, errors });
    expect(msg).toContain('（技術細節：Invalid response: 507 Insufficient Storage）');
    expect(msg).toContain('・b.png：Invalid response: 404 Not Found');
    expect(msg).not.toContain('網址有沒有打錯');
  });

  it('下載有解密失敗時提醒主密碼', () => {
    const msg = galleryResultMessage('download', {
      downloaded: 0, skipped: 2, failed: 1, errors: [{ name: 'a.png', reason: '解密失敗（主密碼錯誤或檔案損壞）' }],
    });
    expect(msg).toContain('新下載：0 張');
    expect(msg).toContain('這台電腦已經有、略過：2 張');
    expect(msg).toContain('「下載圖庫」');
    expect(msg).toContain('請確認主密碼');
  });

  it('中斷：說明已處理的會保留、可以接著做', () => {
    const msg = galleryResultMessage('download', { downloaded: 4, skipped: 0, failed: 0, errors: [] }, { aborted: true });
    expect(msg.startsWith('圖庫下載已中斷。')).toBe(true);
    expect(msg).toContain('新下載：4 張');
    expect(msg).toContain('再按一次「下載圖庫」');
  });

  it('結果欄位缺漏時當作 0 張', () => {
    expect(galleryResultMessage('upload', undefined)).toContain('新上傳：0 張');
  });
});
