import { describe, it, expect } from 'vitest';
import { stripCloudSecrets, mergeIncomingData, isImportableData } from '../src/shared/cloudSecrets.js';
import { createDefaultData } from '../src/shared/defaultData.js';

const withCloud = (cloud, extra = {}) => ({
  ...createDefaultData(),
  ...extra,
  cloudConfig: { type: 'webdav', url: '', username: '', password: '', masterPassword: '', enabled: false, ...cloud },
});

describe('stripCloudSecrets：備份與上傳不帶密碼', () => {
  it('清空 WebDAV 密碼與主密碼，其他雲端設定保留', () => {
    const data = withCloud({ url: 'https://dav.example', username: 'me', password: 'pw', masterPassword: 'mp', enabled: true });
    const out = stripCloudSecrets(data);
    expect(out.cloudConfig).toEqual({
      type: 'webdav',
      url: 'https://dav.example',
      username: 'me',
      password: '',
      masterPassword: '',
      enabled: true,
    });
  });

  it('不修改傳入的物件', () => {
    const data = withCloud({ password: 'pw', masterPassword: 'mp' });
    stripCloudSecrets(data);
    expect(data.cloudConfig.password).toBe('pw');
    expect(data.cloudConfig.masterPassword).toBe('mp');
  });

  it('其他資料原樣保留；序列化後找不到密碼字串', () => {
    const data = withCloud({ password: 'secret-pw-123', masterPassword: 'secret-mp-456' }, { lotteryTickets: 7 });
    const out = stripCloudSecrets(data);
    expect(out.lotteryTickets).toBe(7);
    const json = JSON.stringify(out);
    expect(json).not.toContain('secret-pw-123');
    expect(json).not.toContain('secret-mp-456');
  });

  it('沒有 cloudConfig 或不是物件時不出錯', () => {
    expect(stripCloudSecrets({ a: 1 })).toEqual({ a: 1 });
    expect(stripCloudSecrets(null)).toBeNull();
  });

  it('不會替原本沒有的欄位補上空字串', () => {
    expect(stripCloudSecrets({ cloudConfig: { url: 'x' } }).cloudConfig).toEqual({ url: 'x' });
  });
});

describe('mergeIncomingData：匯入、還原、下載時保留本機的雲端設定', () => {
  const current = withCloud(
    { url: 'https://mine.example', username: 'me', password: 'my-pw', masterPassword: 'my-mp', enabled: true },
    { lotteryTickets: 5, rules: [{ id: 'r1' }] }
  );

  it('外來資料的雲端設定（含密碼）一律不採用', () => {
    const incoming = {
      lotteryTickets: 99,
      cloudConfig: { url: 'https://old.example', username: 'old', password: 'ENCRYPTED==', masterPassword: '', enabled: false },
    };
    const merged = mergeIncomingData(current, incoming);
    expect(merged.cloudConfig).toEqual(current.cloudConfig);
    expect(merged.lotteryTickets).toBe(99);
  });

  it('外來資料有的欄位取代、沒有的保留（和以前的合併方式相同）', () => {
    const merged = mergeIncomingData(current, { lotteryTickets: 1 });
    expect(merged.lotteryTickets).toBe(1);
    expect(merged.rules).toEqual([{ id: 'r1' }]);
  });

  it('結果會補齊欄位', () => {
    const merged = mergeIncomingData(current, { majorTasks: 'not-an-array' });
    expect(merged.majorTasks).toEqual([]);
  });

  it('本機沒有雲端設定時用預設值，而不是外來的', () => {
    const merged = mergeIncomingData({}, { cloudConfig: { password: 'x', url: 'https://old' } });
    expect(merged.cloudConfig).toEqual(createDefaultData().cloudConfig);
  });

  it('外來資料不是物件時丟錯', () => {
    expect(() => mergeIncomingData(current, [1, 2])).toThrow('不是 LifeSync 的資料格式');
    expect(() => mergeIncomingData(current, 'text')).toThrow();
    expect(() => mergeIncomingData(current, null)).toThrow();
  });

  it('isImportableData 只接受至少有一個 LifeSync 欄位的物件', () => {
    expect(isImportableData({ subTasks: [] })).toBe(true);
    expect(isImportableData({ lotteryTickets: 0, somethingElse: 1 })).toBe(true);
    // 舊版才有的欄位也認得
    expect(isImportableData({ diaries: [] })).toBe(true);
    // 選錯檔案：空物件、別的程式的 JSON
    expect(isImportableData({})).toBe(false);
    expect(isImportableData({ name: 'my-app', version: '1.0.0' })).toBe(false);
    expect(isImportableData([])).toBe(false);
    expect(isImportableData(3)).toBe(false);
    expect(isImportableData(null)).toBe(false);
  });

  it('匯出（去密碼）後再匯入：本機密碼不會被清空', () => {
    const exported = JSON.parse(JSON.stringify(stripCloudSecrets(current)));
    const merged = mergeIncomingData(current, exported);
    expect(merged.cloudConfig.password).toBe('my-pw');
    expect(merged.cloudConfig.masterPassword).toBe('my-mp');
  });
});
