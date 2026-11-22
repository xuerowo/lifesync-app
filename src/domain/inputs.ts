/**
 * 輸入檢查（純函式）
 * 輸入框的值可能是字串、數字或其他東西，所以「輸入框的值」參數都是 unknown。
 */
import type { Goal, IndicatorId, SubTask } from '../types/data.ts';

/** 輸入框的值 → 0 以上的整數（空白、負數、不是數字都變成 0；小數無條件捨去） */
export function toNonNegativeInt(raw: unknown): number {
  // parseInt 會先把參數轉成字串，所以傳什麼都可以（和原本的 JS 一樣）
  const n = parseInt(raw as string, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 次數欄位打字途中的草稿：只留數字（貼上「1,000」「 5 次」「５０」也只取數字），最多 6 位，
 * 避免一不小心多打出很大的數。
 */
export function sanitizeCountDraft(raw: unknown): string {
  // NFKC：全形數字「５０」先轉成半形「50」
  return String(raw ?? '').normalize('NFKC').replace(/\D/g, '').slice(0, 6);
}

/**
 * 次數欄位打完（離開欄位或按 Enter）時要存的值：至少 1 的整數。
 * 清空、只打 0 這類不合理的值，退回原本的次數，不會被改成別的數字。
 */
export function commitCountDraft(draft: unknown, previous: unknown): number {
  const n = parseInt(sanitizeCountDraft(draft), 10);
  if (Number.isFinite(n) && n >= 1) return n;
  return atLeast(previous, 1);
}

/** 輸入框的值 → 0 以上的數字（可以有小數；空白、負數、不是數字都變成 0） */
export function toNonNegativeNumber(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 數字至少為 min（不是數字時也回傳 min） */
export function atLeast(value: unknown, min: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : min;
}

/**
 * 每週任務切換某一天。至少要留一天：取消最後一天時不讓取消，原樣回傳。
 * 回傳的陣列由小到大排好（0 = 星期日）。
 */
export function toggleWeekDay(days: number[] | null | undefined, day: number): number[] {
  const current = Array.isArray(days) ? days : [];
  if (current.includes(day)) {
    if (current.length <= 1) return current;
    return current.filter(d => d !== day);
  }
  return [...current, day].sort((a, b) => a - b);
}

/**
 * 子任務存檔前的檢查。回傳錯誤訊息；沒問題回傳 null。
 * 目前只檢查：一次性任務有設時間時，結束時間不能早於開始時間。
 * startDateTime、endDateTime 都是 'YYYY-MM-DDTHH:mm' 本地時間，直接比字串即可。
 */
export function validateSubTaskTimes(
  item: Pick<SubTask, 'type' | 'noTime' | 'startDateTime' | 'endDateTime'> | null | undefined,
): string | null {
  if (!item || item.type !== 'precise' || item.noTime) return null;
  const { startDateTime, endDateTime } = item;
  if (startDateTime && endDateTime && endDateTime < startDateTime) {
    return '結束時間不能早於開始時間';
  }
  return null;
}

/** 某個維度的第一個目標 id；沒有目標時回傳空字串 */
export function firstGoalId(
  goals: Partial<Record<IndicatorId, Goal[]>> | null | undefined,
  indicatorId: IndicatorId,
): string {
  const list = goals?.[indicatorId];
  return Array.isArray(list) && list.length > 0 ? list[0].id : '';
}
