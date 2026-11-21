import { describe, it, expect } from 'vitest';
import { archivePlan, countIndicatorProgress, isArchivedWithPlan, restorePlan } from '../src/domain/plans.js';
import { computeActivePriorityTasks } from '../src/domain/tasks.js';
import { completeMajorTaskMessage } from '../src/domain/confirmations.js';
import { normalizeData } from '../src/shared/defaultData.js';

const NOW = '2026-11-20T03:00:00.000Z';

const baseData = () => ({
  majorTasks: [
    { id: 'p', title: '讀書計畫', indicatorId: 'growth', completed: false },
    { id: 'q', title: '運動計畫', indicatorId: 'health', completed: false },
  ],
  archivedTasks: [],
  subTasks: [
    // 計畫 p：一個優先的每日任務、兩個還沒做的一次性任務（其中一個是優先）
    { id: 'daily', majorTaskId: 'p', indicatorId: 'growth', type: 'daily', completionCount: 5, isPriority: true, priorityOrder: 1 },
    { id: 'once1', majorTaskId: 'p', indicatorId: 'growth', type: 'precise', completed: false, isPriority: true, priorityOrder: 3 },
    { id: 'once2', majorTaskId: 'p', indicatorId: 'growth', type: 'precise', completed: false, isPriority: false, priorityOrder: 0 },
    // 計畫 q：一個優先任務
    { id: 'run', majorTaskId: 'q', indicatorId: 'health', type: 'precise', completed: false, isPriority: true, priorityOrder: 2 },
  ],
  archivedSubTasks: [
    // 計畫 p 裡早就真的完成的一次性任務
    { id: 'doneBefore', majorTaskId: 'p', indicatorId: 'growth', type: 'precise', completed: true, completedAt: '2026-11-01T00:00:00.000Z', isPriority: false, priorityOrder: 0 },
  ],
});

const apply = (data, changes) => ({ ...data, ...changes });
const byId = (list, id) => list.find(t => t.id === id);

describe('archivePlan：完成整個計畫', () => {
  it('進行中的任務跟著計畫收起來，加上計畫標記，但不算「完成」', () => {
    const result = archivePlan(baseData(), 'p', NOW);
    expect(result.majorTasks.map(t => t.id)).toEqual(['q']);
    expect(result.archivedTasks).toEqual([expect.objectContaining({ id: 'p', completed: true, completedAt: NOW })]);
    expect(result.subTasks.map(t => t.id)).toEqual(['run']);
    const once1 = byId(result.archivedSubTasks, 'once1');
    expect(once1).toMatchObject({ completed: false, completedAt: NOW, archivedWithPlanId: 'p', isPriority: false, priorityOrder: 0 });
    expect(isArchivedWithPlan(once1)).toBe(true);
  });

  it('原本的優先順位記下來；不是優先任務的不記', () => {
    const result = archivePlan(baseData(), 'p', NOW);
    expect(byId(result.archivedSubTasks, 'daily').priorityOrderBeforeArchive).toBe(1);
    expect(byId(result.archivedSubTasks, 'once1').priorityOrderBeforeArchive).toBe(3);
    expect(byId(result.archivedSubTasks, 'once2')).not.toHaveProperty('priorityOrderBeforeArchive');
  });

  it('剩下的優先任務重新編號', () => {
    const result = archivePlan(baseData(), 'p', NOW);
    expect(byId(result.subTasks, 'run').priorityOrder).toBe(1);
  });

  it('早就完成的任務原樣不動（沒有計畫標記）', () => {
    const data = baseData();
    const result = archivePlan(data, 'p', NOW);
    expect(byId(result.archivedSubTasks, 'doneBefore')).toBe(data.archivedSubTasks[0]);
  });

  it('找不到進行中的計畫時回傳 null', () => {
    expect(archivePlan(baseData(), 'nope', NOW)).toBeNull();
  });
});

describe('countIndicatorProgress：只算真的完成的', () => {
  it('完成整個計畫後，沒做完的一次性任務不會增加進度', () => {
    const data = baseData();
    // 改版前：沒做完的 2 個一次性任務也會各加 1
    const before = countIndicatorProgress(data, 'growth');
    expect(before).toBe(5 + 1); // 每日任務 5 次 + 早就完成的 1 個
    const after = countIndicatorProgress(apply(data, archivePlan(data, 'p', NOW)), 'growth');
    expect(after).toBe(before);
  });

  it('每日、每週、隨時挑戰任務照完成次數算（進行中或已歸檔都一樣）', () => {
    const data = {
      subTasks: [{ indicatorId: 'health', type: 'weekly', completionCount: 2 }, { indicatorId: 'health', type: 'precise' }],
      archivedSubTasks: [
        { indicatorId: 'health', type: 'infinite', completionCount: 4, archivedWithPlanId: 'x' },
        { indicatorId: 'health', type: 'precise', completed: true },
      ],
    };
    expect(countIndicatorProgress(data, 'health')).toBe(2 + 4 + 1);
  });

  it("'total' 算全部維度", () => {
    const data = baseData();
    expect(countIndicatorProgress(data, 'total')).toBe(6);
  });

  it('舊資料（沒有計畫標記）照舊：已歸檔的一次性任務都算 1', () => {
    const old = {
      subTasks: [],
      archivedSubTasks: [{ indicatorId: 'growth', type: 'precise', completed: true }, { indicatorId: 'growth', type: 'precise', completed: true }],
    };
    expect(countIndicatorProgress(old, 'growth')).toBe(2);
  });
});

describe('restorePlan：恢復計畫', () => {
  const archived = () => {
    const data = baseData();
    return apply(data, archivePlan(data, 'p', NOW));
  };

  it('跟著計畫收起來的任務一起回到進行中，標記清掉；早就完成的留在「已完成」區', () => {
    const result = restorePlan(archived(), 'p');
    expect(result.majorTasks.map(t => t.id)).toEqual(['q', 'p']);
    expect(byId(result.majorTasks, 'p').completed).toBe(false);
    expect(result.archivedTasks).toEqual([]);
    expect(result.subTasks.map(t => t.id).sort()).toEqual(['daily', 'once1', 'once2', 'run']);
    expect(result.archivedSubTasks.map(t => t.id)).toEqual(['doneBefore']);
    for (const t of result.subTasks) {
      expect(t).not.toHaveProperty('archivedWithPlanId');
      expect(t).not.toHaveProperty('priorityOrderBeforeArchive');
      expect(t).not.toHaveProperty('completedAt');
      expect(t.completed).toBe(false);
    }
  });

  it('完成次數保留', () => {
    expect(byId(restorePlan(archived(), 'p').subTasks, 'daily').completionCount).toBe(5);
  });

  it('期間沒有其他變動時，優先順序完全回到原本的樣子', () => {
    const result = restorePlan(archived(), 'p');
    const order = Object.fromEntries(result.subTasks.filter(t => t.isPriority).map(t => [t.id, t.priorityOrder]));
    expect(order).toEqual({ daily: 1, run: 2, once1: 3 });
    expect(byId(result.subTasks, 'once2')).toMatchObject({ isPriority: false, priorityOrder: 0 });
  });

  it('期間又多了優先任務：插在原本順位的前一格之後（原本第 3 → 排在現在第 2 的後面），編號連續', () => {
    const data = archived();
    // 收起來之後 run 變成 1；又新增了 extra 排 2
    data.subTasks = [...data.subTasks, { id: 'extra', majorTaskId: 'q', type: 'precise', isPriority: true, priorityOrder: 2 }];
    const result = restorePlan(data, 'p');
    const ranked = result.subTasks.filter(t => t.isPriority).sort((a, b) => a.priorityOrder - b.priorityOrder);
    expect(ranked.map(t => [t.id, t.priorityOrder])).toEqual([['daily', 1], ['run', 2], ['extra', 3], ['once1', 4]]);
  });

  it('恢復後的優先任務照常擋住其他任務', () => {
    const result = restorePlan(archived(), 'p');
    const monday = new Date(2026, 10, 16, 10, 0);
    expect(computeActivePriorityTasks(result.subTasks, monday)[0].id).toBe('daily');
  });

  it('恢復後成就進度不變', () => {
    const data = archived();
    const before = countIndicatorProgress(data, 'growth');
    expect(countIndicatorProgress(apply(data, restorePlan(data, 'p')), 'growth')).toBe(before);
  });

  it('改版前完成的計畫（任務沒有標記）：只拿回計畫本身，和以前一樣', () => {
    const old = {
      majorTasks: [],
      archivedTasks: [{ id: 'old', completed: true }],
      subTasks: [],
      archivedSubTasks: [{ id: 's', majorTaskId: 'old', type: 'precise', completed: true }],
    };
    const result = restorePlan(old, 'old');
    expect(result.majorTasks.map(t => t.id)).toEqual(['old']);
    expect(result.subTasks).toEqual([]);
    expect(result.archivedSubTasks).toEqual(old.archivedSubTasks);
  });

  it('其他計畫的標記任務不會被搬回來', () => {
    const data = archived();
    const both = apply(data, archivePlan(data, 'q', NOW));
    const result = restorePlan(both, 'p');
    expect(byId(result.archivedSubTasks, 'run')).toMatchObject({ archivedWithPlanId: 'q' });
    expect(byId(result.subTasks, 'run')).toBeUndefined();
  });

  it('進行中已經有同一個 id（不正常的舊資料）時不搬，避免變成兩份', () => {
    const data = archived();
    data.subTasks = [...data.subTasks, { id: 'once2', majorTaskId: 'p', type: 'precise' }];
    const result = restorePlan(data, 'p');
    expect(result.subTasks.filter(t => t.id === 'once2')).toHaveLength(1);
    expect(byId(result.archivedSubTasks, 'once2')).toBeDefined();
  });

  it('找不到已完成的計畫時回傳 null', () => {
    expect(restorePlan(baseData(), 'p')).toBeNull();
  });

  it('完成 → 恢復 → 再完成，標記和順位照樣正確', () => {
    const once = restorePlan(archived(), 'p');
    const again = archivePlan(apply(archived(), once), 'p', NOW);
    expect(byId(again.archivedSubTasks, 'once1')).toMatchObject({ archivedWithPlanId: 'p', priorityOrderBeforeArchive: 3 });
  });
});

describe('資料格式：計畫標記是新加的欄位', () => {
  it('normalizeData 原樣保留標記；沒有標記的舊資料也照常讀', () => {
    const raw = {
      archivedSubTasks: [
        { id: 'a', type: 'precise', archivedWithPlanId: 'p', priorityOrderBeforeArchive: 2 },
        { id: 'b', type: 'precise', completed: true },
      ],
    };
    const result = normalizeData(raw);
    expect(result.archivedSubTasks[0]).toMatchObject({ archivedWithPlanId: 'p', priorityOrderBeforeArchive: 2 });
    expect(result.archivedSubTasks[1]).not.toHaveProperty('archivedWithPlanId');
  });
});

describe('completeMajorTaskMessage：說明新的規則', () => {
  it('寫出沒做完的一次性任務不算進度、恢復時會一起回來、優先標記也會恢復', () => {
    const msg = completeMajorTaskMessage(baseData(), 'p');
    expect(msg).toContain('3 個任務會一起歸檔');
    expect(msg).toContain('其中 2 個一次性任務還沒完成，不會算進成就和維度的進度');
    expect(msg).toContain('這 3 個任務會一起回到進行中，原本的優先標記也會恢復');
    expect(msg).toContain('之前就已經完成的任務會留在「已完成」區');
    expect(msg).toContain('不會刪除任何完成紀錄');
  });

  it('沒有優先任務、沒有一次性任務時不提那兩句', () => {
    const data = baseData();
    data.subTasks = [{ id: 'd', majorTaskId: 'p', type: 'daily', isPriority: false }];
    const msg = completeMajorTaskMessage(data, 'p');
    expect(msg).not.toContain('一次性任務還沒完成');
    expect(msg).not.toContain('優先標記');
    expect(msg).toContain('這 1 個任務會一起回到進行中；');
  });

  it('計畫裡沒有進行中的任務', () => {
    const data = baseData();
    data.subTasks = [];
    expect(completeMajorTaskMessage(data, 'p')).toContain('之後按「恢復計畫」會拿回計畫本身');
  });
});
