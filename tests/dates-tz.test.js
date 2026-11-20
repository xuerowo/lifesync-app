// 用 process.env.TZ 把整個測試檔切到美東時區（UTC-5），確認「不給時區差、用本機時區」的路徑也正確。
// 必須在任何 Date 運算之前設定。
process.env.TZ = 'America/New_York';

import { describe, it, expect } from 'vitest';
import { localDateFromUtcIso, localStampedIsoFromUtcIso } from '../src/domain/dates.js';
import { getCalendarTasksForDay } from '../src/domain/calendar.js';

describe('本機時區是 UTC-5 時', () => {
  it('時區設定真的生效（2026-03-04 冬令時間 offset = 300 分鐘）', () => {
    expect(new Date('2026-03-04T12:00:00.000Z').getTimezoneOffset()).toBe(300);
  });

  it('UTC 隔天凌晨 = 美東前一天晚上', () => {
    expect(localDateFromUtcIso('2026-03-05T02:00:00.000Z')).toBe('2026-03-04');
    expect(localStampedIsoFromUtcIso('2026-03-05T02:00:00.000Z')).toBe('2026-03-04T21:00:00.000Z');
  });

  it('日曆：美東晚上完成的每日任務，顯示在當天而不是隔天', () => {
    const data = {
      majorTasks: [{ id: 'm', startDate: '2026-03-01', endDate: '2026-03-31' }],
      archivedTasks: [],
      subTasks: [{ id: 's', majorTaskId: 'm', type: 'precise', noTime: true, completed: true, completedAt: '2026-03-05T02:00:00.000Z' }],
      archivedSubTasks: [],
    };
    expect(getCalendarTasksForDay(data, '2026-03-04', 3, '2026-03-10').map(t => t.id)).toEqual(['s']);
    expect(getCalendarTasksForDay(data, '2026-03-05', 4, '2026-03-10')).toEqual([]);
  });
});
