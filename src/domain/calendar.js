/**
 * 日曆：判斷每個任務、每筆紀錄屬於哪一天（純函式）
 *
 * 各欄位的時間格式不同，分別用 dates.js 的對應函式換成本地日期，詳見 dates.js 開頭的說明。
 * offsetMinutes 只給測試用（模擬其他時區）；平常不給，就用本機時區。
 */
import {
  localDateFromDateOnly,
  localDateFromLocalDateTime,
  localDateFromUtcIso,
} from './dates.js';

/**
 * 任務在日曆上要顯示的日期範圍 { start, end }（本地日期 YYYY-MM-DD）。
 * - 回傳 null：這個任務不顯示在日曆上。
 * - start 或 end 是 null（資料缺欄位）：那一邊不設限，和改版前的行為一樣。
 */
export function getCalendarRange(task, major, todayStr, offsetMinutes) {
  const fromUtc = (iso) => localDateFromUtcIso(iso, offsetMinutes);
  const isArchived = !!(task.completed || major.completed);
  const completionDate = () => fromUtc(task.completedAt || major.completedAt);

  if (task.type === 'precise') {
    if (task.noTime) {
      // 不限時間的一次性任務：只在完成的那天顯示
      if (!isArchived) return null;
      const d = completionDate();
      return { start: d, end: d };
    }
    if (isArchived) {
      return {
        start: task.createdAt ? fromUtc(task.createdAt) : localDateFromLocalDateTime(task.startDateTime),
        end: completionDate() ?? todayStr,
      };
    }
    return {
      start: localDateFromLocalDateTime(task.startDateTime),
      end: localDateFromLocalDateTime(task.endDateTime || task.startDateTime),
    };
  }

  return {
    start: task.createdAt ? fromUtc(task.createdAt) : localDateFromDateOnly(major.startDate),
    end: isArchived ? (completionDate() ?? todayStr) : localDateFromDateOnly(major.endDate),
  };
}

/** dateStr 是否落在 range 內（null 的一邊不設限） */
export function isInRange(dateStr, range) {
  if (!range) return false;
  if (range.start && dateStr < range.start) return false;
  if (range.end && dateStr > range.end) return false;
  return true;
}

/**
 * 某一天（dateStr，星期 weekday：0 = 星期日）日曆上要顯示的任務，依開始時間排序。
 * data 需要 majorTasks、archivedTasks、subTasks、archivedSubTasks。
 */
export function getCalendarTasksForDay(data, dateStr, weekday, todayStr, offsetMinutes) {
  const allMajorTasks = [...(data.majorTasks || []), ...(data.archivedTasks || [])];
  const allSubTasks = [...(data.subTasks || []), ...(data.archivedSubTasks || [])];

  return allSubTasks
    .filter(task => {
      if (task.type === 'infinite') return false;
      const major = allMajorTasks.find(m => m.id === task.majorTaskId);
      if (!major) return false;
      if (!isInRange(dateStr, getCalendarRange(task, major, todayStr, offsetMinutes))) return false;
      if (task.type === 'weekly') return Array.isArray(task.days) && task.days.includes(weekday);
      return true;
    })
    .sort((a, b) => (a.startTime || a.startDateTime || '').localeCompare(b.startTime || b.startDateTime || ''));
}

/**
 * 任務在 dateStr 那天是否已完成（日曆上畫刪除線用）。
 * - 一次性任務：看它自己的 completedAt。
 * - 重複性任務：看那天有沒有完成紀錄（taskHistory 的 completedAt）。
 */
export function isDoneOnDate(task, taskHistory, dateStr, offsetMinutes) {
  if (task.type === 'precise') {
    return !!task.completed && localDateFromUtcIso(task.completedAt, offsetMinutes) === dateStr;
  }
  return (taskHistory || []).some(
    h => h.taskId === task.id && localDateFromUtcIso(h.completedAt, offsetMinutes) === dateStr
  );
}
