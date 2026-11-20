// 番茄鐘的階段轉換規則（純函式，不碰 React 狀態，方便測試）

// 每 4 輪給一次長休息；只有在休息設定不長（<= 10 分鐘）時才套用
const LONG_BREAK_EVERY = 4;
const LONG_BREAK_MAX_SETTING = 10;
const LONG_BREAK_MINUTES = 20;

/**
 * 進入休息時應倒數幾秒。
 * @param {number} cycles 進入這次休息時「已完成」的番茄數
 * @param {{ break: number }} settings 分鐘數設定
 */
export const breakSecondsFor = (cycles, settings) => {
  if (settings.break <= LONG_BREAK_MAX_SETTING && cycles > 0 && cycles % LONG_BREAK_EVERY === 0) {
    return LONG_BREAK_MINUTES * 60;
  }
  return settings.break * 60;
};

/**
 * 「時間到」是否該被處理。條件與原本番茄鐘頁面裡的監聽完全相同。
 */
export const shouldHandleTimeout = ({ timeLeft, status, isPaused, showSettlement, showSummary }) =>
  timeLeft <= 0 &&
  status !== 'idle' &&
  status !== 'flow' &&
  !isPaused &&
  !showSettlement &&
  !showSummary;

/**
 * 進入新階段（focus_start／break_start／flow_start）時要寫進時間軸的事件。
 * 如果當下正在暫停，先補一筆時間相同的 pause_end，讓時間軸上的暫停有頭有尾。
 */
export const phaseStartEvents = (type, { isPaused, time }) => {
  const events = [];
  if (isPaused) events.push({ type: 'pause_end', time });
  events.push({ type, time });
  return events;
};

/**
 * 倒數歸零後的下一個階段。
 * 回傳 null 表示這個狀態沒有「時間到」可言（idle、flow 等）。
 */
export const nextPhaseOnTimeout = ({ status, cycles, settings }) => {
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
// 抽卡券
// ---------------------------------------------------------------------------

// 專注時間給券：每滿 50 分鐘多一階，第 n 階累計給 1+2+…+n 張；最多算到 300 分鐘（21 張）
const FOCUS_TICKET_STEP_SECONDS = 50 * 60;
const FOCUS_TICKET_CAP_SECONDS = 300 * 60;

/** 專注（專注 + 心流）累計 workSeconds 秒，可以拿幾張券 */
export const focusTicketsFor = (workSeconds) => {
  const seconds = Number(workSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  const n = Math.floor(Math.min(seconds, FOCUS_TICKET_CAP_SECONDS) / FOCUS_TICKET_STEP_SECONDS);
  return (n * (n + 1)) / 2;
};

// 舊版時間軸的 task_complete 沒有記下完成紀錄的 id，只能用「同一個任務、時間相差不到 10 秒」找回那筆紀錄
const LEGACY_RECORD_MATCH_MS = 10 * 1000;
// 舊版在番茄鐘完成的任務，完成紀錄固定記 1 張
const LEGACY_TASK_TICKETS = 1;

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
 * @param {Array} timeline 這次番茄鐘的時間軸
 * @param {Array} taskHistory 目前的完成紀錄
 * @returns {Array<{ recordId: string, taskId: string, tickets: number }>}
 */
export const pomodoroTaskTicketGrants = (timeline, taskHistory) => {
  const history = Array.isArray(taskHistory) ? taskHistory : [];
  const used = new Set();
  const grants = [];
  for (const event of Array.isArray(timeline) ? timeline : []) {
    if (event?.type !== 'task_complete') continue;
    let record = null;
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
export const pomodoroSettlementTickets = ({ workSeconds, timeline, taskHistory }) => {
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
 * @returns 新的 data（不改動傳入的物件）
 */
export const settlePomodoroTickets = (data, { grants = [], timeTickets = 0, claim }) => {
  const history = Array.isArray(data?.taskHistory) ? data.taskHistory : [];
  const byRecord = new Map(grants.map(g => [g.recordId, g.tickets]));
  let taskTickets = 0;
  const taskHistory = history.map(h => {
    if (!byRecord.has(h.id)) return h;
    const tickets = claim ? byRecord.get(h.id) : 0;
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
