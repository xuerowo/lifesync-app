// 番茄鐘的階段轉換規則（純函式，不碰 React 狀態，方便測試）

import type { LifeSyncData, PomodoroEvent, PomodoroEventType, PomodoroSessionTask, SubTask, TaskHistoryRecord } from '../types/data.ts';

/** 番茄鐘的狀態：待機、專注、心流（不倒數）、休息 */
export type PomodoroStatus = 'idle' | 'focus' | 'flow' | 'break';

/** 番茄鐘設定（分鐘數；存在 localStorage 的 pomodoroSettings） */
export interface PomodoroSettings {
  /** 專注幾分鐘 */
  focus: number;
  /** 休息幾分鐘 */
  break: number;
  /** 要不要長休息 */
  longBreakEnabled: boolean;
  /** 長休息幾分鐘 */
  longBreakMinutes: number;
  /** 每幾個番茄一次長休息 */
  longBreakEvery: number;
}

/** 數值範圍 */
interface Range {
  min: number;
  max: number;
}

// ---------------------------------------------------------------------------
// 設定（存在 localStorage 的 pomodoroSettings）
// ---------------------------------------------------------------------------

// 各項分鐘數的可選範圍，和設定畫面的拉桿相同
export const POMODORO_RANGES: Record<'focus' | 'break' | 'longBreakMinutes' | 'longBreakEvery', Range> = {
  focus: { min: 5, max: 90 },
  break: { min: 1, max: 30 },
  // 長休息也是休息，用和「休息時間」一樣的範圍
  longBreakMinutes: { min: 1, max: 30 },
  // 每幾個番茄一次長休息：至少 2（每 1 個就長休息，等於把休息時間調長）
  longBreakEvery: { min: 2, max: 10 },
};

// 2026-11-20 之前沒有長休息設定，寫死「休息設定 <= 10 分鐘時，每 4 個番茄休息 20 分鐘」。
// 舊設定沒有這幾個欄位時，照舊規則換算成設定值；存回去之後就以設定為準，不再看休息是不是 <= 10 分鐘。
const LEGACY_LONG_BREAK_MAX_SETTING = 10;
const DEFAULT_LONG_BREAK_MINUTES = 20;
const DEFAULT_LONG_BREAK_EVERY = 4;

/** 轉成範圍內的整數；不是數字就用 fallback */
const clampInt = (value: unknown, { min, max }: Range, fallback: number): number => {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  const n = value === '' ? NaN : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/**
 * 整理番茄鐘設定：補上預設值、舊設定換算長休息、長休息的值一律是範圍內的整數。
 * 專注與休息時間只在不是數字時換成預設（維持舊行為，不改動已存的值）。
 * 傳入的其他欄位會原樣保留。
 * @param raw localStorage 讀出來的設定（可能是任何東西）
 */
export const normalizePomodoroSettings = (raw: unknown): PomodoroSettings & Record<string, unknown> => {
  // 只讀欄位，不改它；不是物件時改用空物件
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const pick = (key: string) => source[key];
  const focus = pick('focus');
  const breakMinutes = pick('break');
  const longBreakEnabled = pick('longBreakEnabled');
  const settings = { ...source } as Record<string, unknown> & PomodoroSettings; // 下面五行會把五個欄位都設好
  // Number.isFinite 只對「有限的數字」回傳 true，所以前面多一個 typeof 檢查不會改變結果
  settings.focus = typeof focus === 'number' && Number.isFinite(focus) ? focus : 25;
  settings.break = typeof breakMinutes === 'number' && Number.isFinite(breakMinutes) ? breakMinutes : 5;
  settings.longBreakEnabled = typeof longBreakEnabled === 'boolean'
    ? longBreakEnabled
    : settings.break <= LEGACY_LONG_BREAK_MAX_SETTING;
  settings.longBreakMinutes = clampInt(pick('longBreakMinutes'), POMODORO_RANGES.longBreakMinutes, DEFAULT_LONG_BREAK_MINUTES);
  settings.longBreakEvery = clampInt(pick('longBreakEvery'), POMODORO_RANGES.longBreakEvery, DEFAULT_LONG_BREAK_EVERY);
  return settings;
};

/**
 * 這次休息是不是長休息。
 * @param cycles 進入這次休息時「已完成」的番茄數
 */
export const isLongBreak = (cycles: number, settings: unknown): boolean => {
  const s = normalizePomodoroSettings(settings);
  return s.longBreakEnabled && cycles > 0 && cycles % s.longBreakEvery === 0;
};

/**
 * 進入休息時應倒數幾秒。
 * @param cycles 進入這次休息時「已完成」的番茄數
 * @param settings 分鐘數設定
 */
export const breakSecondsFor = (cycles: number, settings: Pick<PomodoroSettings, 'break'> & Partial<PomodoroSettings>): number => {
  if (isLongBreak(cycles, settings)) return normalizePomodoroSettings(settings).longBreakMinutes * 60;
  return settings.break * 60;
};

/**
 * 下一次休息的長度，以及是不是長休息（等待畫面的按鈕要寫「開始長休息（20 分鐘）」）。
 * @param cycles 進入這次休息時「已完成」的番茄數
 */
export const nextBreakInfo = (
  cycles: number,
  settings: Pick<PomodoroSettings, 'break'> & Partial<PomodoroSettings>,
): { seconds: number; isLong: boolean } => ({
  seconds: breakSecondsFor(cycles, settings),
  isLong: isLongBreak(cycles, settings),
});

/**
 * 「時間到」是否該被處理。已經在等使用者按「開始休息／開始專注」時（awaiting）不再處理。
 */
export const shouldHandleTimeout = ({
  timeLeft,
  status,
  isPaused,
  showSettlement,
  showSummary,
  awaiting = null,
}: {
  timeLeft: number;
  status: PomodoroStatus;
  isPaused: boolean;
  showSettlement: boolean;
  showSummary: boolean;
  /** 正在等使用者按繼續（awaitingOf 的結果，或任何 truthy 值） */
  awaiting?: unknown;
}): boolean =>
  timeLeft <= 0 &&
  status !== 'idle' &&
  status !== 'flow' &&
  !isPaused &&
  !awaiting &&
  !showSettlement &&
  !showSummary;

/**
 * 進入新階段（focus_start／break_start／flow_start）時要寫進時間軸的事件。
 * 如果當下正在暫停，先補一筆時間相同的 pause_end，讓時間軸上的暫停有頭有尾。
 */
export const phaseStartEvents = (
  type: PomodoroEventType,
  { isPaused, time }: { isPaused: boolean; time: string },
): PomodoroEvent[] => {
  const events: PomodoroEvent[] = [];
  if (isPaused) events.push({ type: 'pause_end', time });
  events.push({ type, time });
  return events;
};

/** nextPhaseOnTimeout 的結果 */
export interface NextPhase {
  status: 'break' | 'focus';
  /** 新階段倒數幾秒 */
  timeLeft: number;
  /** 完成的番茄數要加幾（專注到時 +1） */
  cyclesIncrement: number;
  /** 本輪工作時長要不要歸零 */
  resetCycleWorkDuration: boolean;
  timelineEvent: 'break_start' | 'focus_start';
}

/**
 * 倒數歸零後的下一個階段。
 * 回傳 null 表示這個狀態沒有「時間到」可言（idle、flow 等）。
 */
export const nextPhaseOnTimeout = ({
  status,
  cycles,
  settings,
}: {
  status: PomodoroStatus;
  cycles: number;
  settings: Pick<PomodoroSettings, 'focus' | 'break'> & Partial<PomodoroSettings>;
}): NextPhase | null => {
  if (status === 'focus') {
    const newCycles = cycles + 1;
    return {
      status: 'break',
      timeLeft: breakSecondsFor(newCycles, settings),
      cyclesIncrement: 1,
      resetCycleWorkDuration: true,
      timelineEvent: 'break_start',
    };
  }
  if (status === 'break') {
    return {
      status: 'focus',
      timeLeft: settings.focus * 60,
      cyclesIncrement: 0,
      resetCycleWorkDuration: false,
      timelineEvent: 'focus_start',
    };
  }
  return null;
};

// ---------------------------------------------------------------------------
// 目標任務
// ---------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');
const localDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * 番茄鐘可以選的目標任務：「成長」維度、還沒完成的任務；
 * 每日／每週任務排除今天已完成的，每週任務也排除今天不是指定星期的。
 * 開始前的選擇清單和進行中的「＋」用同一份規則。
 */
export const pomodoroCandidateTasks = <T extends SubTask>(subTasks: readonly T[] | null | undefined, now: Date = new Date()): T[] => {
  const todayStr = localDateStr(now);
  const weekday = now.getDay();
  return (Array.isArray(subTasks) ? subTasks : []).filter(t => {
    if (t.indicatorId !== 'growth') return false;
    // 排除已歸檔/已完成的一次性任務
    if (t.completed) return false;
    if (t.type === 'daily' || t.type === 'weekly') {
      const isTodayCompleted = typeof t.lastCompletedAt === 'string' && t.lastCompletedAt.startsWith(todayStr);
      const isWrongDay = t.type === 'weekly' && !(Array.isArray(t.days) && t.days.includes(weekday));
      return !isTodayCompleted && !isWrongDay;
    }
    return true;
  });
};

/** 進行中按「＋」時可以加入的任務：可選的任務中，還不在本次目標裡的 */
export const addableSessionTasks = <T extends SubTask>(
  subTasks: readonly T[] | null | undefined,
  // 只讀 id；傳進來的是本次的目標任務（PomodoroSessionTask）
  sessionTasks: readonly (Pick<SubTask, 'id'> & Partial<PomodoroSessionTask>)[] | null | undefined,
  now: Date = new Date(),
): T[] => {
  const inSession = new Set((Array.isArray(sessionTasks) ? sessionTasks : []).map(t => t.id));
  return pomodoroCandidateTasks(subTasks, now).filter(t => !inSession.has(t.id));
};

// ---------------------------------------------------------------------------
// 抽卡券
// ---------------------------------------------------------------------------

// 專注時間給券：每滿 50 分鐘多一階，第 n 階累計給 1+2+…+n 張；最多算到 300 分鐘（21 張）
const FOCUS_TICKET_STEP_SECONDS = 50 * 60;
const FOCUS_TICKET_CAP_SECONDS = 300 * 60;

/** 專注（專注 + 心流）累計 workSeconds 秒，可以拿幾張券 */
export const focusTicketsFor = (workSeconds: unknown): number => {
  const seconds = Number(workSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const n = Math.floor(Math.min(seconds, FOCUS_TICKET_CAP_SECONDS) / FOCUS_TICKET_STEP_SECONDS);
  return (n * (n + 1)) / 2;
};

// 舊版時間軸的 task_complete 沒有記下完成紀錄的 id，只能用「同一個任務、時間相差不到 10 秒」找回那筆紀錄
const LEGACY_RECORD_MATCH_MS = 10 * 1000;
// 舊版在番茄鐘完成的任務，完成紀錄固定記 1 張
const LEGACY_TASK_TICKETS = 1;

/** 結算時要給某一筆完成紀錄的券 */
export interface TicketGrant {
  /** 完成紀錄的 id */
  recordId: string;
  taskId: string | undefined;
  /** 要給幾張 */
  tickets: number;
}

/**
 * 這次番茄鐘裡完成的任務，結算時各要給幾張券。
 *
 * 規則（2026-11-20 起）：在番茄鐘裡完成任務，照任務自己設定的張數給，和在任務清單完成一樣；
 * 但券要到結算畫面按「領取」時才和時間的券一起給。在那之前，完成紀錄記的是 0 張（還沒給）。
 *
 * - 只算完成紀錄還在的：期間在任務清單撤銷或刪掉了，就不給（否則會白拿券）。
 * - 新版的 task_complete 事件帶有 recordId（完成紀錄的 id）和 rewardTickets（完成當下任務設定的張數）。
 * - 舊版的事件沒有這兩個欄位（升級時剛好有一輪番茄鐘還沒結算）：用任務 id 和時間找回紀錄，照舊版規則給 1 張。
 *
 * @param timeline 這次番茄鐘的時間軸
 * @param taskHistory 目前的完成紀錄
 */
export const pomodoroTaskTicketGrants = (
  timeline: readonly (PomodoroEvent | null | undefined)[] | null | undefined,
  taskHistory: readonly TaskHistoryRecord[] | null | undefined,
): TicketGrant[] => {
  const history = Array.isArray(taskHistory) ? taskHistory : [];
  const used = new Set<string>();
  const grants: TicketGrant[] = [];
  for (const event of Array.isArray(timeline) ? timeline : []) {
    if (event?.type !== 'task_complete') continue;
    let record: TaskHistoryRecord | null = null;
    if (event.recordId) {
      record = history.find(h => h.id === event.recordId && !used.has(h.id)) || null;
    } else {
      const eventMs = new Date(event.time).getTime();
      record = history.find(h =>
        h.taskId === event.taskId &&
        !used.has(h.id) &&
        Math.abs(new Date(h.completedAt).getTime() - eventMs) <= LEGACY_RECORD_MATCH_MS
      ) || null;
    }
    if (!record) continue;
    used.add(record.id);
    const raw = event.recordId ? Number(event.rewardTickets) : LEGACY_TASK_TICKETS;
    grants.push({
      recordId: record.id,
      taskId: record.taskId,
      tickets: Number.isFinite(raw) ? Math.max(0, raw) : 0,
    });
  }
  return grants;
};

/** 結算畫面要顯示、按「領取」時要給的券：時間的券 + 任務的券 */
export const pomodoroSettlementTickets = ({
  workSeconds,
  timeline,
  taskHistory,
}: {
  workSeconds: number;
  timeline: readonly (PomodoroEvent | null | undefined)[] | null | undefined;
  taskHistory: readonly TaskHistoryRecord[] | null | undefined;
}): { timeTickets: number; taskTickets: number; total: number; grants: TicketGrant[] } => {
  const timeTickets = focusTicketsFor(workSeconds);
  const grants = pomodoroTaskTicketGrants(timeline, taskHistory);
  const taskTickets = grants.reduce((sum, g) => sum + g.tickets, 0);
  return { timeTickets, taskTickets, total: timeTickets + taskTickets, grants };
};

/**
 * 結算：把這次番茄鐘的完成紀錄改成「實際給的張數」，領取時一併加券。
 * - claim 為 true（按「領取」）：完成紀錄記成任務的張數，抽卡券加上 timeTickets + 任務的券。
 * - claim 為 false（按「結束」不領）：完成紀錄一律記 0 張，之後撤銷或刪除才不會扣掉沒拿到的券。
 * grants 只能包含 data 裡還在的紀錄（由 pomodoroTaskTicketGrants 產生）；這裡會再檢查一次。
 * 回傳新的 data（不改動傳入的物件）
 */
export const settlePomodoroTickets = <D extends Partial<Pick<LifeSyncData, 'taskHistory' | 'lotteryTickets'>>>(
  data: D,
  { grants = [], timeTickets = 0, claim }: { grants?: readonly TicketGrant[]; timeTickets?: unknown; claim: boolean },
): D & Pick<LifeSyncData, 'taskHistory' | 'lotteryTickets'> => {
  const history = Array.isArray(data?.taskHistory) ? data.taskHistory : [];
  const byRecord = new Map(grants.map(g => [g.recordId, g.tickets]));
  let taskTickets = 0;
  const taskHistory = history.map(h => {
    if (!byRecord.has(h.id)) return h;
    // byRecord.has(h.id) 已經確認拿得到
    const tickets = claim ? (byRecord.get(h.id) as number) : 0;
    taskTickets += tickets;
    return h.rewardTickets === tickets ? h : { ...h, rewardTickets: tickets };
  });
  const added = claim ? Math.max(0, Number(timeTickets) || 0) + taskTickets : 0;
  return {
    ...data,
    taskHistory,
    lotteryTickets: (data?.lotteryTickets || 0) + added,
  };
};
