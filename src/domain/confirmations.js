/**
 * 會刪除或改動資料的操作，在執行前要給使用者看的確認文字（純函式）。
 *
 * 這裡計算的「會刪幾筆紀錄、扣幾張券」必須和 AppDataContext 裡實際執行的
 * deleteSubTask、deleteMajorTask、revertTaskCompletion、toggleMajorTask 一致；
 * 改了那邊的規則，這裡也要一起改（tests/confirmations.test.js 有對照）。
 */

const REPEATING_TYPES = ['daily', 'weekly', 'infinite'];
const isCounted = (task) => REPEATING_TYPES.includes(task?.type);

const nameOf = (item, fallback) => {
  const title = typeof item?.title === 'string' ? item.title.trim() : '';
  return title ? `「${title}」` : fallback;
};

/** 紀錄裡記的發券數；舊紀錄沒有這個欄位時當作 1 張（與刪除、撤銷時的算法相同） */
const ticketsOf = (record) => record?.rewardTickets ?? 1;

/** 抽卡券最多扣到 0，所以實際扣掉的張數不會超過目前持有的張數 */
export function actualTicketDeduction(ticketsToRecover, currentTickets) {
  const owned = Math.max(0, Number(currentTickets) || 0);
  return Math.min(Math.max(0, ticketsToRecover), owned);
}

/** 「並扣回 N 張抽卡券」這一段；張數被目前持有量限制時，說明實際只會扣多少 */
function ticketPhrase(ticketsToRecover, currentTickets) {
  if (ticketsToRecover <= 0) return '不會扣抽卡券';
  const actual = actualTicketDeduction(ticketsToRecover, currentTickets);
  if (actual < ticketsToRecover) {
    return `並扣回抽卡券：應扣 ${ticketsToRecover} 張，你目前只有 ${actual} 張，會扣到 0 張`;
  }
  return `並扣回 ${ticketsToRecover} 張抽卡券`;
}

/** 刪除這些任務時，會一起刪掉的完成紀錄筆數與要扣回的抽卡券（扣到 0 之前的張數） */
export function historyRemovalImpact(taskHistory, taskIds) {
  const ids = new Set(taskIds);
  const records = (Array.isArray(taskHistory) ? taskHistory : []).filter((h) => ids.has(h?.taskId));
  return {
    records: records.length,
    tickets: records.reduce((sum, h) => sum + ticketsOf(h), 0),
  };
}

const findSubTask = (data, id) =>
  (data?.subTasks || []).find((t) => t.id === id) || (data?.archivedSubTasks || []).find((t) => t.id === id);

/** 刪除單一任務（進行中或已完成的都一樣）的確認文字 */
export function deleteSubTaskMessage(data, id) {
  const task = findSubTask(data, id);
  const { records, tickets } = historyRemovalImpact(data?.taskHistory, [id]);
  const lines = [`確定要刪除任務${nameOf(task, '（未命名任務）')}嗎？`, ''];
  if (records > 0) {
    lines.push(`會一起刪除它的 ${records} 筆完成紀錄，${ticketPhrase(tickets, data?.lotteryTickets)}。`);
  } else {
    lines.push('這個任務沒有完成紀錄，不會扣抽卡券。');
  }
  lines.push('刪除後無法復原。');
  return lines.join('\n');
}

/** 刪除整個計畫（進行中或已完成的計畫都一樣）的確認文字 */
export function deleteMajorTaskMessage(data, id) {
  const major =
    (data?.majorTasks || []).find((t) => t.id === id) || (data?.archivedTasks || []).find((t) => t.id === id);
  const subIds = [
    ...(data?.subTasks || []).filter((s) => s.majorTaskId === id),
    ...(data?.archivedSubTasks || []).filter((s) => s.majorTaskId === id),
  ].map((s) => s.id);
  const { records, tickets } = historyRemovalImpact(data?.taskHistory, subIds);
  const lines = [`確定要刪除計畫${nameOf(major, '（未命名計畫）')}嗎？`, ''];
  if (subIds.length === 0) {
    lines.push('這個計畫裡沒有任務。');
  } else if (records > 0) {
    lines.push(
      `會一起刪除裡面的 ${subIds.length} 個任務和 ${records} 筆完成紀錄，${ticketPhrase(tickets, data?.lotteryTickets)}。`
    );
  } else {
    lines.push(`會一起刪除裡面的 ${subIds.length} 個任務。這些任務沒有完成紀錄，不會扣抽卡券。`);
  }
  lines.push('刪除後無法復原。');
  return lines.join('\n');
}

/**
 * 「撤銷最近一次完成」會造成的變化，算法與 AppDataContext.revertTaskCompletion 相同：
 * - 已歸檔的每日／每週任務：只搬回進行中，不刪紀錄、不扣券
 * - 其他情況：刪掉這個任務最新的一筆完成紀錄，扣回那筆紀錄記的券
 * - 進行中的每日／每週／隨時挑戰任務：完成次數減 1
 * - 已歸檔的任務：搬回進行中
 */
export function revertCompletionImpact(data, id) {
  const archived = (data?.archivedSubTasks || []).find((t) => t.id === id);
  const active = (data?.subTasks || []).find((t) => t.id === id);
  const task = archived || active || null;
  const isRestoringRepetitive = !!archived && (archived.type === 'daily' || archived.type === 'weekly');
  const record = isRestoringRepetitive ? null : (data?.taskHistory || []).find((h) => h?.taskId === id) || null;
  const countChange =
    !archived && active && isCounted(active)
      ? { from: active.completionCount || 0, to: Math.max(0, (active.completionCount || 0) - 1) }
      : null;
  return {
    task,
    records: record ? 1 : 0,
    tickets: record ? ticketsOf(record) : 0,
    movesBackToActive: !!archived,
    countChange,
  };
}

/** 撤銷最近一次完成的確認文字 */
export function revertCompletionMessage(data, id) {
  const { task, records, tickets, movesBackToActive, countChange } = revertCompletionImpact(data, id);
  const lines = [`確定要撤銷${nameOf(task, '這個任務')}最近一次的完成嗎？`, ''];
  if (records > 0) {
    lines.push(`會刪除 1 筆完成紀錄，${ticketPhrase(tickets, data?.lotteryTickets)}。`);
  } else {
    lines.push('完成紀錄和抽卡券都不會變動。');
  }
  if (countChange && countChange.from !== countChange.to) {
    lines.push(`完成次數會從 ${countChange.from} 次變成 ${countChange.to} 次。`);
  }
  if (movesBackToActive) {
    lines.push('這個任務會回到進行中。');
  }
  return lines.join('\n');
}

/** 「完成整個計畫」的確認文字（不刪紀錄、不扣券，但進行中的任務會一起歸檔） */
export function completeMajorTaskMessage(data, id) {
  const major = (data?.majorTasks || []).find((t) => t.id === id);
  const activeSubs = (data?.subTasks || []).filter((s) => s.majorTaskId === id);
  const lines = [`確定要完成整個計畫${nameOf(major, '（未命名計畫）')}嗎？`, ''];
  if (activeSubs.length > 0) {
    lines.push(`計畫裡還在進行中的 ${activeSubs.length} 個任務會一起歸檔，之後不能再勾選完成（每日、每週任務也會停止）。`);
  }
  lines.push('不會刪除任何完成紀錄，也不會扣抽卡券。');
  lines.push('之後按「恢復計畫」只會拿回計畫本身，任務會留在「已完成」區，要一個一個撤銷才會回到進行中。');
  return lines.join('\n');
}

/**
 * 刪除目標的確認文字。用到這個目標的計畫會保留，只是不再顯示目標名稱。
 * 已達成（歸檔）的目標本來就不會顯示在計畫上，所以不提計畫。
 */
export function deleteGoalMessage(data, goal, { archived = false } = {}) {
  const lines = [`確定要刪除${archived ? '已達成的' : ''}目標${nameOf(goal, '（未命名目標）')}嗎？`, ''];
  const goalId = goal?.id;
  const plans = goalId && !archived
    ? [...(data?.majorTasks || []), ...(data?.archivedTasks || [])].filter((t) => t.goalId === goalId).length
    : 0;
  if (plans > 0) {
    lines.push(`有 ${plans} 個計畫屬於這個目標。計畫和任務都會保留，只是不再顯示目標名稱。`);
  }
  lines.push('刪除後無法復原。');
  return lines.join('\n');
}

/** 刪除成就的確認文字 */
export function deleteAchievementMessage(achievement) {
  const lines = [`確定要刪除成就${nameOf(achievement, '（未命名成就）')}嗎？`, ''];
  if (achievement?.claimed) {
    lines.push('這個成就已經領取過，刪除後領取狀態也會一起消失。');
  }
  lines.push('完成紀錄和抽卡券不受影響。刪除後無法復原。');
  return lines.join('\n');
}

/** 刪除守則的確認文字；內容是空的守則沒有東西會遺失，回傳 null 表示不必確認 */
export function deleteRuleMessage(rule) {
  const content = typeof rule?.content === 'string' ? rule.content.trim() : '';
  if (!content) return null;
  const preview = content.length > 30 ? `${content.slice(0, 30)}…` : content;
  return `確定要刪除這條守則嗎？\n\n「${preview}」\n\n刪除後無法復原。`;
}

/** 筆記編輯器裡的內容和打開時相比，是否有還沒存的修改 */
export function hasUnsavedNoteChanges(original, current) {
  const norm = (v) => (typeof v === 'string' ? v : '');
  return norm(original?.title) !== norm(current?.title) || norm(original?.content) !== norm(current?.content);
}

export const DISCARD_NOTE_MESSAGE = '這篇筆記有還沒保存的修改，確定要放棄這些修改並關閉嗎？';
