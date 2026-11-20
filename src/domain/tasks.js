/**
 * 任務規則（純函式）
 */
import { localDateOf, localDateFromLocalStampedIso } from './dates.js';

const isRepeating = (task) => task?.type === 'daily' || task?.type === 'weekly';

/** 每日／每週任務今天（本地日期 todayStr）是否已完成。lastCompletedAt 是「本地時間標 Z」格式 */
export function isCompletedOnDate(task, todayStr) {
  if (!task?.lastCompletedAt || !todayStr) return false;
  return localDateFromLocalStampedIso(task.lastCompletedAt) === todayStr;
}

/** 每週任務今天（weekday：0 = 星期日）是不是指定的日子 */
export function isScheduledWeekday(task, weekday) {
  if (task?.type !== 'weekly') return true;
  return Array.isArray(task.days) && task.days.includes(weekday);
}

/**
 * 重排優先順序：把優先任務依原本的 priorityOrder 排好，重新編成 1..n。
 * - 非優先任務原樣保留。
 * - removedTaskId 指定的任務不計入編號，本身也原樣保留（由呼叫端決定要不要移除它）。
 * - 回傳新陣列，任務的先後位置不變；順序相同時維持原本在陣列中的先後。
 */
export function renumberPriorityTasks(subTasks, removedTaskId = null) {
  const ranked = subTasks
    .filter(t => t.isPriority && t.id !== removedTaskId)
    .sort((a, b) => a.priorityOrder - b.priorityOrder);
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
 * @param {Array} subTasks 進行中的子任務
 * @param {Date} [now] 現在時間（用來決定今天的本地日期與星期）
 */
export function computeActivePriorityTasks(subTasks, now = new Date()) {
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
    .sort((a, b) => a.priorityOrder - b.priorityOrder);
}
