import { useEffect, useEffectEvent, useRef } from 'react';
import { useAudio } from './useAudio';
import { breakSecondsFor, nextPhaseOnTimeout, phaseStartEvents, shouldHandleTimeout } from '../domain/pomodoro';

/**
 * 番茄鐘的階段切換（進入專注／休息／心流）與「時間到」的自動處理。
 *
 * 放在 App 這一層呼叫，因為 App 不會被卸載：就算番茄鐘頁面沒有顯示，
 * 時間到時照樣會響鈴、切換階段。手動操作（跳過、心流等）也用這裡回傳的同一份函式。
 */
export const usePomodoroAutoAdvance = ({
  status, setStatus,
  settings,
  timeLeft, setTimeLeft,
  isPaused, setIsPaused,
  cycles, setCycles,
  showSettlement, setShowSettlement,
  showSummary, setShowSummary,
  setCurrentSessionDuration,
  setCurrentCycleWorkDuration,
  setTimeline,
}) => {
  const { playNotificationSound } = useAudio();
  // 同一次歸零只處理一次；倒數重新大於 0 才解除
  const timeoutHandledRef = useRef(false);

  // 寫入「進入新階段」事件；若正在暫停，會先補一筆 pause_end
  const addPhaseStartEvent = (type, time = new Date().toISOString()) => {
    const events = phaseStartEvents(type, { isPaused, time });
    setTimeline(prev => [...prev, ...events]);
  };

  /**
   * 進入專注。
   * newSession 為 true 時（從待機開始）時間軸整個重來，由呼叫端另外處理任務清單等初始化。
   * 回傳這次開始的時間（ISO 字串）。
   */
  const startFocus = ({ newSession = false } = {}) => {
    const now = new Date().toISOString();
    setStatus('focus');
    setTimeLeft(settings.focus * 60);
    setCurrentSessionDuration(0);
    setIsPaused(false);
    if (newSession) {
      setTimeline([{ type: 'focus_start', time: now }]);
    } else {
      addPhaseStartEvent('focus_start', now);
    }
    setShowSettlement(false);
    setShowSummary(false);
    return now;
  };

  /** 進入休息。currentCycles 為進入休息時已完成的番茄數，用來決定是否長休息。 */
  const startBreak = (currentCycles) => {
    setStatus('break');
    setCurrentSessionDuration(0);
    setIsPaused(false);
    addPhaseStartEvent('break_start');
    setTimeLeft(breakSecondsFor(currentCycles, settings));
  };

  // 進入心流也一併解除暫停，與時間軸（flow_start 之後不算暫停）一致
  const enterFlow = () => {
    setStatus('flow');
    setCurrentSessionDuration(0);
    setIsPaused(false);
    addPhaseStartEvent('flow_start');
  };

  const handleTimeout = useEffectEvent(() => {
    const next = nextPhaseOnTimeout({ status, cycles, settings });
    if (!next) return;
    playNotificationSound();
    if (next.status === 'break') {
      const newCycles = cycles + next.cyclesIncrement;
      setCycles(newCycles);
      if (next.resetCycleWorkDuration) setCurrentCycleWorkDuration(0);
      startBreak(newCycles);
    } else {
      startFocus();
    }
  });

  useEffect(() => {
    if (timeLeft > 0) {
      timeoutHandledRef.current = false;
      return;
    }
    if (timeoutHandledRef.current) return;
    if (!shouldHandleTimeout({ timeLeft, status, isPaused, showSettlement, showSummary })) return;
    timeoutHandledRef.current = true;
    handleTimeout();
  }, [timeLeft, status, isPaused, showSettlement, showSummary]);

  return { startFocus, startBreak, enterFlow };
};
