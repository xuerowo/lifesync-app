/**
 * 任務歷史（taskHistory）的刪除與補登，以及它們對任務「完成次數」的影響（純函式，Q18）。
 *
 * 規則：
 * - 只有每日、每週、隨時挑戰任務有完成次數（completionCount），成就和維度進度就是用它算的。
 *   一次性任務沒有完成次數，刪除或補登它的紀錄不改任何任務。
 * - 刪除一筆紀錄：它對應的任務完成次數減 1，最少到 0。
 * - 補登一筆紀錄並選了對應的任務：那個任務的完成次數加 1。
 * - 進行中和「已完成」區的任務都算。舊資料裡同一個 id 同時在兩邊時，只改進行中那一份
 *   （和 AppDataContext.revertTaskCompletion 的做法一樣）。
 * - 刪除紀錄不扣抽卡券、補登不發抽卡券（和改版前一樣）。補登的紀錄記成 0 張券，
 *   之後撤銷或刪除任務時才不會扣到一張其實沒拿到的券。
 * - 不改 lastCompletedAt：刪掉今天的紀錄，任務仍顯示「今日已完成」；要撤銷今天的完成，用任務上的撤銷按鈕。
 * - 已經對不上的舊資料（完成次數比紀錄多）不會被自動修正。
 */

import { completionRewardTickets } from './tasks.ts';
import type { ArchivedSubTask, LifeSyncData, MajorTask, SubTask, TaskHistoryRecord, TaskType } from '../types/data.ts';

const COUNTED_TYPES: readonly (TaskType | undefined)[] = ['daily', 'weekly', 'infinite'];

/** 這個任務有沒有完成次數 */
export const hasCompletionCount = (task: Pick<SubTask, 'type'> | null | undefined): boolean => COUNTED_TYPES.includes(task?.type);

/** 任務歷史相關函式需要的資料（沒有的清單當作空的） */
export type HistoryData = Partial<Pick<LifeSyncData, 'subTasks' | 'archivedSubTasks' | 'taskHistory'>>;

/** 任務在哪個清單：進行中，或「已結束」區 */
export type TaskListName = 'subTasks' | 'archivedSubTasks';

/** 某個任務完成次數的變化 */
export interface CompletionCountChange {
  taskId: string;
  list: TaskListName;
  task: SubTask | ArchivedSubTask;
  from: number;
  to: number;
}

/** 刪除、補登紀錄後要更新的清單 */
export interface HistoryChanges {
  taskHistory: TaskHistoryRecord[];
  subTasks: SubTask[];
  archivedSubTasks: ArchivedSubTask[];
}

/** 紀錄對應的、有完成次數的任務：先找進行中，沒有才找「已完成」區。找不到回傳 null */
function findCountedTask(
  data: HistoryData | null | undefined,
  taskId: string | undefined,
): { list: TaskListName; task: SubTask | ArchivedSubTask } | null {
  if (!taskId) return null;
  const active = (data?.subTasks || []).find((t) => t.id === taskId);
  if (active) return hasCompletionCount(active) ? { list: 'subTasks', task: active } : null;
  const archived = (data?.archivedSubTasks || []).find((t) => t.id === taskId);
  return archived && hasCompletionCount(archived) ? { list: 'archivedSubTasks', task: archived } : null;
}

const countOf = (task: Pick<SubTask, 'completionCount'> | null | undefined) => {
  const n = Number(task?.completionCount);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

/**
 * 這些紀錄被刪除（delta = -1）或補登（delta = +1）時，各任務完成次數的變化。
 * 回傳 [{ taskId, list, task, from, to }]，依紀錄出現的順序；次數最少到 0。
 * 沒對應到有完成次數的任務的紀錄不列入。
 */
export function completionCountChanges(
  data: HistoryData | null | undefined,
  records: readonly (Pick<TaskHistoryRecord, 'taskId'> | null | undefined)[] | null | undefined,
  delta: number,
): CompletionCountChange[] {
  const byTask = new Map<string, { taskId: string; list: TaskListName; task: SubTask | ArchivedSubTask; times: number }>();
  for (const record of Array.isArray(records) ? records : []) {
    const found = findCountedTask(data, record?.taskId);
    if (!found) continue;
    const entry = byTask.get(found.task.id) || { taskId: found.task.id, list: found.list, task: found.task, times: 0 };
    entry.times += 1;
    byTask.set(found.task.id, entry);
  }
  return [...byTask.values()].map(({ times, ...rest }) => {
    const from = countOf(rest.task);
    return { ...rest, from, to: Math.max(0, from + delta * times) };
  });
}

/** 把 completionCountChanges 的結果套用到任務清單，回傳 { subTasks, archivedSubTasks } */
function applyCountChanges(
  data: HistoryData | null | undefined,
  changes: CompletionCountChange[],
): Pick<HistoryChanges, 'subTasks' | 'archivedSubTasks'> {
  const apply = <T extends SubTask>(list: T[], name: TaskListName): T[] => {
    const targets = new Map(changes.filter((c) => c.list === name).map((c) => [c.taskId, c.to]));
    if (targets.size === 0) return list;
    return list.map((t) => (targets.has(t.id) ? { ...t, completionCount: targets.get(t.id) } : t));
  };
  return {
    subTasks: apply(data?.subTasks || [], 'subTasks'),
    archivedSubTasks: apply(data?.archivedSubTasks || [], 'archivedSubTasks'),
  };
}

/** 刪除任務歷史裡的這些紀錄（recordIds 是紀錄自己的 id），對應任務的完成次數跟著減少 */
export function deleteHistoryRecords(data: HistoryData | null | undefined, recordIds: readonly string[]): HistoryChanges {
  const ids = new Set(recordIds);
  const history = data?.taskHistory || [];
  const removed = history.filter((h) => ids.has(h?.id));
  const changes = completionCountChanges(data, removed, -1);
  return {
    taskHistory: history.filter((h) => !ids.has(h?.id)),
    ...applyCountChanges(data, changes),
  };
}

// completedAt 沒有時，new Date(undefined) 是無效日期，算出 NaN（和原本的 JS 一樣）
const timeOf = (record: Pick<TaskHistoryRecord, 'completedAt'> | null | undefined) =>
  new Date(record?.completedAt as string).getTime();

/**
 * 補登一筆紀錄。紀錄依完成時間插在正確的位置（任務歷史是新的在前），
 * 這樣「撤銷最近一次完成」才會撤到真正最新的那一筆，而不是剛補登的舊紀錄。
 * 有對應的任務時，那個任務的完成次數加 1。
 */
export function addHistoryRecord(data: HistoryData | null | undefined, record: TaskHistoryRecord): HistoryChanges {
  const history = data?.taskHistory || [];
  const time = timeOf(record);
  let index = history.findIndex((h) => timeOf(h) < time);
  if (index === -1) index = history.length;
  const changes = completionCountChanges(data, [record], 1);
  return {
    taskHistory: [...history.slice(0, index), record, ...history.slice(index)],
    ...applyCountChanges(data, changes),
  };
}

/** linkableHistoryTasks 列出的一個選項 */
export interface LinkableHistoryTask {
  task: SubTask | ArchivedSubTask;
  /** 所屬計畫的名稱；找不到計畫時是「獨立任務」 */
  planTitle: string;
  /** 在「已結束」區 */
  archived: boolean;
}

/**
 * 補登時可以選的任務：有完成次數的任務，進行中的在前、「已完成」區的在後（同一個 id 只列一次）。
 * 回傳 [{ task, planTitle, archived }]。
 */
export function linkableHistoryTasks(
  data: Partial<Pick<LifeSyncData, 'majorTasks' | 'archivedTasks' | 'subTasks' | 'archivedSubTasks'>> | null | undefined,
): LinkableHistoryTask[] {
  const plans: MajorTask[] = [...(data?.majorTasks || []), ...(data?.archivedTasks || [])];
  const planTitleOf = (task: SubTask) => plans.find((m) => m.id === task.majorTaskId)?.title || '獨立任務';
  const seen = new Set<string>();
  const result: LinkableHistoryTask[] = [];
  const lists: [SubTask[], boolean][] = [[data?.subTasks || [], false], [data?.archivedSubTasks || [], true]];
  for (const [list, archived] of lists) {
    for (const task of list) {
      if (!hasCompletionCount(task) || seen.has(task.id)) continue;
      seen.add(task.id);
      result.push({ task, planTitle: planTitleOf(task), archived });
    }
  }
  return result;
}

/** 補登時選了任務：紀錄的名稱、計畫、維度、類型都跟著那個任務（和真正完成時記下的欄位相同） */
export function historyFieldsFromTask(
  task: SubTask,
  planTitle?: string | null,
): Required<Pick<TaskHistoryRecord, 'taskId' | 'title' | 'majorTaskTitle'>> & Pick<TaskHistoryRecord, 'indicatorId' | 'type'> {
  return {
    taskId: task.id,
    title: task.title || '（未命名任務）',
    majorTaskTitle: planTitle || '獨立任務',
    indicatorId: task.indicatorId,
    type: task.type,
  };
}

/**
 * 番茄鐘撤銷任務 taskId 的某一筆完成紀錄（recordId），但那個任務已經停止了（domain/tasks.ts 的 isStoppedTask）：
 * 刪掉那一筆紀錄、完成次數減 1，任務仍維持停止（不會被搬回清單）。
 * deductTickets 為 true 時扣回那筆紀錄記的券（最少到 0）；番茄鐘的券要結算才發，所以它傳 false。
 * 回傳要更新的 { taskHistory, subTasks, archivedSubTasks, lotteryTickets } 和 ticketsDeducted；
 * 找不到這個任務的這筆紀錄時回傳 null。
 */
export function revertStoppedTaskRecord(
  data: (HistoryData & Partial<Pick<LifeSyncData, 'lotteryTickets'>>) | null | undefined,
  taskId: string,
  recordId: string,
  deductTickets: boolean = false,
): (HistoryChanges & { lotteryTickets: number; ticketsDeducted: number }) | null {
  const record = (data?.taskHistory || []).find((h) => h?.id === recordId && h?.taskId === taskId);
  if (!record) return null;
  const ticketsDeducted = deductTickets ? completionRewardTickets(record) : 0;
  return {
    ...deleteHistoryRecords(data, [recordId]),
    lotteryTickets: Math.max(0, (data?.lotteryTickets || 0) - ticketsDeducted),
    ticketsDeducted,
  };
}
