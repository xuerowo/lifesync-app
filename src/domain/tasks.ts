/**
 * 任務規則（純函式）
 */
import { localDateOf, localDateFromLocalStampedIso } from './dates.ts';
import type { ArchivedSubTask, LifeSyncData, SubTask, TaskType } from '../types/data.ts';

/** 排優先順序用得到的欄位 */
type PriorityFields = Pick<SubTask, 'id' | 'isPriority' | 'priorityOrder'>;

/** 判斷「現在該不該做」用得到的欄位 */
type ScheduleFields = Pick<SubTask, 'type' | 'lastCompletedAt' | 'days' | 'completed' | 'isPriority' | 'priorityOrder'>;

const isRepeating = (task: Pick<SubTask, 'type'> | null | undefined) => task?.type === 'daily' || task?.type === 'weekly';

/** 每日／每週任務今天（本地日期 todayStr）是否已完成。lastCompletedAt 是「本地時間標 Z」格式 */
export function isCompletedOnDate(task: Pick<SubTask, 'lastCompletedAt'> | null | undefined, todayStr: string | null): boolean {
  if (!task?.lastCompletedAt || !todayStr) return false;
  return localDateFromLocalStampedIso(task.lastCompletedAt) === todayStr;
}

/** 每週任務今天（weekday：0 = 星期日）是不是指定的日子 */
export function isScheduledWeekday(task: Pick<SubTask, 'type' | 'days'> | null | undefined, weekday: number): boolean {
  if (task?.type !== 'weekly') return true;
  return Array.isArray(task.days) && task.days.includes(weekday);
}

/**
 * 優先順序視窗的排序比較函式：依 priorityOrder 由小到大。
 * 沒有 priorityOrder（或不是數字）的排在有編號的後面；兩個都沒有、或編號相同時回傳 0，
 * 搭配 Array.prototype.sort（穩定排序）會維持原本在陣列中的先後。
 */
export function comparePriorityOrder(a: Pick<SubTask, 'priorityOrder'>, b: Pick<SubTask, 'priorityOrder'>): number {
  const orderA = a.priorityOrder;
  const orderB = b.priorityOrder;
  const hasA = typeof orderA === 'number' && Number.isFinite(orderA);
  const hasB = typeof orderB === 'number' && Number.isFinite(orderB);
  if (hasA && hasB) return orderA - orderB;
  if (hasA) return -1;
  if (hasB) return 1;
  return 0;
}

/**
 * 重排優先順序：把優先任務依原本的 priorityOrder 排好，重新編成 1..n。
 * - 非優先任務原樣保留。
 * - removedTaskId 指定的任務不計入編號，本身也原樣保留（由呼叫端決定要不要移除它）。
 * - 回傳新陣列，任務的先後位置不變；順序相同時維持原本在陣列中的先後。
 */
export function renumberPriorityTasks<T extends PriorityFields>(subTasks: T[], removedTaskId: string | null = null): T[] {
  const ranked = subTasks
    .filter(t => t.isPriority && t.id !== removedTaskId)
    // 優先任務照理都有 priorityOrder；萬一沒有，排在有編號的後面（見 comparePriorityOrder）
    .sort(comparePriorityOrder);
  const rankById = new Map(ranked.map((t, i) => [t.id, i + 1]));

  return subTasks.map(t => {
    if (!rankById.has(t.id)) return t;
    return { ...t, priorityOrder: rankById.get(t.id) };
  });
}

/**
 * 目前「擋住其他任務」的優先任務清單（依順序排好，第一個就是現在該先做的）。
 * 排除：
 * - 每日／每週任務今天已完成的
 * - 每週任務今天不是指定星期的（今天本來就不用做，不該擋住別人）
 * - 一次性任務已完成的
 * @param subTasks 進行中的子任務
 * @param now 現在時間（用來決定今天的本地日期與星期）
 */
export function computeActivePriorityTasks<T extends ScheduleFields>(subTasks: readonly T[] | null | undefined, now: Date = new Date()): T[] {
  const todayStr = localDateOf(now);
  const weekday = now.getDay();
  return (subTasks || [])
    .filter(t => t.isPriority)
    .filter(t => {
      if (isRepeating(t)) {
        if (isCompletedOnDate(t, todayStr)) return false;
        return isScheduledWeekday(t, weekday);
      }
      return !t.completed;
    })
    // 同上：沒有 priorityOrder 的排在後面
    .sort(comparePriorityOrder);
}

/**
 * 完成之後還要不要保留「優先」標記（Q11）。
 * - 每日、每週任務：保留。今天完成後，computeActivePriorityTasks 會在今天剩下的時間跳過它；
 *   明天（每週任務是下一個指定的日子）它又會排回原本的順位。
 * - 一次性任務：拿掉（它已經歸檔，不會再做）。
 * - 隨時挑戰任務本來就不能設成優先；舊資料萬一有，也照一次性任務的規則拿掉，
 *   否則它永遠不算「今天已完成」，會一直擋住其他任務。
 */
export function keepsPriorityAfterCompletion(task: Pick<SubTask, 'type'> | null | undefined): boolean {
  return isRepeating(task);
}

/**
 * 完成任務 taskId 之後的子任務清單（只處理優先標記，不處理完成次數與歸檔）。
 * 要拿掉優先標記時，拿掉後把剩下的優先任務重新編成 1..n；要保留時原樣回傳。
 */
export function priorityAfterCompletion<T extends PriorityFields & Pick<SubTask, 'type'>>(subTasks: T[], taskId: string): T[] {
  const task = subTasks.find(t => t.id === taskId);
  if (!task?.isPriority || keepsPriorityAfterCompletion(task)) return subTasks;
  const withoutMark = subTasks.map(t => (t.id === taskId ? { ...t, isPriority: false, priorityOrder: 0 } : t));
  return renumberPriorityTasks(withoutMark);
}

/** 一次性任務：不是每日、每週、隨時挑戰的任務 */
export function isOneTimeTask(task: Pick<SubTask, 'type'> | null | undefined): boolean {
  return !!task && task.type !== 'daily' && task.type !== 'weekly' && task.type !== 'infinite';
}

/**
 * 完成紀錄要記下的發券數：呼叫端指定的張數優先（番茄鐘先記 0 張，結算領取時才改），否則用任務設定的張數，都沒有就是 1 張。
 * 舊資料裡可能有負數（以前沒有檢查輸入），一律當成 0：
 * 完成時本來就不會發負數張券，紀錄若記成負數，之後撤銷或刪除反而會「加」券。
 * rewardTickets 是 unknown：舊資料可能存成字串（例如 '3'），這裡會用 Number() 換算。
 * @param task 任務或完成紀錄
 * @param options 呼叫端指定的張數
 */
export function completionRewardTickets(
  task: { rewardTickets?: unknown } | null | undefined,
  options: { rewardTickets?: unknown } | null | undefined = {},
): number {
  const raw = Number(options?.rewardTickets ?? task?.rewardTickets ?? 1);
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

/** createRecentGuard 回傳的防連點檢查 */
export interface RecentGuard {
  isBlocked(id: string, now?: number): boolean;
  mark(id: string, now?: number): void;
  clear(id: string): void;
}

/**
 * 防連點：記住「剛處理過的 id」，windowMs 毫秒內同一個 id 再來就擋下。
 * 用法：guard.isBlocked(id) 為 true 就忽略；處理後呼叫 guard.mark(id)；
 * 撤銷之後要能馬上再處理同一個 id 時，呼叫 guard.clear(id)。
 * now 參數方便測試，平常不用給。
 */
export function createRecentGuard(windowMs: number): RecentGuard {
  const seen = new Map<string, number>();
  const prune = (now: number) => {
    for (const [key, at] of seen) {
      if (now - at >= windowMs) seen.delete(key);
    }
  };
  return {
    isBlocked(id, now = Date.now()) {
      prune(now);
      return seen.has(id);
    },
    mark(id, now = Date.now()) {
      seen.set(id, now);
    },
    clear(id) {
      seen.delete(id);
    },
  };
}

/**
 * 停止重複任務（每日、每週、隨時挑戰）與恢復（docs/wording-review.md「停止的任務被當成『已完成』」）。
 *
 * 停止：任務從進行中搬到 archivedSubTasks，不再出現在清單。完成紀錄、完成次數、抽卡券都不動。
 * 存的資料格式和改版前「終止並歸檔」相同（completed: true、completedAt），舊版程式和成就、維度的算法照舊；
 * 另外多記 stoppedAt（停止的時間）。
 *
 * 怎麼分辨「停止的」和「真的完成的」：重複任務只有兩種情況會進 archivedSubTasks——
 * 停止（這裡），以及跟著計畫一起收起來（domain/plans.ts 的 archivePlan，會帶 archivedWithPlanId）。
 * 完成重複任務只會加次數，不會歸檔。所以 archivedSubTasks 裡的重複任務沒有 archivedWithPlanId，就是停止的；
 * 改版前停止的舊資料沒有 stoppedAt，也照這個規則認得出來。
 */
const STOPPABLE_TYPES: readonly (TaskType | undefined)[] = ['daily', 'weekly', 'infinite'];

/** 可以「停止」的任務類型（每日、每週、隨時挑戰） */
export function canStopTask(task: Pick<SubTask, 'type'> | null | undefined): boolean {
  return STOPPABLE_TYPES.includes(task?.type);
}

/** archivedSubTasks 裡的這個任務是不是「停止」的（不是真的完成，也不是跟著計畫收起來的） */
export function isStoppedTask(archivedTask: Pick<ArchivedSubTask, 'type' | 'archivedWithPlanId'> | null | undefined): boolean {
  // canStopTask 對 null 回傳 false，所以 !!archivedTask 只是讓型別檢查知道它不是 null，結果不變
  return !!archivedTask && canStopTask(archivedTask) && !archivedTask.archivedWithPlanId;
}

/** 停止、恢復任務會改到的兩個清單 */
export interface TaskListChanges {
  subTasks: SubTask[];
  archivedSubTasks: ArchivedSubTask[];
}

/**
 * 停止進行中的任務 id。回傳要更新的 { subTasks, archivedSubTasks }；
 * 找不到、或不是可以停止的類型時回傳 null。原本是優先任務的，拿掉標記後剩下的優先任務重新編號。
 */
export function stopSubTask(
  data: Partial<Pick<LifeSyncData, 'subTasks' | 'archivedSubTasks'>> | null | undefined,
  id: string,
  nowIso: string = new Date().toISOString(),
): TaskListChanges | null {
  const subTasks = data?.subTasks || [];
  const task = subTasks.find(t => t.id === id);
  if (!task || !canStopTask(task)) return null;
  const remaining = (task.isPriority ? renumberPriorityTasks(subTasks, id) : subTasks).filter(t => t.id !== id);
  return {
    subTasks: remaining,
    archivedSubTasks: [
      ...(data?.archivedSubTasks || []),
      { ...task, completed: true, completedAt: nowIso, stoppedAt: nowIso, isPriority: false, priorityOrder: 0 },
    ],
  };
}

/**
 * 恢復停止的任務 id：放回進行中的清單（保留原本的排序位置 sortOrder，不是優先任務）。
 * 完成紀錄、完成次數、抽卡券都不動。回傳要更新的 { subTasks, archivedSubTasks }；以下情況回傳 null：
 * - 找不到，或不是停止的任務（真的完成的一次性任務請用撤銷完成；跟著計畫收起來的請恢復計畫）
 * - 它的計畫已經完成：要先恢復計畫，否則任務會掛在看不到的計畫底下
 * - 進行中已經有同一個 id（不正常的舊資料），避免變成兩份
 */
export function restoreStoppedSubTask(
  data: Partial<Pick<LifeSyncData, 'subTasks' | 'archivedSubTasks' | 'archivedTasks'>> | null | undefined,
  id: string,
): TaskListChanges | null {
  const archivedSubTasks = data?.archivedSubTasks || [];
  const task = archivedSubTasks.find(t => t.id === id);
  if (!task || !isStoppedTask(task)) return null;
  const subTasks = data?.subTasks || [];
  if (subTasks.some(t => t.id === id)) return null;
  if (task.majorTaskId && (data?.archivedTasks || []).some(m => m.id === task.majorTaskId)) return null;
  // 清掉停止時加上的欄位（completedAt 是停止的時間，進行中的重複任務不該有）
  const { stoppedAt: _stoppedAt, completedAt: _completedAt, ...rest } = task;
  return {
    subTasks: [...subTasks, { ...rest, completed: false, isPriority: false, priorityOrder: 0 }],
    archivedSubTasks: archivedSubTasks.filter(t => t.id !== id),
  };
}
