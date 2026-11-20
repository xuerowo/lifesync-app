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

/**
 * 完成之後還要不要保留「優先」標記（Q11）。
 * - 每日、每週任務：保留。今天完成後，computeActivePriorityTasks 會在今天剩下的時間跳過它；
 *   明天（每週任務是下一個指定的日子）它又會排回原本的順位。
 * - 一次性任務：拿掉（它已經歸檔，不會再做）。
 * - 隨時挑戰任務本來就不能設成優先；舊資料萬一有，也照一次性任務的規則拿掉，
 *   否則它永遠不算「今天已完成」，會一直擋住其他任務。
 */
export function keepsPriorityAfterCompletion(task) {
  return isRepeating(task);
}

/**
 * 完成任務 taskId 之後的子任務清單（只處理優先標記，不處理完成次數與歸檔）。
 * 要拿掉優先標記時，拿掉後把剩下的優先任務重新編成 1..n；要保留時原樣回傳。
 */
export function priorityAfterCompletion(subTasks, taskId) {
  const task = subTasks.find(t => t.id === taskId);
  if (!task?.isPriority || keepsPriorityAfterCompletion(task)) return subTasks;
  const withoutMark = subTasks.map(t => (t.id === taskId ? { ...t, isPriority: false, priorityOrder: 0 } : t));
  return renumberPriorityTasks(withoutMark);
}

/** 一次性任務：不是每日、每週、隨時挑戰的任務 */
export function isOneTimeTask(task) {
  return !!task && task.type !== 'daily' && task.type !== 'weekly' && task.type !== 'infinite';
}

/**
 * 完成紀錄要記下的發券數：呼叫端指定的張數優先（番茄鐘固定 1 張），否則用任務設定的張數，都沒有就是 1 張。
 * 舊資料裡可能有負數（以前沒有檢查輸入），一律當成 0：
 * 完成時本來就不會發負數張券，紀錄若記成負數，之後撤銷或刪除反而會「加」券。
 * @param {{ rewardTickets?: number }} task
 * @param {{ rewardTickets?: number }} [options]
 * @returns {number}
 */
export function completionRewardTickets(task, options = {}) {
  const raw = Number(options?.rewardTickets ?? task?.rewardTickets ?? 1);
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

/**
 * 防連點：記住「剛處理過的 id」，windowMs 毫秒內同一個 id 再來就擋下。
 * 用法：guard.isBlocked(id) 為 true 就忽略；處理後呼叫 guard.mark(id)；
 * 撤銷之後要能馬上再處理同一個 id 時，呼叫 guard.clear(id)。
 * now 參數方便測試，平常不用給。
 */
export function createRecentGuard(windowMs) {
  const seen = new Map();
  const prune = (now) => {
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
