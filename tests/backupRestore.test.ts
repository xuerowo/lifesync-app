import { describe, it, expect } from 'vitest';
import { backupRestoreSuccessMessage, backupRestoreAbortedMessage } from '../src/domain/backupRestore.ts';
import type { BackupGalleryRestore } from '../src/types/electronApi.ts';

const gallery = (over: Partial<BackupGalleryRestore> = {}): BackupGalleryRestore => ({
  found: true, total: 0, copied: 0, failed: 0, errors: [], listError: null, ...over,
});

describe('backupRestoreSuccessMessage', () => {
  it('全部複製成功：寫出張數', () => {
    expect(backupRestoreSuccessMessage(gallery({ total: 4, copied: 4 }))).toBe(
      '完整備份還原成功！資料已換成備份裡的內容，備份裡的 4 張圖片也已複製回圖庫（同名的會被蓋掉）。'
    );
  });

  it('備份裡沒有圖庫或沒有圖片：說圖庫沒有變動', () => {
    const expected = '完整備份還原成功！資料已換成備份裡的內容。這份備份裡沒有圖片，圖庫沒有變動。';
    expect(backupRestoreSuccessMessage(gallery({ found: false }))).toBe(expected);
    expect(backupRestoreSuccessMessage(gallery())).toBe(expected);
  });

  it('有圖片失敗：開頭就說有幾張沒複製，列出前 3 張（認得的換成白話）和下一步', () => {
    const errors = [
      { name: 'a.png', reason: "EBUSY: resource busy or locked, copyfile 'D:\\b\\gallery\\a.png' -> 'D:\\d\\gallery\\a.png'" },
      { name: 'b.png', reason: 'something odd' },
      { name: 'c.png', reason: 'something odd' },
      { name: 'd.png', reason: 'something odd' },
    ];
    const msg = backupRestoreSuccessMessage(gallery({ total: 10, copied: 5, failed: 5, errors }));
    expect(msg.split('\n')[0]).toBe('完整備份還原成功，但有 5 張圖片沒有複製回圖庫。');
    expect(msg).toContain('資料：已換成備份裡的內容。');
    expect(msg).toContain('備份裡的圖片：已複製 5 張（圖庫裡同名的圖片已被蓋掉），5 張失敗：');
    expect(msg).toContain('・a.png：這張圖片正被別的程式（例如看圖軟體、防毒軟體、雲端硬碟同步軟體）使用中，或沒有權限蓋掉圖庫裡的同名圖片。（技術細節：EBUSY: resource busy or locked');
    expect(msg).toContain('・c.png：something odd');
    expect(msg).not.toContain('d.png');
    expect(msg).toContain('……還有 2 張沒有列出');
    expect(msg).toContain('再按一次「還原完整備份」、選同一個資料夾');
  });

  it('整個 gallery 資料夾讀不到：說一張都沒複製，附上原因', () => {
    const listError = '沒有權限讀寫這個資料夾……\n（技術細節：EACCES: permission denied）';
    const msg = backupRestoreSuccessMessage(gallery({ listError }));
    expect(msg.split('\n')[0]).toBe('完整備份還原成功，但備份裡的圖片沒有複製回圖庫。');
    expect(msg).toContain('一張都沒有複製');
    expect(msg).toContain(listError);
  });
});

describe('backupRestoreAbortedMessage', () => {
  it('已經複製了幾張：寫出張數，提醒會留著', () => {
    expect(backupRestoreAbortedMessage(gallery({ total: 5, copied: 2 }))).toBe(
      '還原已中斷。目前的資料沒有變動，但已經複製過來的 2 張圖庫圖片會留著（同名的圖片已被蓋掉）。'
    );
  });

  it('一張都還沒複製：資料和圖庫都沒變', () => {
    expect(backupRestoreAbortedMessage(gallery({ total: 5 }))).toBe('還原已中斷。目前的資料和圖庫都沒有變動。');
  });
});
