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
