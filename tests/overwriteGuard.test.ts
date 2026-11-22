import { describe, it, expect, vi } from 'vitest';
import {
  SNAPSHOT_REASONS,
  snapshotBeforeOverwrite,
  snapshotFailedMessage,
  snapshotSavedNote,
  confirmJsonImportMessage,
  canSnapshot,
} from '../src/domain/overwriteGuard.ts';
import type { OverwriteSnapshot } from '../src/domain/overwriteGuard.ts';
import type { LifeSyncData } from '../src/types/data.ts';

/** 拍快照失敗的結果（snapshotFailedMessage 收的就是這個） */
type SnapshotFailure = Extract<OverwriteSnapshot, { ok: false }>;

describe('snapshotBeforeOverwrite：覆蓋本機資料前先拍快照', () => {
  it('瀏覽器模式（沒有 electronAPI 或沒有 snapshotData）跳過快照，但允許繼續', async () => {
    expect(await snapshotBeforeOverwrite(undefined, { reason: 'x' })).toEqual({ ok: true, skipped: true, path: null });
    expect(await snapshotBeforeOverwrite({}, { reason: 'x' })).toEqual({ ok: true, skipped: true, path: null });
  });

  it('把原因和目前資料交給主程序，成功時回傳快照路徑', async () => {
    const snapshotData = vi.fn().mockResolvedValue({ success: true, path: 'C:/data/backups/snapshot-1.json' });
    const data = { lotteryTickets: 3 } as LifeSyncData; // 只看有沒有原樣交給主程序，不需要完整的資料
    const result = await snapshotBeforeOverwrite({ snapshotData }, { reason: SNAPSHOT_REASONS.cloudRestore, data });
    expect(snapshotData).toHaveBeenCalledWith({ reason: 'before-cloud-restore', data });
    expect(result).toEqual({ ok: true, skipped: false, path: 'C:/data/backups/snapshot-1.json' });
  });

  it('主程序回報失敗時不可繼續', async () => {
    const snapshotData = vi.fn().mockResolvedValue({ success: false, error: '磁碟已滿' });
    expect(await snapshotBeforeOverwrite({ snapshotData }, { reason: 'x' })).toEqual({ ok: false, error: '磁碟已滿' });
  });

  it('主程序有帶錯誤碼時一起傳回', async () => {
    const snapshotData = vi.fn().mockResolvedValue({ success: false, code: 'ENOSPC', error: 'ENOSPC: no space left on device' });
    expect(await snapshotBeforeOverwrite({ snapshotData }, { reason: 'x' })).toEqual({
      ok: false, code: 'ENOSPC', error: 'ENOSPC: no space left on device',
    });
  });

  it('呼叫本身丟錯時也視為失敗', async () => {
    const snapshotData = vi.fn().mockRejectedValue(new Error('IPC 中斷'));
    expect(await snapshotBeforeOverwrite({ snapshotData }, { reason: 'x' })).toEqual({ ok: false, error: 'IPC 中斷' });
  });

  it('沒有說明原因的失敗也有替代文字', async () => {
    const snapshotData = vi.fn().mockResolvedValue(undefined);
    expect(await snapshotBeforeOverwrite({ snapshotData }, {})).toEqual({ ok: false, error: '未知的錯誤' });
  });
});

describe('提示文字', () => {
  it('快照失敗時說明資料沒有變動，並附上原因', () => {
    const msg = snapshotFailedMessage('磁碟已滿');
    expect(msg).toContain('沒有覆蓋');
    expect(msg).toContain('磁碟已滿');
  });

  it('成功時附上快照位置；瀏覽器模式或沒有快照時不加任何字', () => {
    expect(snapshotSavedNote({ ok: true, skipped: false, path: 'D:/backups/x.json' })).toContain('D:/backups/x.json');
    expect(snapshotSavedNote({ ok: true, skipped: true, path: null })).toBe('');
    expect(snapshotSavedNote({ ok: true, skipped: false, path: null })).toBe('');
  });

  it('匯入 JSON 的確認文字包含檔名', () => {
    expect(confirmJsonImportMessage('a.json')).toContain('「a.json」');
    expect(confirmJsonImportMessage('')).toContain('這個資料檔');
  });

  it('能拍快照時才承諾會自動備份；瀏覽器模式改成提醒自己先備份', () => {
    expect(confirmJsonImportMessage('a.json', { canSnapshot: true })).toContain('覆蓋前會先自動把目前的資料備份一份');
    const browser = confirmJsonImportMessage('a.json', { canSnapshot: false });
    expect(browser).not.toContain('自動把目前的資料備份');
    expect(browser).toContain('瀏覽器模式不會在覆蓋前自動備份');
    expect(canSnapshot(undefined)).toBe(false);
    expect(canSnapshot({})).toBe(false);
    // @ts-expect-error 故意傳假的 snapshotData：canSnapshot 只看它是不是函式，不管回傳什麼
    expect(canSnapshot({ snapshotData: () => {} })).toBe(true);
  });

  it.each([
    ['EEXIST', 'EEXIST: file already exists, mkdir \'C:\\d\\backups\'', '叫 backups 的「檔案」'],
    ['EPERM', 'EPERM: operation not permitted, copyfile', '沒有寫入備份資料夾的權限'],
    ['EACCES', 'EACCES: permission denied', '沒有寫入備份資料夾的權限'],
    ['ENOSPC', 'ENOSPC: no space left on device', '磁碟空間不足'],
    ['EBUSY', 'EBUSY: resource busy or locked', '正被別的程式'],
  ])('常見錯誤碼 %s：先寫白話原因，原始訊息放在技術細節', (code, raw, expected) => {
    const failure: SnapshotFailure = { ok: false, code, error: raw };
    const msg = snapshotFailedMessage(failure);
    expect(msg).toContain('沒有覆蓋');
    expect(msg).toContain(expected);
    expect(msg).toContain(`技術細節：${raw}`);
    expect(msg.indexOf(expected)).toBeLessThan(msg.indexOf(raw));
  });

  it('沒帶錯誤碼時，從訊息開頭認出錯誤碼', () => {
    const failure: SnapshotFailure = { ok: false, error: 'EEXIST: file already exists, mkdir x' };
    expect(snapshotFailedMessage(failure)).toContain('叫 backups 的「檔案」');
  });

  it('不認得的錯誤只顯示原始訊息', () => {
    const failure: SnapshotFailure = { ok: false, code: 'WEIRD', error: 'something odd' };
    const msg = snapshotFailedMessage(failure);
    expect(msg).toContain('原因：something odd');
    expect(msg).not.toContain('技術細節');
  });

  it('快照原因只用檔名允許的字元（storage 會原樣放進檔名）', () => {
    for (const reason of Object.values(SNAPSHOT_REASONS)) {
      expect(reason).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
    }
  });
});
