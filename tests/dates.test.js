import { describe, it, expect } from 'vitest';
import {
  localDateFromDateOnly,
  localDateFromLocalDateTime,
  localDateFromLocalStampedIso,
  localDateFromUtcIso,
  localDateOf,
  localStampedIsoFromUtcIso,
  parseLocalDate,
} from '../src/domain/dates.js';
import { getLocalISOString } from '../src/utils/index.js';

// 時區差的正負號和 Date#getTimezoneOffset 相同
const UTC_PLUS_8 = -480; // 台灣
const UTC_MINUS_5 = 300; // 美東（冬令時間）

describe('localDateFromUtcIso：completedAt、createdAt（真正的 UTC 時間）', () => {
  it('UTC+8 凌晨完成的事算在當天，不會跑到前一天', () => {
    // 台灣 2026-03-05 01:30 = UTC 2026-03-04 17:30
    expect(localDateFromUtcIso('2026-03-04T17:30:00.000Z', UTC_PLUS_8)).toBe('2026-03-05');
    // 台灣 2026-03-05 07:59 = UTC 2026-03-04 23:59
    expect(localDateFromUtcIso('2026-03-04T23:59:00.000Z', UTC_PLUS_8)).toBe('2026-03-05');
    // 台灣 2026-03-05 08:00 = UTC 2026-03-05 00:00
    expect(localDateFromUtcIso('2026-03-05T00:00:00.000Z', UTC_PLUS_8)).toBe('2026-03-05');
  });

  it('UTC-5 晚上完成的事算在當天，不會跑到隔天', () => {
    // 美東 2026-03-04 21:00 = UTC 2026-03-05 02:00
    expect(localDateFromUtcIso('2026-03-05T02:00:00.000Z', UTC_MINUS_5)).toBe('2026-03-04');
    // 美東 2026-03-05 00:30 = UTC 2026-03-05 05:30
    expect(localDateFromUtcIso('2026-03-05T05:30:00.000Z', UTC_MINUS_5)).toBe('2026-03-05');
  });

  it('不給時區差時用本機時區：本地時間建立的 Date 轉回來是同一天', () => {
    const local = new Date(2026, 2, 5, 1, 30); // 本地 2026-03-05 01:30
    expect(localDateFromUtcIso(local.toISOString())).toBe('2026-03-05');
    const lateNight = new Date(2026, 2, 5, 23, 59);
    expect(localDateFromUtcIso(lateNight.toISOString())).toBe('2026-03-05');
  });

  it('空值或無法辨識時回傳 null', () => {
    expect(localDateFromUtcIso(null)).toBeNull();
    expect(localDateFromUtcIso('')).toBeNull();
    expect(localDateFromUtcIso('not a date')).toBeNull();
  });
});

describe('localDateFromLocalStampedIso：lastCompletedAt（本地時間，結尾標 Z）', () => {
  it('直接取前 10 個字，不做時區換算（換算反而會錯）', () => {
    // 本地 2026-03-05 01:30 完成，存成 2026-03-05T01:30:00.000Z
    expect(localDateFromLocalStampedIso('2026-03-05T01:30:00.000Z')).toBe('2026-03-05');
    expect(localDateFromLocalStampedIso('2026-03-05T23:59:59.000Z')).toBe('2026-03-05');
  });

  it('和 getLocalISOString 產生的格式對得上', () => {
    const local = new Date(2026, 2, 5, 0, 15);
    expect(localDateFromLocalStampedIso(getLocalISOString(local))).toBe('2026-03-05');
  });

  it('空值回傳 null', () => {
    expect(localDateFromLocalStampedIso(null)).toBeNull();
    expect(localDateFromLocalStampedIso(undefined)).toBeNull();
  });
});

describe('localDateFromLocalDateTime：startDateTime、endDateTime（本地時間，沒有 Z）', () => {
  it('取日期部分，不受時區影響', () => {
    expect(localDateFromLocalDateTime('2026-03-05T00:30')).toBe('2026-03-05');
    expect(localDateFromLocalDateTime('2026-03-05T23:30')).toBe('2026-03-05');
  });

  it('空值或格式不對回傳 null', () => {
    expect(localDateFromLocalDateTime('')).toBeNull();
    expect(localDateFromLocalDateTime('03/05/2026')).toBeNull();
  });
});

describe('localDateFromDateOnly：startDate、endDate（只有日期）', () => {
  it('原樣回傳', () => {
    expect(localDateFromDateOnly('2026-03-05')).toBe('2026-03-05');
    expect(localDateFromDateOnly(undefined)).toBeNull();
  });
});

describe('localDateOf、parseLocalDate', () => {
  it('Date 和本地日期字串可以互相轉換', () => {
    expect(localDateOf(new Date(2026, 0, 9, 0, 0))).toBe('2026-01-09');
    const d = parseLocalDate('2026-01-09');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 0, 9, 0]);
    expect(localDateOf(d)).toBe('2026-01-09');
  });

  it('格式不對回傳 null', () => {
    expect(parseLocalDate('abc')).toBeNull();
    expect(localDateOf(new Date('x'))).toBeNull();
  });
});

describe('localStampedIsoFromUtcIso：撤銷後的 lastCompletedAt', () => {
  it('和 getLocalISOString(new Date(completedAt)) 結果相同', () => {
    const completedAt = new Date(2026, 2, 5, 1, 30).toISOString();
    expect(localStampedIsoFromUtcIso(completedAt)).toBe(getLocalISOString(new Date(completedAt)));
  });

  it('UTC+8 凌晨與 UTC-5 晚上都換成本地時間', () => {
    expect(localStampedIsoFromUtcIso('2026-03-04T17:30:00.000Z', UTC_PLUS_8)).toBe('2026-03-05T01:30:00.000Z');
    expect(localStampedIsoFromUtcIso('2026-03-05T02:00:00.000Z', UTC_MINUS_5)).toBe('2026-03-04T21:00:00.000Z');
  });

  it('無法辨識時回傳 null，不會丟出錯誤', () => {
    expect(localStampedIsoFromUtcIso('bad')).toBeNull();
    expect(localStampedIsoFromUtcIso(undefined)).toBeNull();
  });
});
