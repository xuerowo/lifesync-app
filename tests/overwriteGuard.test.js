import { describe, it, expect, vi } from 'vitest';
import {
  SNAPSHOT_REASONS,
  snapshotBeforeOverwrite,
  snapshotFailedMessage,
  snapshotSavedNote,
  confirmJsonImportMessage,
} from '../src/domain/overwriteGuard.js';

describe('snapshotBeforeOverwrite：覆蓋本機資料前先拍快照', () => {
  it('瀏覽器模式（沒有 electronAPI 或沒有 snapshotData）跳過快照，但允許繼續', async () => {
    expect(await snapshotBeforeOverwrite(undefined, { reason: 'x' })).toEqual({ ok: true, skipped: true, path: null });
    expect(await snapshotBeforeOverwrite({}, { reason: 'x' })).toEqual({ ok: true, skipped: true, path: null });
  });

  it('把原因和目前資料交給主程序，成功時回傳快照路徑', async () => {
    const snapshotData = vi.fn().mockResolvedValue({ success: true, path: 'C:/data/backups/snapshot-1.json' });
    const data = { lotteryTickets: 3 };
    const result = await snapshotBeforeOverwrite({ snapshotData }, { reason: SNAPSHOT_REASONS.cloudRestore, data });
    expect(snapshotData).toHaveBeenCalledWith({ reason: 'before-cloud-restore', data });
    expect(result).toEqual({ ok: true, skipped: false, path: 'C:/data/backups/snapshot-1.json' });
  });

  it('主程序回報失敗時不可繼續', async () => {
    const snapshotData = vi.fn().mockResolvedValue({ success: false, error: '磁碟已滿' });
    expect(await snapshotBeforeOverwrite({ snapshotData }, { reason: 'x' })).toEqual({ ok: false, error: '磁碟已滿' });
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
    expect(confirmJsonImportMessage('')).toContain('這個 JSON 檔');
  });

  it('快照原因只用檔名允許的字元（storage 會原樣放進檔名）', () => {
    for (const reason of Object.values(SNAPSHOT_REASONS)) {
      expect(reason).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
    }
  });
});
