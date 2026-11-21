import { describe, it, expect } from 'vitest';
import {
  atLeast,
  commitCountDraft,
  firstGoalId,
  sanitizeCountDraft,
  toggleWeekDay,
  toNonNegativeInt,
  toNonNegativeNumber,
  validateSubTaskTimes,
} from '../src/domain/inputs.js';

describe('toNonNegativeInt：獎勵券、持有券數', () => {
  it('0 以上的整數照原樣', () => {
    expect(toNonNegativeInt('0')).toBe(0);
    expect(toNonNegativeInt('3')).toBe(3);
  });
  it('負數、空白、不是數字都變成 0；小數捨去', () => {
    expect(toNonNegativeInt('-2')).toBe(0);
    expect(toNonNegativeInt('')).toBe(0);
    expect(toNonNegativeInt('abc')).toBe(0);
    expect(toNonNegativeInt('2.7')).toBe(2);
  });
});

describe('toNonNegativeNumber：抽卡機率', () => {
  it('負數夾到 0，小數保留', () => {
    expect(toNonNegativeNumber('-5')).toBe(0);
    expect(toNonNegativeNumber('12.5')).toBe(12.5);
    expect(toNonNegativeNumber('')).toBe(0);
    expect(toNonNegativeNumber('x')).toBe(0);
  });
});

describe('atLeast：成就條件至少 1', () => {
  it('小於下限或不是數字時補成下限', () => {
    expect(atLeast(0, 1)).toBe(1);
    expect(atLeast(-3, 1)).toBe(1);
    expect(atLeast(undefined, 1)).toBe(1);
    expect(atLeast(10, 1)).toBe(10);
  });
});

describe('toggleWeekDay：每週任務至少要選一天', () => {
  it('加入一天後由小到大排序', () => {
    expect(toggleWeekDay([3, 1], 0)).toEqual([0, 1, 3]);
  });
  it('取消其中一天', () => {
    expect(toggleWeekDay([1, 3], 3)).toEqual([1]);
  });
  it('取消最後一天時不讓取消', () => {
    const days = [2];
    expect(toggleWeekDay(days, 2)).toBe(days);
  });
  it('沒有 days 欄位時可以直接加一天', () => {
    expect(toggleWeekDay(undefined, 4)).toEqual([4]);
  });
});

describe('validateSubTaskTimes：結束時間不能早於開始時間', () => {
  const base = { type: 'precise', noTime: false, startDateTime: '2026-11-20T10:00' };
  it('結束早於開始時回傳錯誤訊息', () => {
    expect(validateSubTaskTimes({ ...base, endDateTime: '2026-11-20T09:59' })).toBe('結束時間不能早於開始時間');
    expect(validateSubTaskTimes({ ...base, endDateTime: '2026-11-19T23:00' })).toBe('結束時間不能早於開始時間');
  });
  it('結束等於或晚於開始、或沒填結束時間都可以', () => {
    expect(validateSubTaskTimes({ ...base, endDateTime: '2026-11-20T10:00' })).toBeNull();
    expect(validateSubTaskTimes({ ...base, endDateTime: '2026-11-21T08:00' })).toBeNull();
    expect(validateSubTaskTimes({ ...base, endDateTime: '' })).toBeNull();
  });
  it('不限時間、或不是一次性任務時不檢查', () => {
    expect(validateSubTaskTimes({ ...base, noTime: true, endDateTime: '2026-11-19T00:00' })).toBeNull();
    expect(validateSubTaskTimes({ type: 'daily', startTime: '23:00', endTime: '01:00' })).toBeNull();
  });
});

describe('firstGoalId：換維度時目標重設', () => {
  const goals = { growth: [{ id: 'g1' }, { id: 'g2' }], health: [] };
  it('回傳新維度的第一個目標', () => {
    expect(firstGoalId(goals, 'growth')).toBe('g1');
  });
  it('新維度沒有目標時回傳空字串', () => {
    expect(firstGoalId(goals, 'health')).toBe('');
    expect(firstGoalId(goals, 'unknown')).toBe('');
  });
});

describe('成就條件次數：打字中的草稿與打完後存的值', () => {
  it('草稿只留數字，最多 6 位', () => {
    expect(sanitizeCountDraft('1,000')).toBe('1000');
    expect(sanitizeCountDraft(' 5 次')).toBe('5');
    expect(sanitizeCountDraft('５０')).toBe('50');
    expect(sanitizeCountDraft('-3')).toBe('3');
    expect(sanitizeCountDraft('12345678')).toBe('123456');
    expect(sanitizeCountDraft('')).toBe('');
    expect(sanitizeCountDraft(undefined)).toBe('');
  });
  it('打完時存成至少 1 的整數', () => {
    expect(commitCountDraft('50', 30)).toBe(50);
    expect(commitCountDraft('007', 30)).toBe(7);
    expect(commitCountDraft('1', 30)).toBe(1);
  });
  it('清空或只打 0 時退回原本的次數', () => {
    expect(commitCountDraft('', 30)).toBe(30);
    expect(commitCountDraft('0', 30)).toBe(30);
    expect(commitCountDraft('000', 30)).toBe(30);
  });
  it('原本的次數就不合理（舊資料）時退回 1', () => {
    expect(commitCountDraft('', 0)).toBe(1);
    expect(commitCountDraft('', undefined)).toBe(1);
  });
});
