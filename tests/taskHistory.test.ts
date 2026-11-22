import { describe, it, expect } from 'vitest';
import {
  addHistoryRecord,
  completionCountChanges,
  deleteHistoryRecords,
  hasCompletionCount,
  historyFieldsFromTask,
  linkableHistoryTasks,
  revertStoppedTaskRecord,
} from '../src/domain/taskHistory.ts';
import type { HistoryChanges, TaskListName } from '../src/domain/taskHistory.ts';
import { deleteHistoryRecordsMessage } from '../src/domain/confirmations.ts';
import type { LifeSyncData, MajorTask, SubTask, TaskHistoryRecord } from '../src/types/data.ts';

type TestData = Pick<LifeSyncData, 'lotteryTickets' | 'majorTasks' | 'archivedTasks' | 'subTasks' | 'archivedSubTasks' | 'taskHistory'>;

// 下面的 `as MajorTask[]`、`as TaskHistoryRecord[]`：測試資料只寫這裡用得到的欄位，
// 省略了計畫的 indicatorId、部分紀錄的 completedAt
const baseData = (): TestData => ({
  lotteryTickets: 7,
  majorTasks: [{ id: 'm1', title: '整理家裡' }] as MajorTask[],
  archivedTasks: [{ id: 'm2', title: '舊計畫' }] as MajorTask[],
  subTasks: [
    { id: 'sweep', majorTaskId: 'm1', title: '掃地', type: 'daily', completionCount: 12 },
    { id: 'words', majorTaskId: 'm1', title: '背單字', type: 'infinite', completionCount: 1 },
    { id: 'once', majorTaskId: 'm1', title: '買拖把', type: 'precise', completed: false },
    { id: 'zero', majorTaskId: 'm1', title: '跑步', type: 'weekly', days: [1], completionCount: 0 },
  ],
  archivedSubTasks: [
    { id: 'old', majorTaskId: 'm2', title: '打字練習', type: 'weekly', completed: true, completionCount: 23 },
    { id: 'done', majorTaskId: 'm1', title: '報名', type: 'precise', completed: true },
  ],
  // 新的在前
  taskHistory: [
    { id: 'h1', taskId: 'sweep', completedAt: '2026-11-19T02:00:00.000Z', rewardTickets: 1 },
    { id: 'h2', taskId: 'old', completedAt: '2026-11-18T02:00:00.000Z', rewardTickets: 1 },
    { id: 'h3', taskId: 'sweep', completedAt: '2026-11-17T02:00:00.000Z', rewardTickets: 1 },
    { id: 'h4', taskId: 'done', completedAt: '2026-11-16T02:00:00.000Z', rewardTickets: 3 },
    { id: 'h5', title: '手動補登的舊紀錄', completedAt: '2026-11-15T02:00:00.000Z' },
    { id: 'h6', taskId: 'zero', completedAt: '2026-11-14T02:00:00.000Z' },
  ],
});

const countOf = (result: Pick<HistoryChanges, TaskListName>, list: TaskListName, id: string) => {
  const items: SubTask[] = result[list];
  return items.find(t => t.id === id)!.completionCount; // 測試只查資料裡有的任務
};

describe('hasCompletionCount：只有每日、每週、隨時挑戰有完成次數', () => {
  it('分辨類型', () => {
    expect(hasCompletionCount({ type: 'daily' })).toBe(true);
    expect(hasCompletionCount({ type: 'weekly' })).toBe(true);
    expect(hasCompletionCount({ type: 'infinite' })).toBe(true);
    expect(hasCompletionCount({ type: 'precise' })).toBe(false);
    expect(hasCompletionCount(null)).toBe(false);
  });
});

describe('deleteHistoryRecords：刪紀錄時完成次數跟著減少', () => {
  it('進行中的每日任務減 1，其他任務不動', () => {
    const data = baseData();
    const result = deleteHistoryRecords(data, ['h1']);
    expect(result.taskHistory.map(h => h.id)).toEqual(['h2', 'h3', 'h4', 'h5', 'h6']);
    expect(countOf(result, 'subTasks', 'sweep')).toBe(11);
    expect(countOf(result, 'subTasks', 'words')).toBe(1);
    // 沒有變動的清單沿用原本的陣列
    expect(result.archivedSubTasks).toBe(data.archivedSubTasks);
  });

  it('已歸檔的每週任務也會減', () => {
    const result = deleteHistoryRecords(baseData(), ['h2']);
    expect(countOf(result, 'archivedSubTasks', 'old')).toBe(22);
  });

  it('一次刪同一個任務的好幾筆，次數照筆數減', () => {
    const result = deleteHistoryRecords(baseData(), ['h1', 'h3', 'h2']);
    expect(countOf(result, 'subTasks', 'sweep')).toBe(10);
    expect(countOf(result, 'archivedSubTasks', 'old')).toBe(22);
  });

  it('完成次數最少到 0，不會變負數', () => {
    const result = deleteHistoryRecords(baseData(), ['h6']);
    expect(countOf(result, 'subTasks', 'zero')).toBe(0);
  });

  it('一次性任務、沒對應任務的手動紀錄：只刪紀錄，不改任何任務', () => {
    const data = baseData();
    const result = deleteHistoryRecords(data, ['h4', 'h5']);
    expect(result.taskHistory.map(h => h.id)).toEqual(['h1', 'h2', 'h3', 'h6']);
    expect(result.subTasks).toBe(data.subTasks);
    expect(result.archivedSubTasks).toBe(data.archivedSubTasks);
  });

  it('對應的任務已經被刪掉時，只刪紀錄', () => {
    const data = { ...baseData(), taskHistory: [{ id: 'x', taskId: 'gone' }] as TaskHistoryRecord[] };
    expect(deleteHistoryRecords(data, ['x']).taskHistory).toEqual([]);
  });

  it('不改抽卡券，也不改 lastCompletedAt', () => {
    const data = baseData();
    data.subTasks[0].lastCompletedAt = '2026-11-19T10:00:00.000Z';
    const result = deleteHistoryRecords(data, ['h1']);
    expect(result).not.toHaveProperty('lotteryTickets');
    expect(result.subTasks[0].lastCompletedAt).toBe('2026-11-19T10:00:00.000Z');
  });

  it('舊資料裡同一個 id 同時在進行中和「已完成」區：只改進行中那一份', () => {
    const data = baseData();
    data.archivedSubTasks.push({ id: 'sweep', type: 'daily', completed: true, completionCount: 5 });
    const result = deleteHistoryRecords(data, ['h1']);
    expect(countOf(result, 'subTasks', 'sweep')).toBe(11);
    expect(result.archivedSubTasks.find(t => t.id === 'sweep')!.completionCount).toBe(5); // 上面剛放進去
  });

  it('不修改傳入的資料', () => {
    const data = baseData();
    deleteHistoryRecords(data, ['h1', 'h2']);
    expect(data.subTasks[0].completionCount).toBe(12);
    expect(data.taskHistory).toHaveLength(6);
  });
});

describe('addHistoryRecord：補登時完成次數跟著增加', () => {
  it('選了任務：次數加 1；紀錄依完成時間插在正確位置', () => {
    const record = { id: 'new', taskId: 'sweep', completedAt: '2026-11-18T12:00:00.000Z', rewardTickets: 0 };
    const result = addHistoryRecord(baseData(), record);
    expect(countOf(result, 'subTasks', 'sweep')).toBe(13);
    expect(result.taskHistory.map(h => h.id)).toEqual(['h1', 'new', 'h2', 'h3', 'h4', 'h5', 'h6']);
  });

  it('比所有紀錄都新的放最前面，比所有紀錄都舊的放最後面', () => {
    const newest = addHistoryRecord(baseData(), { id: 'n', completedAt: '2026-11-20T00:00:00.000Z' });
    expect(newest.taskHistory[0].id).toBe('n');
    const oldest = addHistoryRecord(baseData(), { id: 'o', completedAt: '2020-01-01T00:00:00.000Z' });
    expect(oldest.taskHistory.at(-1)!.id).toBe('o'); // 紀錄不是空的
  });

  it('已歸檔的任務也會加', () => {
    const result = addHistoryRecord(baseData(), { id: 'n', taskId: 'old', completedAt: '2026-11-01T00:00:00.000Z' });
    expect(countOf(result, 'archivedSubTasks', 'old')).toBe(24);
  });

  it('沒選任務、或選的是一次性任務：只多一筆紀錄', () => {
    const data = baseData();
    const plain = addHistoryRecord(data, { id: 'n', completedAt: '2026-11-01T00:00:00.000Z' });
    expect(plain.taskHistory).toHaveLength(7);
    expect(plain.subTasks).toBe(data.subTasks);
    const once = addHistoryRecord(data, { id: 'n', taskId: 'done', completedAt: '2026-11-01T00:00:00.000Z' });
    expect(once.archivedSubTasks).toBe(data.archivedSubTasks);
  });

  it('沒有完成次數欄位的舊任務，從 0 開始加', () => {
    const data = baseData();
    delete data.subTasks[1].completionCount;
    expect(countOf(addHistoryRecord(data, { id: 'n', taskId: 'words', completedAt: '2026-11-01T00:00:00.000Z' }), 'subTasks', 'words')).toBe(1);
  });

  it('補登後再刪掉同一筆，次數回到原本的數字', () => {
    const data = baseData();
    const added = { ...data, ...addHistoryRecord(data, { id: 'n', taskId: 'sweep', completedAt: '2026-11-01T00:00:00.000Z' }) };
    const removed = deleteHistoryRecords(added, ['n']);
    expect(countOf(removed, 'subTasks', 'sweep')).toBe(12);
  });
});

describe('linkableHistoryTasks、historyFieldsFromTask：補登時可以選的任務', () => {
  it('只列有完成次數的任務，進行中在前、已歸檔在後，附上計畫名稱', () => {
    const list = linkableHistoryTasks(baseData());
    expect(list.map(o => [o.task.id, o.planTitle, o.archived])).toEqual([
      ['sweep', '整理家裡', false],
      ['words', '整理家裡', false],
      ['zero', '整理家裡', false],
      ['old', '舊計畫', true],
    ]);
  });

  it('同一個 id 只列一次（以進行中那一份為準）', () => {
    const data = baseData();
    data.archivedSubTasks.push({ id: 'sweep', type: 'daily', completed: true });
    expect(linkableHistoryTasks(data).filter(o => o.task.id === 'sweep')).toHaveLength(1);
  });

  it('紀錄的欄位跟著選的任務', () => {
    const task: SubTask = { id: 'sweep', title: '掃地', type: 'daily', indicatorId: 'health' };
    expect(historyFieldsFromTask(task, '整理家裡')).toEqual({
      taskId: 'sweep', title: '掃地', majorTaskTitle: '整理家裡', indicatorId: 'health', type: 'daily',
    });
    expect(historyFieldsFromTask({ id: 'x', type: 'daily' }).majorTaskTitle).toBe('獨立任務');
  });
});

describe('completionCountChanges 與確認文字一致', () => {
  it('確認文字列出的次數變化和實際刪除的結果相同', () => {
    const data = baseData();
    const ids = ['h1', 'h3', 'h2'];
    const changes = completionCountChanges(data, data.taskHistory.filter(h => ids.includes(h.id)), -1);
    const result = deleteHistoryRecords(data, ids);
    for (const c of changes) expect(countOf(result, c.list, c.taskId)).toBe(c.to);
  });

  it('刪一筆：寫出任務名稱、次數怎麼變、不扣券', () => {
    const msg = deleteHistoryRecordsMessage(baseData(), ['h1']);
    expect(msg).toContain('確定要刪除這筆任務紀錄嗎？');
    expect(msg).toContain('「掃地」的完成次數會從 12 次變成 11 次');
    expect(msg).toContain('不會扣回當初發的抽卡券');
  });

  it('刪好幾筆：逐一列出每個任務', () => {
    const msg = deleteHistoryRecordsMessage(baseData(), ['h1', 'h3', 'h2', 'h5']);
    expect(msg).toContain('選取的 4 筆任務紀錄');
    expect(msg).toContain('「掃地」：12 次 → 10 次');
    expect(msg).toContain('「打字練習」：23 次 → 22 次');
  });

  it('沒有次數會變（一次性任務、手動紀錄、已經是 0 次）：不提完成次數', () => {
    const msg = deleteHistoryRecordsMessage(baseData(), ['h4', 'h5', 'h6']);
    expect(msg).not.toContain('完成次數');
    expect(msg).toContain('刪除後無法復原');
  });
});

describe('revertStoppedTaskRecord：番茄鐘撤銷已停止任務的某一筆紀錄', () => {
  const data = (): Pick<LifeSyncData, 'lotteryTickets' | 'subTasks' | 'archivedSubTasks' | 'taskHistory'> => ({
    lotteryTickets: 5,
    subTasks: [],
    archivedSubTasks: [{ id: 'stop', type: 'infinite', completed: true, stoppedAt: '2026-11-22T00:00:00.000Z', completionCount: 3 }],
    taskHistory: [
      { id: 'r2', taskId: 'stop', rewardTickets: 2 },
      { id: 'r1', taskId: 'stop', rewardTickets: 1 },
      { id: 'x', taskId: 'other', rewardTickets: 1 },
    ] as TaskHistoryRecord[], // 撤銷只看 id、taskId、rewardTickets，省略了 completedAt
  });

  it('只刪指定那一筆、完成次數減 1，任務仍留在已結束區', () => {
    const result = revertStoppedTaskRecord(data(), 'stop', 'r1')!; // 這筆紀錄存在，一定有結果
    expect(result.taskHistory.map(h => h.id)).toEqual(['r2', 'x']);
    expect(result.archivedSubTasks[0]).toMatchObject({ id: 'stop', completed: true, completionCount: 2 });
    expect(result.subTasks).toEqual([]);
    // 番茄鐘的券要結算才發：預設不扣券
    expect(result.lotteryTickets).toBe(5);
    expect(result.ticketsDeducted).toBe(0);
  });

  it('要扣券時扣回那筆紀錄記的張數', () => {
    const result = revertStoppedTaskRecord(data(), 'stop', 'r2', true)!; // 這筆紀錄存在，一定有結果
    expect(result.lotteryTickets).toBe(3);
    expect(result.ticketsDeducted).toBe(2);
  });

  it('找不到紀錄、或紀錄不是這個任務的，不處理', () => {
    expect(revertStoppedTaskRecord(data(), 'stop', 'nope')).toBeNull();
    expect(revertStoppedTaskRecord(data(), 'stop', 'x')).toBeNull();
  });
});
