// 番茄鐘的計時（純函式，不碰 React 狀態與 localStorage，方便測試）
//
// 2026-11-20 起（Q4）：所有時間都從「時間軸」上的時間點算出來，不再每秒 +1。
// - 時間軸：focus_start／flow_start／break_start／pause_start／pause_end／await_start／task_complete／end，每個都帶 ISO 時間。
// - await_start（2026-11-20 起）：倒數歸零的那一刻。之後等使用者按「開始休息／開始專注」，等待的時間不算專注也不算休息。
// - 倒數、總專注、心流時長、本輪工作時長、抽卡券、總結、歷史紀錄，全部用同一條時間軸算，數字一定對得上。
// - 電腦休眠、阻塞式對話框開著時，畫面的計時器雖然停住，醒來後照實際經過的時間算（規則：要算）。
// - 程式關閉的時間不算：下次開啟時，在最後一次「還活著」的時間點補一筆 pause_start，停在關閉時的剩餘時間（規則：視同暫停）。

import { breakSecondsFor, nextPhaseOnTimeout, normalizePomodoroSettings } from './pomodoro.js';
import { migrateTaskList } from '../shared/defaultData.js';

const PHASE_START_TYPES = new Set(['focus_start', 'flow_start', 'break_start']);
const RUNNING_STATUSES = new Set(['focus', 'flow', 'break']);

/** 重新整理畫面（Ctrl+R）這種幾秒內的中斷，不當成「程式關閉」，照常繼續計時 */
export const RELOAD_GRACE_MS = 10 * 1000;

const toMs = (time) => {
  // null、空字串、布林值不是時間（new Date(null) 會變成 1970 年，整段番茄鐘會被算成好幾十年）
  if (time == null || time === '' || typeof time === 'boolean') return null;
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
 * 進入新階段一定解除暫停；暫停中的時間不算；await_start（時間到、等使用者按繼續）之後的時間也不算；
 * task_complete 等其他事件不影響模式。
 *
 * @param {{ timeline: Array, phaseLength?: number|null, nowMs: number }} args
 *   phaseLength：目前這個專注／休息階段要倒數幾秒（心流沒有）
 * @returns {{
 *   focusSeconds: number, flowSeconds: number, breakSeconds: number,
 *   workSeconds: number,     // 專注 + 心流（給券用的時間）
 *   phaseElapsed: number,    // 目前階段實際經過（不含暫停、等待）的秒數
 *   cycleWork: number,       // 從上一次休息（或上一個番茄完成）之後累計的專注 + 心流秒數（判斷是否完成一個番茄）
 *   timeLeft: number,        // 目前階段還剩幾秒（整數，無條件進位；沒有倒數時為 0）
 *   phaseEndMs: number|null, // 目前階段的倒數在哪個時間點歸零（還沒歸零是 null）
 *   isPaused: boolean,
 *   isAwaiting: boolean,     // 時間到了，正在等使用者按「開始休息／開始專注」
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
    } else if (type === 'await_start') {
      // 時間到：這個階段結束了，等待的時間不算專注也不算休息；專注到時已經算完一個番茄，本輪重新累計
      mode = 'await';
      paused = false;
      cycleWork = 0;
    } else if (type === 'pause_start') {
      paused = true;
    } else if (type === 'pause_end') {
      paused = false;
    }
    if (type === 'end') break;

    const endMs = Math.min(i + 1 < events.length ? toMs(events[i + 1].time) : nowMs, nowMs);
    const seconds = Math.max(0, (endMs - startMs) / 1000);
    if (paused || mode === 'await' || seconds <= 0) continue;

    totals[mode] += seconds;
    if (mode !== 'break') cycleWork += seconds;
    if (length != null && phaseEndMs == null && phaseElapsed + seconds >= length) {
      // 進位到整毫秒：時間軸只存到毫秒，這樣在這個時間點結束時，經過的時間一定不少於設定長度
      phaseEndMs = Math.ceil(startMs + (length - phaseElapsed) * 1000);
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
    timeLeft: length == null || mode === 'await' ? 0 : Math.max(0, Math.ceil(length - phaseElapsed - 1e-6)),
    phaseEndMs,
    isPaused: paused,
    isAwaiting: mode === 'await',
  };
};

/**
 * 倒數歸零：這個階段在「倒數真正歸零的那一刻」結束，接著等使用者按「開始休息」或「開始專注」。
 * 等待的時間不算專注也不算休息；下一個階段在按下按鈕時才開始（由 startBreak／startFocus 寫入）。
 * 電腦休眠、對話框開著時歸零也一樣：專注最多只算設定的長度，醒來後只響鈴、等你按。
 *
 * @returns {{ next: 'break'|'focus', cyclesIncrement: number, events: Array }|null}
 *   cyclesIncrement：專注時間到就算完成一個番茄（+1），休息時間到是 0
 */
export const planPhaseEnd = ({ status, cycles, settings, clock, nowMs }) => {
  const next = nextPhaseOnTimeout({ status, cycles, settings });
  if (!next) return null;
  const endedAtMs = Math.min(clock?.phaseEndMs ?? nowMs, nowMs);
  return {
    next: next.status,
    cyclesIncrement: next.cyclesIncrement,
    events: [{ type: 'await_start', time: isoOf(endedAtMs), next: next.status }],
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

  // 舊設定沒有長休息欄位時，在這裡照舊規則換算（見 normalizePomodoroSettings）
  const settings = normalizePomodoroSettings(parseJson(get('pomodoroSettings'), null));

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
    // 時間到、正在等使用者按繼續的時候不必補：等待的時間本來就不算
    const running = !isPaused && !showSummary && !showSettlement && !awaitingOf(timeline);
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
    // 進行中那一輪的任務是升級前存的話，維度代號可能還是舊的（例如 learning → growth）
    sessionTasks: migrateTaskList(asArray('pomodoroSessionTasks')),
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
    // 時間到、等待中的鈴聲是否已經按「先關掉鈴聲」關掉（重開程式後維持；不在等待就一律 false）
    alarmMuted: status !== 'idle' && awaitingOf(timeline) != null && get('pomodoroAlarmMuted') === 'true',
  };
};

/**
 * 是不是「時間到、正在等使用者按繼續」：時間軸上最後一個階段相關的事件是 await_start。
 * 回傳 { next: 'break'|'focus', since: ISO 字串 }，不是就回傳 null。
 */
export const awaitingOf = (timeline) => {
  if (!Array.isArray(timeline)) return null;
  for (let i = timeline.length - 1; i >= 0; i--) {
    const e = timeline[i];
    if (e?.type === 'await_start') {
      return { next: e.next === 'focus' ? 'focus' : 'break', since: e.time };
    }
    if (PHASE_START_TYPES.has(e?.type) || e?.type === 'end') return null;
  }
  return null;
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
