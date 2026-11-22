import { WEEK_DAYS } from '../constants/index.tsx';
import { parseLocalDate } from '../domain/dates.ts';
import { RANGE_SEP, formatDisplayDate } from './displayFormat.ts';
import type { PomodoroEvent, PomodoroEventType, SubTask } from '../types/data.ts';

export const generateTeethPath = (width: number, height: number, teethHeight: number, isTop: boolean): string => {
  const teethCount = 20;
  const toothWidth = width / teethCount;
  let path = '';
  if (isTop) {
    path = `M0,0 L${width},0 L${width},${height - teethHeight} `;
    for (let i = 0; i < teethCount; i++) {
      const x = width - (i * toothWidth);
      path += `L${x - (toothWidth / 2)},${height} L${x - toothWidth},${height - teethHeight} `;
    }
    path += 'Z';
  } else {
    path = `M0,${height} L0,0 `;
    for (let i = 0; i < teethCount; i++) {
      const x = i * toothWidth;
      path += `L${x + (toothWidth / 2)},${teethHeight} L${x + toothWidth},0 `;
    }
    path += `L${width},${height} Z`;
  }
  return path;
};

export const getDateStr = (date: Date = new Date()): string => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

export const getTodayStr = (): string => getDateStr(new Date());

export const getLocalISOString = (date: Date = new Date()): string => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString();
};

export const formatForDateTimeLocal = (isoStr: string | null | undefined): string => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
};

// 只有日期的字串（計畫的 startDate、endDate：'YYYY-MM-DD'）→ 2026/11/22；看不懂就原樣顯示
export const formatDateOnly = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  return formatDisplayDate(parseLocalDate(dateStr)) || String(dateStr);
};

// 本地時間字串（一次性任務的 startDateTime：'YYYY-MM-DDTHH:mm'，沒有時區）→ 2026/11/22 14:05。
// 直接拆字串，不經過 Date，避免被當成 UTC 換算時區（和改版前切字串的解讀相同）
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;
const splitLocalDateTime = (str: unknown): { date: string; time: string } | null => {
  const m = typeof str === 'string' ? LOCAL_DATE_TIME.exec(str) : null;
  return m ? { date: `${m[1]}/${m[2]}/${m[3]}`, time: `${m[4]}:${m[5]}` } : null;
};

const preciseRange = (startStr: string | undefined, endStr: string | undefined): string => {
  const start = splitLocalDateTime(startStr);
  const end = splitLocalDateTime(endStr);
  const startText = start ? `${start.date} ${start.time}` : (startStr || '');
  if (!endStr) return startText;
  if (!end) return `${startText}${RANGE_SEP}${endStr}`;
  // 同一天結束：後面只寫時間，例如「2026/11/22 14:00～15:00」
  const endText = start && start.date === end.date ? end.time : `${end.date} ${end.time}`;
  return `${startText}${RANGE_SEP}${endText}`;
};

/** formatTaskTime 用得到的任務欄位 */
type TaskTimeFields = Pick<SubTask, 'type' | 'startTime' | 'endTime' | 'noTime' | 'days' | 'startDateTime' | 'endDateTime'>;

// 類型不是這四種（照理不會有）時顯示「今日行動」，保留原本的寫法
export const formatTaskTime = (task: TaskTimeFields, isCompact: boolean = false): string => {
  const timeRange = `${task.startTime}${RANGE_SEP}${task.endTime}`;
  if (task.type === 'daily') {
    if (task.noTime) return isCompact ? '' : '每日（不限時間）';
    return isCompact ? timeRange : `每日 ${timeRange}`;
  }
  if (task.type === 'weekly') {
    const daysStr = (task.days || []).map(d => WEEK_DAYS[d]).join('、');
    if (task.noTime) return isCompact ? '' : `每週${daysStr}（不限時間）`;
    return isCompact ? timeRange : `每週${daysStr} ${timeRange}`;
  }
  if (task.type === 'precise') {
    if (task.noTime) return isCompact ? '' : '不限時間';
    return preciseRange(task.startDateTime, task.endDateTime);
  }
  if (task.type === 'infinite') {
    return isCompact ? '' : '隨時挑戰';
  }
  return '今日行動';
};

export const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const formatFlowTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/** 時間軸上的一段（兩個相鄰事件之間） */
export interface PomodoroSegment {
  /** 秒數 */
  duration: number;
  mode: 'focus' | 'flow' | 'break' | 'await';
  isPaused: boolean;
  /** 這一段開頭的事件 */
  type: PomodoroEventType;
  startTime: string;
  endTime: string;
}

/** calculatePomodoroStats 的結果（秒數） */
export interface PomodoroStats {
  focusDuration: number;
  flowDuration: number;
  breakDuration: number;
  segments: PomodoroSegment[];
}

export const calculatePomodoroStats = (timeline: readonly PomodoroEvent[] | null | undefined): PomodoroStats => {
  let focusDuration = 0;
  let flowDuration = 0;
  let breakDuration = 0;
  const segments: PomodoroSegment[] = [];

  if (!timeline || timeline.length < 2) {
    return { focusDuration, flowDuration, breakDuration, segments };
  }

  let currentMode: PomodoroSegment['mode'] = 'focus'; // 預設模式
  let isPaused = false;

  for (let i = 0; i < timeline.length - 1; i++) {
    const startEvent = timeline[i];
    const endEvent = timeline[i + 1];
    const startTime = new Date(startEvent.time);
    const endTime = new Date(endEvent.time);
    // getTime() 和直接相減（Date 會先轉成毫秒）的結果相同
    const duration = Math.max(0, (endTime.getTime() - startTime.getTime()) / 1000);

    // 根據段落起始事件更新狀態
    // 進入新階段一定代表已解除暫停（舊紀錄在暫停中切換階段時沒有寫 pause_end）
    if (startEvent.type === 'focus_start') {
      currentMode = 'focus';
      isPaused = false;
    } else if (startEvent.type === 'flow_start') {
      currentMode = 'flow';
      isPaused = false;
    } else if (startEvent.type === 'break_start') {
      currentMode = 'break';
      isPaused = false;
    } else if (startEvent.type === 'await_start') {
      // 時間到、等使用者按「開始休息／開始專注」：等待的時間不算專注也不算休息（2026-11-20 起）
      currentMode = 'await';
      isPaused = false;
    } else if (startEvent.type === 'pause_start') {
      isPaused = true;
    } else if (startEvent.type === 'pause_end') {
      isPaused = false;
    }
    // task_complete 或其他事件不改變模式與暫停狀態

    if (duration > 0) {
      if (!isPaused) {
        if (currentMode === 'focus') focusDuration += duration;
        else if (currentMode === 'flow') flowDuration += duration;
        else if (currentMode === 'break') breakDuration += duration;
      }

      segments.push({
        duration,
        mode: currentMode,
        isPaused,
        type: startEvent.type,
        startTime: startEvent.time,
        endTime: endEvent.time
      });
    }
  }

  return { focusDuration, flowDuration, breakDuration, segments };
};

/**
 * 一輪番茄鐘的「純專注」秒數（專注 + 心流，四捨五入到整秒）。
 * 總結畫面、專注歷史、結算畫面的專注時長和時間給的抽卡券，都用這一個數字，才不會互相對不上。
 */
export const pomodoroWorkSeconds = (timeline: readonly PomodoroEvent[] | null | undefined): number => {
  const { focusDuration, flowDuration } = calculatePomodoroStats(timeline);
  return Math.round((focusDuration || 0) + (flowDuration || 0));
};
