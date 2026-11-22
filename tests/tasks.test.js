import { describe, it, expect } from 'vitest';
import {
  canStopTask,
  computeActivePriorityTasks,
  completionRewardTickets,
  createRecentGuard,
  isCompletedOnDate,
  isOneTimeTask,
  isStoppedTask,
  keepsPriorityAfterCompletion,
  priorityAfterCompletion,
  renumberPriorityTasks,
  restoreStoppedSubTask,
  stopSubTask,
} from '../src/domain/tasks.js';
import { archivePlan, countIndicatorProgress, restorePlan } from '../src/domain/plans.js';

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

describe('Q11：每日、每週優先任務完成後保留優先標記', () => {
  const daily = { id: 'd', type: 'daily', isPriority: true, priorityOrder: 1, lastCompletedAt: null };
  const weeklyWed = { id: 'w', type: 'weekly', days: [3], isPriority: true, priorityOrder: 2, lastCompletedAt: null };
  const once = { id: 'o', type: 'precise', isPriority: true, priorityOrder: 3, completed: false };
  const normal = { id: 'n', type: 'precise', isPriority: false, priorityOrder: 0 };
  const TUESDAY = new Date(2026, 10, 17, 10, 0);
  const THURSDAY = new Date(2026, 10, 19, 10, 0);
  const NEXT_WEDNESDAY = new Date(2026, 10, 25, 10, 0);

  // 和 completeSubTaskData 的順序一樣：先處理優先標記，再記下完成時間（本地時間標 Z）
  const complete = (list, id, stamp) =>
    priorityAfterCompletion(list, id).map(t => (t.id === id ? { ...t, lastCompletedAt: stamp } : t));

  it('keepsPriorityAfterCompletion：只有每日、每週保留', () => {
    expect(keepsPriorityAfterCompletion({ type: 'daily' })).toBe(true);
    expect(keepsPriorityAfterCompletion({ type: 'weekly' })).toBe(true);
    expect(keepsPriorityAfterCompletion({ type: 'precise' })).toBe(false);
    expect(keepsPriorityAfterCompletion({ type: 'infinite' })).toBe(false);
    expect(keepsPriorityAfterCompletion(undefined)).toBe(false);
  });

  it('每日優先任務完成後標記和順位都不變；今天剩下的時間不擋人，明天又排第一', () => {
    const list = [daily, once, normal];
    const after = complete(list, 'd', '2026-11-16T10:00:00.000Z');
    const d = after.find(t => t.id === 'd');
    expect(d.isPriority).toBe(true);
    expect(d.priorityOrder).toBe(1);
    // 今天：輪到下一個優先任務
    expect(ids(computeActivePriorityTasks(after, MONDAY))).toEqual(['o']);
    // 明天：每日任務回到第一順位
    expect(ids(computeActivePriorityTasks(after, TUESDAY))).toEqual(['d', 'o']);
  });

  it('每週優先任務在指定日完成後保留；非指定日不擋人，下一個指定日又排回來', () => {
    const list = [weeklyWed, once];
    const after = complete(list, 'w', '2026-11-18T10:00:00.000Z');
    expect(after.find(t => t.id === 'w')).toMatchObject({ isPriority: true, priorityOrder: 2 });
    expect(ids(computeActivePriorityTasks(after, WEDNESDAY))).toEqual(['o']);
    expect(ids(computeActivePriorityTasks(after, THURSDAY))).toEqual(['o']);
    expect(ids(computeActivePriorityTasks(after, NEXT_WEDNESDAY))).toEqual(['w', 'o']);
  });

  it('一次性優先任務完成後仍會拿掉標記，其他優先任務重新編號', () => {
    const first = { ...once, priorityOrder: 1 };
    const second = { ...daily, priorityOrder: 2 };
    const after = priorityAfterCompletion([first, second, normal], 'o');
    expect(after.find(t => t.id === 'o')).toMatchObject({ isPriority: false, priorityOrder: 0 });
    expect(after.find(t => t.id === 'd').priorityOrder).toBe(1);
  });

  it('不是優先任務、或找不到這個 id 時原樣回傳（同一個陣列）', () => {
    const list = [normal, daily];
    expect(priorityAfterCompletion(list, 'n')).toBe(list);
    expect(priorityAfterCompletion(list, 'nope')).toBe(list);
    expect(priorityAfterCompletion(list, 'd')).toBe(list);
  });
});

describe('停止重複任務與恢復', () => {
  const NOW = '2026-11-22T06:00:00.000Z';
  const makeData = () => ({
    majorTasks: [{ id: 'p', title: '計畫' }],
    archivedTasks: [],
    subTasks: [
      { id: 'd', majorTaskId: 'p', indicatorId: 'growth', type: 'daily', completionCount: 4, lastCompletedAt: '2026-11-21T08:00:00.000Z', isPriority: true, priorityOrder: 1, sortOrder: 3 },
      { id: 'o', majorTaskId: 'p', indicatorId: 'growth', type: 'precise', isPriority: true, priorityOrder: 2 },
      { id: 'inf', majorTaskId: 'p', indicatorId: 'growth', type: 'infinite', completionCount: 2 },
    ],
    archivedSubTasks: [
      { id: 'done', majorTaskId: 'p', indicatorId: 'growth', type: 'precise', completed: true, completedAt: NOW },
    ],
    taskHistory: [{ id: 'h1', taskId: 'd', rewardTickets: 1 }],
    lotteryTickets: 7,
  });

  it('canStopTask：只有每日、每週、隨時挑戰可以停止', () => {
    expect(['daily', 'weekly', 'infinite'].every(type => canStopTask({ type }))).toBe(true);
    expect(canStopTask({ type: 'precise' })).toBe(false);
    expect(canStopTask(null)).toBe(false);
  });

  it('isStoppedTask：已歸檔的重複任務、沒有跟著計畫收起來的，就是停止的（含沒有 stoppedAt 的舊資料）', () => {
    expect(isStoppedTask({ type: 'daily', completed: true })).toBe(true);
    expect(isStoppedTask({ type: 'infinite', completed: true, stoppedAt: NOW })).toBe(true);
    expect(isStoppedTask({ type: 'weekly', completed: false, archivedWithPlanId: 'p' })).toBe(false);
    expect(isStoppedTask({ type: 'precise', completed: true })).toBe(false);
  });

  it('停止：搬到已結束區，資料格式和以前相同（completed: true），另記 stoppedAt；優先順序重新編號', () => {
    const data = makeData();
    const result = stopSubTask(data, 'd', NOW);
    expect(result.subTasks.map(t => t.id)).toEqual(['o', 'inf']);
    expect(result.subTasks.find(t => t.id === 'o').priorityOrder).toBe(1);
    const stopped = result.archivedSubTasks.find(t => t.id === 'd');
    expect(stopped).toMatchObject({ completed: true, completedAt: NOW, stoppedAt: NOW, isPriority: false, priorityOrder: 0, completionCount: 4, sortOrder: 3 });
    expect(isStoppedTask(stopped)).toBe(true);
    // 完成紀錄和券不在這裡處理（回傳值不含 taskHistory、lotteryTickets）
    expect(result).not.toHaveProperty('taskHistory');
    expect(result).not.toHaveProperty('lotteryTickets');
  });

  it('停止：一次性任務、找不到的任務不處理', () => {
    expect(stopSubTask(makeData(), 'o', NOW)).toBeNull();
    expect(stopSubTask(makeData(), 'nope', NOW)).toBeNull();
  });

  it('停止的任務完成次數照樣算進成就和維度進度', () => {
    const data = makeData();
    const before = countIndicatorProgress(data, 'growth');
    const after = countIndicatorProgress({ ...data, ...stopSubTask(data, 'd', NOW) }, 'growth');
    expect(after).toBe(before);
  });

  it('恢復：放回清單（保留排序位置、不是優先任務、次數和最後完成時間不變），清掉停止時加的欄位', () => {
    const data = makeData();
    const stopped = { ...data, ...stopSubTask(data, 'd', NOW) };
    const result = restoreStoppedSubTask(stopped, 'd');
    const back = result.subTasks.find(t => t.id === 'd');
    expect(back).toMatchObject({ completed: false, isPriority: false, priorityOrder: 0, completionCount: 4, sortOrder: 3, lastCompletedAt: '2026-11-21T08:00:00.000Z' });
    expect(back).not.toHaveProperty('stoppedAt');
    expect(back).not.toHaveProperty('completedAt');
    expect(result.archivedSubTasks.map(t => t.id)).toEqual(['done']);
    expect(result).not.toHaveProperty('taskHistory');
    expect(result).not.toHaveProperty('lotteryTickets');
  });

  it('恢復：舊版停止的資料（沒有 stoppedAt）也能恢復', () => {
    const data = makeData();
    data.archivedSubTasks.push({ id: 'old', majorTaskId: 'p', type: 'weekly', days: [1], completed: true, completedAt: NOW, completionCount: 9 });
    const result = restoreStoppedSubTask(data, 'old');
    expect(result.subTasks.find(t => t.id === 'old')).toMatchObject({ completed: false, completionCount: 9 });
  });

  it('恢復：真的完成的一次性任務、跟著計畫收起來的、計畫已完成的、進行中已有同 id 的，都不處理', () => {
    const data = makeData();
    expect(restoreStoppedSubTask(data, 'done')).toBeNull();
    data.archivedSubTasks.push({ id: 'withPlan', majorTaskId: 'p', type: 'daily', completed: false, archivedWithPlanId: 'p' });
    expect(restoreStoppedSubTask(data, 'withPlan')).toBeNull();
    data.archivedSubTasks.push({ id: 'd', majorTaskId: 'p', type: 'daily', completed: true });
    expect(restoreStoppedSubTask(data, 'd')).toBeNull();

    const stopped = { ...makeData(), ...stopSubTask(makeData(), 'inf', NOW) };
    const planDone = { ...stopped, ...archivePlan(stopped, 'p', NOW) };
    expect(restoreStoppedSubTask(planDone, 'inf')).toBeNull();
    // 恢復計畫時停止的任務不會跟著回來（它沒有 archivedWithPlanId），恢復計畫後才可以單獨恢復
    const planBack = { ...planDone, ...restorePlan(planDone, 'p') };
    expect(planBack.subTasks.some(t => t.id === 'inf')).toBe(false);
    expect(restoreStoppedSubTask(planBack, 'inf').subTasks.some(t => t.id === 'inf')).toBe(true);
  });
});
