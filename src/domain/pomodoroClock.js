// 番茄鐘的計時（純函式，不碰 React 狀態與 localStorage，方便測試）
//
// 2026-11-20 起（Q4）：所有時間都從「時間軸」上的時間點算出來，不再每秒 +1。
// - 時間軸：focus_start／flow_start／break_start／pause_start／pause_end／task_complete／end，每個都帶 ISO 時間。
// - 倒數、總專注、心流時長、本輪工作時長、抽卡券、總結、歷史紀錄，全部用同一條時間軸算，數字一定對得上。
// - 電腦休眠、阻塞式對話框開著時，畫面的計時器雖然停住，醒來後照實際經過的時間算（規則：要算）。
// - 程式關閉的時間不算：下次開啟時，在最後一次「還活著」的時間點補一筆 pause_start，停在關閉時的剩餘時間（規則：視同暫停）。

import { breakSecondsFor, nextPhaseOnTimeout } from './pomodoro.js';

const PHASE_START_TYPES = new Set(['focus_start', 'flow_start', 'break_start']);
const RUNNING_STATUSES = new Set(['focus', 'flow', 'break']);

/** 重新整理畫面（Ctrl+R）這種幾秒內的中斷，不當成「程式關閉」，照常繼續計時 */
export const RELOAD_GRACE_MS = 10 * 1000;

const toMs = (time) => {
  const ms = new Date(time).getTime();
  return Number.isFinite(ms) ? ms : null;
};

const isoOf = (ms) => new Date(ms).toISOString();

/** 時間軸上最後一個事件的時間（毫秒）；沒有就回傳 null */
export const lastEventMs = (timeline) => {
  let last = null;
  for (const e of Array.isArray(timeline) ? timeline : []) {
    const ms = toMs(e?.time);
    if (ms != null && (last == null || ms > last)) last = ms;
  }
  return last;
};

/**
 * 依時間把事件插進時間軸（同時間的排在既有事件之後），回傳新陣列。
 * 補記在過去時間點的事件（例如休眠中就該結束的專注）也會放在正確的位置。
 */
export const insertChronologically = (timeline, events) => {
  const result = [...(Array.isArray(timeline) ? timeline : [])];
  for (const event of events) {
    const ms = toMs(event.time);
    let index = result.length;
    while (index > 0 && ms != null && (toMs(result[index - 1]?.time) ?? -Infinity) > ms) index--;
    result.splice(index, 0, event);
  }
  return result;
};

/**
 * 在 nowMs 這個時間點，番茄鐘各項時間是多少。規則和 calculatePomodoroStats（src/utils）相同：
 * 進入新階段一定解除暫停；暫停中的時間不算；task_complete 等其他事件不影響模式。
 *
 * @param {{ timeline: Array, phaseLength?: number|null, nowMs: number }} args
 *   phaseLength：目前這個專注／休息階段要倒數幾秒（心流沒有）
 * @returns {{
 *   focusSeconds: number, flowSeconds: number, breakSeconds: number,
 *   workSeconds: number,     // 專注 + 心流（給券用的時間）
 *   phaseElapsed: number,    // 目前階段實際經過（不含暫停）的秒數
 *   cycleWork: number,       // 從上一次休息開始之後累計的專注 + 心流秒數（判斷是否完成一個番茄）
 *   timeLeft: number,        // 目前階段還剩幾秒（整數，無條件進位；沒有倒數時為 0）
 *   phaseEndMs: number|null, // 目前階段的倒數在哪個時間點歸零（還沒歸零是 null）
 *   isPaused: boolean,
 * }}
 */
export const pomodoroClock = ({ timeline, phaseLength = null, nowMs }) => {
  const events = (Array.isArray(timeline) ? timeline : []).filter(e => toMs(e?.time) != null);
  const totals = { focus: 0, flow: 0, break: 0 };
  let mode = 'focus';
  let paused = false;
  let phaseElapsed = 0;
  let cycleWork = 0;
  let phaseEndMs = null;
  const length = Number.isFinite(phaseLength) && phaseLength >= 0 ? phaseLength : null;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const type = event.type;
    const startMs = toMs(event.time);
    // 只算到 nowMs 為止（nowMs 之後的事件當作還沒發生）
    if (startMs > nowMs) break;
    if (PHASE_START_TYPES.has(type)) {
      mode = type.replace('_start', '');
      paused = false;
      phaseElapsed = 0;
      phaseEndMs = null;
      if (type === 'break_start') cycleWork = 0;
    } else if (type === 'pause_start') {
      paused = true;
    } else if (type === 'pause_end') {
      paused = false;
    }
    if (type === 'end') break;

    const endMs = Math.min(i + 1 < events.length ? toMs(events[i + 1].time) : nowMs, nowMs);
    const seconds = Math.max(0, (endMs - startMs) / 1000);
    if (paused || seconds <= 0) continue;

    totals[mode] += seconds;
    if (mode !== 'break') cycleWork += seconds;
    if (length != null && phaseEndMs == null && phaseElapsed + seconds >= length) {
      phaseEndMs = startMs + (length - phaseElapsed) * 1000;
    }
    phaseElapsed += seconds;
  }

  return {
    focusSeconds: totals.focus,
    flowSeconds: totals.flow,
    breakSeconds: totals.break,
    workSeconds: totals.focus + totals.flow,
    phaseElapsed,
    cycleWork,
    timeLeft: length == null ? 0 : Math.max(0, Math.ceil(length - phaseElapsed - 1e-9)),
    phaseEndMs,
    isPaused: paused,
  };
};

/**
 * 倒數歸零後，下一個階段怎麼接（只切換一次，只響一次）。
 *
 * - 一般情況：舊階段在「倒數歸零的那一刻」結束，新階段從那一刻開始。
 *   所以專注最多只算到設定的長度；歸零後到現在這段（通常不到 1 秒，休眠醒來則可能很久）算進新階段。
 * - 新階段也早就該結束了（例如休眠了好幾個小時）：不連續跳好幾輪。
 *   - 專注結束 → 休息從專注結束那一刻開始，多出來的時間都算休息，休息倒數從現在重新給完整長度。
 *   - 休息結束 → 休息一路延長到現在，專注從現在開始、給完整長度（睡著的時間不會被算成專注）。
 *
 * @returns {{ status: string, cyclesIncrement: number, phaseLength: number, events: Array }|null}
 */
export const planTimeout = ({ status, cycles, settings, clock, phaseLength, nowMs }) => {
  const next = nextPhaseOnTimeout({ status, cycles, settings });
  if (!next) return null;
  const overshoot = Math.max(0, (clock?.phaseElapsed ?? 0) - (phaseLength ?? 0));
  const endedAtMs = clock?.phaseEndMs ?? nowMs - overshoot * 1000;
  const nextLength = next.timeLeft;

  let startMs = endedAtMs;
  let length = nextLength;
  if (overshoot >= nextLength) {
    if (next.status === 'break') {
      length = overshoot + nextLength;
    } else {
      startMs = nowMs;
    }
  }
  return {
    status: next.status,
    cyclesIncrement: next.cyclesIncrement,
    phaseLength: length,
    events: [{ type: next.timelineEvent, time: isoOf(startMs) }],
  };
};

const parseJson = (text, fallback) => {
  if (text == null) return fallback;
  try {
    const value = JSON.parse(text);
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const toNumber = (text) => {
  if (text == null || text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

/**
 * 從 localStorage（或任何有 getItem 的物件）讀出番茄鐘狀態，並處理：
 * - 舊版存的狀態（沒有 pomodoroPhaseLength，用 pomodoroTimeLeft 換算）；
 * - 壞掉的值（JSON 讀不出來、缺欄位）一律換成安全的預設，不會讓畫面當掉；
 * - 程式關閉期間：最後一次「還活著」（lastPomodoroTick）之後的時間視同暫停。
 *
 * @param {{ getItem(key: string): string|null }} storage
 * @param {number} nowMs
 */
export const loadPomodoroState = (storage, nowMs) => {
  const get = (key) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };

  const savedSettings = parseJson(get('pomodoroSettings'), null);
  const settings = {
    focus: 25,
    break: 5,
    ...(savedSettings && typeof savedSettings === 'object' && !Array.isArray(savedSettings) ? savedSettings : {}),
  };
  if (!Number.isFinite(settings.focus)) settings.focus = 25;
  if (!Number.isFinite(settings.break)) settings.break = 5;

  const rawStatus = get('pomodoroStatus');
  const status = RUNNING_STATUSES.has(rawStatus) ? rawStatus : 'idle';
  const asArray = (key) => {
    const value = parseJson(get(key), []);
    return Array.isArray(value) ? value : [];
  };
  const showSummary = get('pomodoroShowSummary') === 'true';
  const showSettlement = get('pomodoroShowSettlement') === 'true';
  const sessionStats = parseJson(get('pomodoroSessionStats'), null);
  let isPaused = get('pomodoroIsPaused') === 'true';
  let timeline = asArray('pomodoroTimeline').filter(e => e && typeof e === 'object' && toMs(e.time) != null);
  let sessionStartTime = get('pomodoroSessionStartTime');
  let phaseLength = toNumber(get('pomodoroPhaseLength'));
  const lastSeenMs = toNumber(get('lastPomodoroTick'));
  let closedGap = null;

  if (status !== 'idle') {
    // 時間軸沒有任何階段開始的事件（資料壞掉）：用最早能找到的時間補一筆，至少能繼續計時
    if (!timeline.some(e => PHASE_START_TYPES.has(e.type))) {
      const startMs = toMs(sessionStartTime) ?? lastSeenMs ?? nowMs;
      timeline = insertChronologically([], [{ type: `${status}_start`, time: isoOf(startMs) }, ...timeline]);
    }
    if (toMs(sessionStartTime) == null) sessionStartTime = timeline[0].time;

    if (status === 'flow') {
      phaseLength = null;
    } else if (phaseLength == null || phaseLength < 0) {
      // 舊版：只存了「剩幾秒」。換算成這個階段的總長度，讓關閉時看到的剩餘時間不變
      const legacyLeft = toNumber(get('pomodoroTimeLeft'));
      const at = lastSeenMs ?? nowMs;
      const elapsed = pomodoroClock({ timeline, phaseLength: null, nowMs: at }).phaseElapsed;
      const fallback = status === 'focus' ? settings.focus * 60 : breakSecondsFor(0, settings);
      phaseLength = legacyLeft != null && legacyLeft >= 0 ? legacyLeft + elapsed : fallback;
    }

    // 程式關閉期間不計時：從最後一次還活著的時間點開始暫停，停在當時的剩餘時間
    const running = !isPaused && !showSummary && !showSettlement;
    if (running && lastSeenMs != null && nowMs - lastSeenMs > RELOAD_GRACE_MS) {
      const pauseMs = Math.max(lastSeenMs, lastEventMs(timeline) ?? lastSeenMs);
      timeline = [...timeline, { type: 'pause_start', time: isoOf(pauseMs), reason: 'app_closed' }];
      isPaused = true;
      closedGap = { fromMs: pauseMs, toMs: nowMs };
    }
  } else {
    phaseLength = null;
  }

  return {
    status,
    settings,
    selectedTaskIds: asArray('pomodoroSelectedTaskIds'),
    sessionTasks: asArray('pomodoroSessionTasks'),
    completedSessionTaskIds: asArray('pomodoroCompletedSessionTaskIds'),
    isPaused,
    cycles: toNumber(get('pomodoroCycles')) ?? 0,
    showSettlement,
    showSummary,
    timeline,
    phaseLength,
    sessionStats: sessionStats && typeof sessionStats === 'object' ? sessionStats : null,
    sessionStartTime,
    closedGap,
  };
};

/** 舊版用來「每秒 +1」累計的欄位，新版不再使用，讀完就可以刪掉 */
export const LEGACY_POMODORO_KEYS = [
  'pomodoroTimeLeft',
  'pomodoroTotalAccumulated',
  'pomodoroCurrentSessionDuration',
  'pomodoroCurrentCycleWorkDuration',
];

/** 時間軸最後是不是「程式關閉而自動暫停」，而且還沒繼續 */
export const isPausedByAppClose = (timeline, isPaused) => {
  if (!isPaused || !Array.isArray(timeline)) return false;
  for (let i = timeline.length - 1; i >= 0; i--) {
    const e = timeline[i];
    if (e?.type === 'pause_start') return e.reason === 'app_closed';
    if (e?.type === 'pause_end' || PHASE_START_TYPES.has(e?.type)) return false;
  }
  return false;
};
