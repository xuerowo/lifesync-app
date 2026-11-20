import { describe, it, expect } from 'vitest';
import {
  computeActivePriorityTasks,
  completionRewardTickets,
  createRecentGuard,
  isCompletedOnDate,
  isOneTimeTask,
  renumberPriorityTasks,
} from '../src/domain/tasks.js';

// 2026-11-16 是星期一（getDay() === 1），2026-11-18 是星期三
const MONDAY = new Date(2026, 10, 16, 10, 0);
const WEDNESDAY = new Date(2026, 10, 18, 10, 0);

const ids = (list) => list.map(t => t.id);

describe('computeActivePriorityTasks：現在該先做哪個優先任務', () => {
  const weeklyWed = { id: 'w', type: 'weekly', days: [3], isPriority: true, priorityOrder: 1 };
  const once = { id: 'o', type: 'precise', isPriority: true, priorityOrder: 2, completed: false };
  const normal = { id: 'n', type: 'precise', isPriority: false, priorityOrder: 0 };

  it('今天不是指定星期的每週優先任務不列入，不會擋住其他任務', () => {
    const result = computeActivePriorityTasks([weeklyWed, once, normal], MONDAY);
    expect(ids(result)).toEqual(['o']);
  });

  it('只有非指定日的每週優先任務時，清單是空的（其他任務都能做）', () => {
    expect(computeActivePriorityTasks([weeklyWed, normal], MONDAY)).toEqual([]);
  });

  it('指定的那天照常排第一', () => {
    const result = computeActivePriorityTasks([once, weeklyWed, normal], WEDNESDAY);
    expect(ids(result)).toEqual(['w', 'o']);
  });

  it('每日優先任務今天完成後不算；一次性已完成的也不算', () => {
    const daily = { id: 'd', type: 'daily', isPriority: true, priorityOrder: 1, lastCompletedAt: '2026-11-16T08:30:00.000Z' };
    const doneOnce = { ...once, completed: true };
    expect(computeActivePriorityTasks([daily, doneOnce], MONDAY)).toEqual([]);
  });

  it('跨過午夜重新計算：昨天完成的每日任務今天又要做', () => {
    const daily = { id: 'd', type: 'daily', isPriority: true, priorityOrder: 1, lastCompletedAt: '2026-11-16T23:50:00.000Z' };
    const lateNight = new Date(2026, 10, 16, 23, 59);
    const afterMidnight = new Date(2026, 10, 17, 0, 1);
    expect(computeActivePriorityTasks([daily], lateNight)).toEqual([]);
    expect(ids(computeActivePriorityTasks([daily], afterMidnight))).toEqual(['d']);
  });

  it('跨到指定星期時，每週任務重新出現', () => {
    const tuesdayNight = new Date(2026, 10, 17, 23, 59);
    const wednesdayMorning = new Date(2026, 10, 18, 0, 1);
    expect(computeActivePriorityTasks([weeklyWed], tuesdayNight)).toEqual([]);
    expect(ids(computeActivePriorityTasks([weeklyWed], wednesdayMorning))).toEqual(['w']);
  });

  it('依 priorityOrder 排序，非優先任務不列入', () => {
    const a = { id: 'a', type: 'precise', isPriority: true, priorityOrder: 3 };
    const b = { id: 'b', type: 'daily', isPriority: true, priorityOrder: 1 };
    const c = { id: 'c', type: 'precise', isPriority: true, priorityOrder: 2 };
    expect(ids(computeActivePriorityTasks([a, normal, b, c], MONDAY))).toEqual(['b', 'c', 'a']);
  });

  it('每週任務沒有 days 欄位時視為今天不用做，不會讓程式出錯', () => {
    const broken = { id: 'x', type: 'weekly', isPriority: true, priorityOrder: 1 };
    expect(computeActivePriorityTasks([broken], MONDAY)).toEqual([]);
  });
});

describe('isCompletedOnDate', () => {
  it('lastCompletedAt 是「本地時間標 Z」格式，直接看前 10 個字', () => {
    // 本地 2026-11-17 凌晨 01:00 完成，記成 2026-11-17T01:00:00.000Z
    expect(isCompletedOnDate({ lastCompletedAt: '2026-11-17T01:00:00.000Z' }, '2026-11-17')).toBe(true);
    expect(isCompletedOnDate({ lastCompletedAt: '2026-11-16T23:00:00.000Z' }, '2026-11-17')).toBe(false);
    expect(isCompletedOnDate({ lastCompletedAt: null }, '2026-11-17')).toBe(false);
  });
});

describe('renumberPriorityTasks：重排優先順序', () => {
  const list = [
    { id: 'a', isPriority: true, priorityOrder: 5 },
    { id: 'n', isPriority: false, priorityOrder: 0 },
    { id: 'b', isPriority: true, priorityOrder: 2 },
    { id: 'c', isPriority: true, priorityOrder: 9 },
  ];

  it('優先任務依原本順序重新編成 1..n，陣列位置不變', () => {
    const result = renumberPriorityTasks(list);
    expect(result.map(t => [t.id, t.priorityOrder])).toEqual([
      ['a', 2], ['n', 0], ['b', 1], ['c', 3],
    ]);
  });

  it('被移除的任務不計入編號，本身原樣保留', () => {
    const result = renumberPriorityTasks(list, 'b');
    expect(result.map(t => [t.id, t.priorityOrder])).toEqual([
      ['a', 1], ['n', 0], ['b', 2], ['c', 2],
    ]);
    expect(result[2]).toBe(list[2]);
  });

  it('非優先任務原樣保留（同一個物件），也不改動原陣列', () => {
    const result = renumberPriorityTasks(list);
    expect(result[1]).toBe(list[1]);
    expect(list[0].priorityOrder).toBe(5);
  });

  it('順序相同時維持原本在陣列中的先後', () => {
    const tie = [
      { id: 'x', isPriority: true, priorityOrder: 1 },
      { id: 'y', isPriority: true, priorityOrder: 1 },
    ];
    expect(renumberPriorityTasks(tie).map(t => t.priorityOrder)).toEqual([1, 2]);
  });
});

describe('createRecentGuard：一次性任務防連點', () => {
  it('時間內同一個 id 被擋下，過了時間就放行', () => {
    const guard = createRecentGuard(1500);
    expect(guard.isBlocked('a', 0)).toBe(false);
    guard.mark('a', 0);
    expect(guard.isBlocked('a', 300)).toBe(true);
    expect(guard.isBlocked('a', 1499)).toBe(true);
    expect(guard.isBlocked('a', 1500)).toBe(false);
  });

  it('不同 id 互不影響', () => {
    const guard = createRecentGuard(1500);
    guard.mark('a', 0);
    expect(guard.isBlocked('b', 100)).toBe(false);
  });
  it('撤銷後清掉 id：馬上重新完成不會被擋下，其他 id 不受影響', () => {
    const guard = createRecentGuard(1500);
    guard.mark('a', 0);
    guard.mark('b', 0);
    guard.clear('a');
    expect(guard.isBlocked('a', 100)).toBe(false);
    expect(guard.isBlocked('b', 100)).toBe(true);
    // 清掉不存在的 id 也沒關係
    expect(() => guard.clear('zzz')).not.toThrow();
  });
});

describe('completionRewardTickets：完成紀錄記下的發券數', () => {
  it('呼叫端指定的張數優先，否則用任務設定，都沒有就是 1 張', () => {
    expect(completionRewardTickets({ rewardTickets: 5 }, { rewardTickets: 1 })).toBe(1);
    expect(completionRewardTickets({ rewardTickets: 5 })).toBe(5);
    expect(completionRewardTickets({ rewardTickets: 0 })).toBe(0);
    expect(completionRewardTickets({})).toBe(1);
    expect(completionRewardTickets(undefined, undefined)).toBe(1);
  });

  it('舊資料裡的負數一律記成 0（撤銷、刪除時才不會反而加券）', () => {
    expect(completionRewardTickets({ rewardTickets: -3 })).toBe(0);
    expect(completionRewardTickets({ rewardTickets: 2 }, { rewardTickets: -1 })).toBe(0);
  });

  it('不是數字時記成 0（完成時也不會發券）', () => {
    expect(completionRewardTickets({ rewardTickets: 'abc' })).toBe(0);
  });
});

describe('isOneTimeTask', () => {
  it('只有每日、每週、隨時挑戰以外的任務算一次性', () => {
    expect(isOneTimeTask({ type: 'precise' })).toBe(true);
    expect(isOneTimeTask({ type: 'daily' })).toBe(false);
    expect(isOneTimeTask({ type: 'weekly' })).toBe(false);
    expect(isOneTimeTask({ type: 'infinite' })).toBe(false);
  });
});
