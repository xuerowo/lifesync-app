/**
 * 「完成整個計畫」與「恢復計畫」，以及成就、維度進度的算法（純函式，Q13）。
 *
 * 完成整個計畫時，計畫裡還在進行中的任務會跟著計畫一起收進 archivedSubTasks，
 * 並加上標記 archivedWithPlanId（= 計畫 id）。有這個標記的任務：
 * - completed 是 false：它們不是真的完成了，只是跟著計畫收起來。
 *   completedAt 記收起來的時間，日曆用它決定任務顯示到哪一天（和改版前相同）。
 * - 一次性任務不算進成就和維度進度（每日、每週、隨時挑戰任務照完成次數算，次數本來就是真的完成）。
 * - 原本是優先任務的，優先標記先拿掉（收起來的任務不參與優先順序），
 *   原本的順位記在 priorityOrderBeforeArchive，恢復計畫時用。
 * 恢復計畫時，有這個計畫標記的任務會一起回到進行中，標記清掉；計畫完成前就已經完成的任務
 * （沒有標記）留在「已完成」區。
 *
 * 舊資料沒有這個標記（改版前完成的計畫分辨不出哪些任務是真的做完），一律照舊：
 * 照舊算進成就，恢復計畫時也不會搬回來。normalizeData 不需要特別處理，沒有這個欄位就是舊資料。
 */
import { renumberPriorityTasks } from './tasks.ts';
import { topSortOrder } from '../shared/taskOrder.ts';
import type { AchievementCategory, ArchivedSubTask, LifeSyncData, MajorTask, SubTask, TaskType } from '../types/data.ts';

const COUNTED_TYPES: readonly (TaskType | undefined)[] = ['daily', 'weekly', 'infinite'];
const isCounted = (task: Pick<SubTask, 'type'> | null | undefined) => COUNTED_TYPES.includes(task?.type);

/** 這個已歸檔的任務是不是「沒做完、跟著計畫一起收起來」的 */
export const isArchivedWithPlan = (task: Pick<ArchivedSubTask, 'archivedWithPlanId'> | null | undefined): boolean =>
  !!task?.archivedWithPlanId;

/** 完成、恢復計畫時會改到的清單 */
export interface PlanChanges {
  majorTasks: MajorTask[];
  archivedTasks: MajorTask[];
  subTasks: SubTask[];
  archivedSubTasks: ArchivedSubTask[];
}

/** 計畫相關函式需要的資料（沒有的清單當作空的） */
export type PlanData = Partial<Pick<LifeSyncData, 'majorTasks' | 'archivedTasks' | 'subTasks' | 'archivedSubTasks'>>;

/**
 * 完成整個計畫 planId。回傳要更新的 { majorTasks, archivedTasks, subTasks, archivedSubTasks }；
 * 找不到這個進行中的計畫時回傳 null。
 */
export function archivePlan(data: PlanData | null | undefined, planId: string, nowIso: string = new Date().toISOString()): PlanChanges | null {
  const plan = (data?.majorTasks || []).find((t) => t.id === planId);
  if (!plan) return null;
  const subTasks = data?.subTasks || [];
  const toArchive = subTasks.filter((s) => s.majorTaskId === planId);
  let remaining = subTasks.filter((s) => s.majorTaskId !== planId);
  // 有優先任務被收起來時，剩下的優先任務重新編號
  if (toArchive.some((s) => s.isPriority)) remaining = renumberPriorityTasks(remaining);

  const archived = toArchive.map((s: ArchivedSubTask): ArchivedSubTask => {
    // 舊的順位紀錄不帶過去，下面依現在是不是優先任務重新記
    const { priorityOrderBeforeArchive: _staleOrder, ...rest } = s;
    return {
      ...rest,
      completed: false,
      completedAt: nowIso,
      isPriority: false,
      priorityOrder: 0,
      archivedWithPlanId: planId,
      ...(s.isPriority ? { priorityOrderBeforeArchive: s.priorityOrder } : {}),
    };
  });

  return {
    majorTasks: (data?.majorTasks || []).filter((t) => t.id !== planId),
    archivedTasks: [...(data?.archivedTasks || []), { ...plan, completed: true, completedAt: nowIso }],
    subTasks: remaining,
    archivedSubTasks: [...(data?.archivedSubTasks || []), ...archived],
  };
}

/**
 * 恢復已完成的計畫 planId：計畫回到進行中，跟著它一起收起來的任務也回到進行中，
 * 原本是優先任務的，盡量排回原本的順位（排在現在佔著那個順位的任務前面），再重新編成 1..n。
 * 回傳要更新的 { majorTasks, archivedTasks, subTasks, archivedSubTasks }；找不到時回傳 null。
 */
export function restorePlan(data: PlanData | null | undefined, planId: string): PlanChanges | null {
  const plan = (data?.archivedTasks || []).find((t) => t.id === planId);
  if (!plan) return null;
  const subTasks = data?.subTasks || [];
  const archivedSubTasks = data?.archivedSubTasks || [];
  const activeIds = new Set(subTasks.map((s) => s.id));
  // 進行中已經有同一個 id（不正常的舊資料）時不搬，避免變成兩份
  const comesBack = (s: ArchivedSubTask) => s.archivedWithPlanId === planId && !activeIds.has(s.id);

  let restoredAnyPriority = false;
  const restored = archivedSubTasks.filter(comesBack).map((s): SubTask => {
    // 清掉跟著計畫收起來時加上的欄位
    const { archivedWithPlanId: _plan, priorityOrderBeforeArchive, completedAt: _archivedAt, ...rest } = s;
    const order = Number(priorityOrderBeforeArchive);
    const wasPriority = Number.isFinite(order) && order > 0;
    if (wasPriority) restoredAnyPriority = true;
    return { ...rest, completed: false, isPriority: wasPriority, priorityOrder: wasPriority ? order - 0.5 : 0 };
  });

  let nextSubTasks: SubTask[] = [...subTasks, ...restored];
  if (restoredAnyPriority) nextSubTasks = renumberPriorityTasks(nextSubTasks);

  return {
    // 恢復的計畫放在進行中清單的最上面
    majorTasks: [...(data?.majorTasks || []), { ...plan, completed: false, sortOrder: topSortOrder(data?.majorTasks) }],
    archivedTasks: (data?.archivedTasks || []).filter((t) => t.id !== planId),
    subTasks: nextSubTasks,
    archivedSubTasks: archivedSubTasks.filter((s) => !comesBack(s)),
  };
}

/**
 * 成就與維度的進度（indicatorId 為 'total' 時算全部）：
 * - 每日、每週、隨時挑戰任務（進行中或已歸檔）：加上完成次數
 * - 已歸檔的一次性任務：真的完成的算 1；跟著計畫收起來、沒做完的不算
 * - 進行中的一次性任務：還沒完成，不算
 */
export function countIndicatorProgress(
  data: Partial<Pick<LifeSyncData, 'subTasks' | 'archivedSubTasks'>> | null | undefined,
  indicatorId: AchievementCategory,
): number {
  const matches = (s: SubTask) => indicatorId === 'total' || s.indicatorId === indicatorId;
  const active = (data?.subTasks || []).filter((s) => matches(s) && isCounted(s));
  const archived = (data?.archivedSubTasks || []).filter(matches);
  return [...active, ...archived].reduce((acc: number, s: ArchivedSubTask) => {
    if (isCounted(s)) return acc + (s.completionCount || 0);
    return acc + (isArchivedWithPlan(s) ? 0 : 1);
  }, 0);
}
