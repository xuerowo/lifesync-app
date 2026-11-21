import { describe, it, expect, vi } from 'vitest';
import {
  buildMessageBoxOptions,
  normalizeDialogMessage,
  confirmResultFromResponse,
  MAX_DIALOG_MESSAGE_LENGTH,
} from '../electron/nativeDialogs.js';
import { toDialogText, createNativeDialogs, installNativeDialogs } from '../src/utils/nativeDialogs.js';

describe('主程序：組訊息框設定', () => {
  it('alert 只有「確定」', () => {
    expect(buildMessageBoxOptions('alert', '存好了')).toEqual({
      type: 'info',
      title: 'LifeSync',
      message: '存好了',
      buttons: ['確定'],
      defaultId: 0,
      noLink: true,
    });
  });

  it('confirm 有「確定」「取消」，Esc／關閉鈕等於取消', () => {
    expect(buildMessageBoxOptions('confirm', '確定刪除？')).toEqual({
      type: 'question',
      title: 'LifeSync',
      message: '確定刪除？',
      buttons: ['確定', '取消'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
  });

  it('訊息轉成字串並限制長度', () => {
    expect(normalizeDialogMessage(undefined)).toBe('');
    expect(normalizeDialogMessage(null)).toBe('');
    expect(normalizeDialogMessage(42)).toBe('42');
    const throwing = { toString() { throw new Error('壞掉'); } };
    expect(normalizeDialogMessage(throwing)).toBe('');
    const long = 'a'.repeat(MAX_DIALOG_MESSAGE_LENGTH + 10);
    const result = normalizeDialogMessage(long);
    expect(result).toHaveLength(MAX_DIALOG_MESSAGE_LENGTH + 1);
    expect(result.endsWith('…')).toBe(true);
    expect(normalizeDialogMessage('a'.repeat(MAX_DIALOG_MESSAGE_LENGTH))).toHaveLength(MAX_DIALOG_MESSAGE_LENGTH);
  });

  it('只有按「確定」（0）才算同意', () => {
    expect(confirmResultFromResponse(0)).toBe(true);
    expect(confirmResultFromResponse(1)).toBe(false);
    expect(confirmResultFromResponse(undefined)).toBe(false);
  });
});

describe('畫面端：alert／confirm 的替代品', () => {
  it('參數照瀏覽器規則轉成字串', () => {
    expect(toDialogText()).toBe('');
    expect(toDialogText(undefined)).toBe('');
    expect(toDialogText(null)).toBe('null');
    expect(toDialogText(0)).toBe('0');
    expect(toDialogText({})).toBe('[object Object]');
    expect(toDialogText('嗨')).toBe('嗨');
  });

  it('alert 轉交 alertSync、不回傳值；confirm 回傳布林值', () => {
    const api = { alertSync: vi.fn(() => 'ignored'), confirmSync: vi.fn(() => true) };
    const { alert, confirm } = createNativeDialogs(api);
    expect(alert()).toBeUndefined();
    expect(api.alertSync).toHaveBeenCalledWith('');
    expect(confirm(123)).toBe(true);
    expect(api.confirmSync).toHaveBeenCalledWith('123');
    api.confirmSync.mockReturnValue(undefined);
    expect(confirm('x')).toBe(false);
  });

  it('有 electronAPI 才換掉，瀏覽器模式維持原本的對話框', () => {
    const originalAlert = () => {};
    const originalConfirm = () => true;
    const browserWindow = { alert: originalAlert, confirm: originalConfirm };
    expect(installNativeDialogs(browserWindow)).toBe(false);
    expect(browserWindow.alert).toBe(originalAlert);
    expect(browserWindow.confirm).toBe(originalConfirm);

    const oldPreload = { alert: originalAlert, confirm: originalConfirm, electronAPI: { getData() {} } };
    expect(installNativeDialogs(oldPreload)).toBe(false);
    expect(oldPreload.confirm).toBe(originalConfirm);

    const electronWindow = {
      alert: originalAlert,
      confirm: originalConfirm,
      electronAPI: { alertSync: vi.fn(), confirmSync: vi.fn(() => false) },
    };
    expect(installNativeDialogs(electronWindow)).toBe(true);
    expect(electronWindow.confirm).not.toBe(originalConfirm);
    expect(electronWindow.confirm('刪除？')).toBe(false);
    expect(electronWindow.electronAPI.confirmSync).toHaveBeenCalledWith('刪除？');
  });
});
