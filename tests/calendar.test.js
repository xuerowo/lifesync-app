import { describe, it, expect } from 'vitest';
import { getCalendarRange, getCalendarTasksForDay, isDoneOnDate, isInRange } from '../src/domain/calendar.js';

const UTC_PLUS_8 = -480;
const UTC_MINUS_5 = 300;
const TODAY = '2026-03-10';

const major = { id: 'm', startDate: '2026-03-01', endDate: '2026-03-31', completed: false };

describe('getCalendarRange：任務在日曆上的日期範圍', () => {
  it('已完成、不限時間的一次性任務：只在完成那天（本地日期）', () => {
    // 台灣 03-05 凌晨 01:30 完成
    const task = { type: 'precise', noTime: true, completed: true, completedAt: '2026-03-04T17:30:00.000Z' };
    expect(getCalendarRange(task, major, TODAY, UTC_PLUS_8)).toEqual({ start: '2026-03-05', end: '2026-03-05' });
  });

  it('未完成、不限時間的一次性任務不顯示', () => {
    expect(getCalendarRange({ type: 'precise', noTime: true }, major, TODAY, UTC_PLUS_8)).toBeNull();
  });

  it('未完成、有時間的一次性任務：用 startDateTime ～ endDateTime 的本地日期', () => {
    const task = { type: 'precise', startDateTime: '2026-03-05T00:30', endDateTime: '2026-03-06T23:30' };
    expect(getCalendarRange(task, major, TODAY, UTC_PLUS_8)).toEqual({ start: '2026-03-05', end: '2026-03-06' });
    // 本地時間格式不受時區影響
    expect(getCalendarRange(task, major, TODAY, UTC_MINUS_5)).toEqual({ start: '2026-03-05', end: '2026-03-06' });
  });

  it('已完成、有時間的一次性任務：從建立日到完成日，兩者都換成本地日期', () => {
    const task = {
      type: 'precise', completed: true,
      createdAt: '2026-03-02T16:10:00.000Z', // 台灣 03-03 00:10
      completedAt: '2026-03-04T17:30:00.000Z', // 台灣 03-05 01:30
    };
    expect(getCalendarRange(task, major, TODAY, UTC_PLUS_8)).toEqual({ start: '2026-03-03', end: '2026-03-05' });
  });

  it('已完成但沒有完成時間：結束日用今天', () => {
    const task = { type: 'precise', completed: true, startDateTime: '2026-03-02T09:00' };
    expect(getCalendarRange(task, major, TODAY, UTC_PLUS_8)).toEqual({ start: '2026-03-02', end: TODAY });
  });

  it('重複性任務：從建立日（本地）到計畫結束日', () => {
    const task = { type: 'daily', createdAt: '2026-03-02T16:10:00.000Z' };
    expect(getCalendarRange(task, major, TODAY, UTC_PLUS_8)).toEqual({ start: '2026-03-03', end: '2026-03-31' });
  });

  it('重複性任務沒有建立時間：從計畫開始日起算', () => {
    expect(getCalendarRange({ type: 'weekly' }, major, TODAY, UTC_PLUS_8)).toEqual({ start: '2026-03-01', end: '2026-03-31' });
  });

  it('計畫已完成的重複性任務：結束日是計畫完成那天（本地）', () => {
    const doneMajor = { ...major, completed: true, completedAt: '2026-03-07T20:00:00.000Z' }; // 台灣 03-08 04:00
    const task = { type: 'daily', createdAt: '2026-03-02T01:00:00.000Z' };
    expect(getCalendarRange(task, doneMajor, TODAY, UTC_PLUS_8)).toEqual({ start: '2026-03-02', end: '2026-03-08' });
  });

  it('UTC-5：晚上完成的事留在當天', () => {
    // 美東 03-04 21:00 完成
    const task = { type: 'precise', noTime: true, completed: true, completedAt: '2026-03-05T02:00:00.000Z' };
    expect(getCalendarRange(task, major, TODAY, UTC_MINUS_5)).toEqual({ start: '2026-03-04', end: '2026-03-04' });
  });
});

describe('isInRange', () => {
  it('包含頭尾；缺的一邊不設限', () => {
    expect(isInRange('2026-03-05', { start: '2026-03-05', end: '2026-03-05' })).toBe(true);
    expect(isInRange('2026-03-04', { start: '2026-03-05', end: '2026-03-06' })).toBe(false);
    expect(isInRange('2026-03-07', { start: '2026-03-05', end: '2026-03-06' })).toBe(false);
    expect(isInRange('2026-03-07', { start: '2026-03-05', end: null })).toBe(true);
    expect(isInRange('2026-03-07', null)).toBe(false);
  });
});

describe('getCalendarTasksForDay', () => {
  const data = {
    majorTasks: [major],
    archivedTasks: [],
    subTasks: [
      { id: 'weekly-wed', majorTaskId: 'm', type: 'weekly', days: [3], startTime: '09:00' },
      { id: 'daily', majorTaskId: 'm', type: 'daily', startTime: '08:00' },
      { id: 'inf', majorTaskId: 'm', type: 'infinite' },
      { id: 'orphan', majorTaskId: 'nope', type: 'daily' },
    ],
    archivedSubTasks: [
      { id: 'done-early', majorTaskId: 'm', type: 'precise', noTime: true, completed: true, completedAt: '2026-03-03T18:00:00.000Z' },
    ],
  };

  it('依星期與日期篩選，依開始時間排序；隨時挑戰與找不到計畫的任務不顯示', () => {
    // 2026-03-04 是星期三
    expect(getCalendarTasksForDay(data, '2026-03-04', 3, TODAY, UTC_PLUS_8).map(t => t.id))
      .toEqual(['done-early', 'daily', 'weekly-wed']);
    // 2026-03-03 是星期二：凌晨完成的一次性任務不會跑到這天
    expect(getCalendarTasksForDay(data, '2026-03-03', 2, TODAY, UTC_PLUS_8).map(t => t.id))
      .toEqual(['daily']);
  });
});

describe('isDoneOnDate：日曆上那天是否已完成', () => {
  const history = [
    { taskId: 'd', completedAt: '2026-03-04T17:30:00.000Z' }, // 台灣 03-05 01:30
  ];

  it('重複性任務看那天有沒有完成紀錄（本地日期）', () => {
    const task = { id: 'd', type: 'daily' };
    expect(isDoneOnDate(task, history, '2026-03-05', UTC_PLUS_8)).toBe(true);
    expect(isDoneOnDate(task, history, '2026-03-04', UTC_PLUS_8)).toBe(false);
    // 同一筆紀錄在 UTC-5 是 03-04 中午
    expect(isDoneOnDate(task, history, '2026-03-04', UTC_MINUS_5)).toBe(true);
  });

  it('一次性任務看自己的完成時間', () => {
    const task = { id: 'p', type: 'precise', completed: true, completedAt: '2026-03-04T17:30:00.000Z' };
    expect(isDoneOnDate(task, [], '2026-03-05', UTC_PLUS_8)).toBe(true);
    expect(isDoneOnDate({ ...task, completed: false }, [], '2026-03-05', UTC_PLUS_8)).toBe(false);
  });
});
