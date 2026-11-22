import { useEffect, useEffectEvent, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useAudio } from './useAudio.ts';
import { breakSecondsFor, phaseStartEvents, shouldHandleTimeout } from '../domain/pomodoro.ts';
import { awaitingOf, insertChronologically, planPhaseEnd, pomodoroClock } from '../domain/pomodoroClock.ts';
import type { PomodoroSettings, PomodoroStatus } from '../domain/pomodoro.ts';
import type { Awaiting } from '../domain/pomodoroClock.ts';
import type { PomodoroEvent, PomodoroEventType } from '../types/data.ts';

// 時間到、等使用者按按鈕時，鈴聲每隔幾毫秒再響一次（一次鈴聲本身約 3 秒）
export const ALARM_REPEAT_MS = 4000;

/** usePomodoroAutoAdvance 的參數：番茄鐘的狀態與對應的 setState（都放在 App） */
export interface PomodoroAutoAdvanceOptions {
  status: PomodoroStatus;
  setStatus: Dispatch<SetStateAction<PomodoroStatus>>;
  settings: PomodoroSettings;
  /** 目前階段還剩幾秒（從時間軸算出來的） */
  timeLeft: number;
  /** 目前這個專注／休息階段要倒數幾秒；待機和心流是 null */
  phaseLength: number | null;
  setPhaseLength: Dispatch<SetStateAction<number | null>>;
  isPaused: boolean;
  setIsPaused: Dispatch<SetStateAction<boolean>>;
  /** 完成了幾個番茄 */
  cycles: number;
  setCycles: Dispatch<SetStateAction<number>>;
  showSettlement: boolean;
  setShowSettlement: Dispatch<SetStateAction<boolean>>;
  showSummary: boolean;
  setShowSummary: Dispatch<SetStateAction<boolean>>;
  timeline: PomodoroEvent[];
  setTimeline: Dispatch<SetStateAction<PomodoroEvent[]>>;
  /** 等待中的鈴聲已經按「先關掉鈴聲」關掉 */
  alarmMuted: boolean;
  setAlarmMuted: Dispatch<SetStateAction<boolean>>;
}

/** usePomodoroAutoAdvance 回傳的操作 */
export interface PomodoroAutoAdvance {
  /** 進入專注；回傳這次開始的時間（ISO 字串） */
  startFocus: (options?: { newSession?: boolean }) => string;
  /** 進入休息；currentCycles 是進入休息時已完成的番茄數 */
  startBreak: (currentCycles: number) => void;
  enterFlow: () => void;
  /** 時間到、正在等使用者按按鈕（不在等待時是 null） */
  awaiting: Awaiting | null;
  /** 先關掉鈴聲 */
  silenceAlarm: () => void;
}

/**
 * 番茄鐘的階段切換（進入專注／休息／心流）與「時間到」的處理。
 *
 * 放在 App 這一層呼叫，因為 App 不會被卸載：就算番茄鐘頁面沒有顯示，
 * 時間到時照樣會響鈴、停下來等你按「開始休息」或「開始專注」。手動操作（跳過、心流等）也用這裡回傳的同一份函式。
 *
 * 倒數是從時間軸算出來的（見 domain/pomodoroClock.ts），這裡只負責寫時間軸事件和「這個階段要倒數幾秒」。
 * 時間到時寫一筆 await_start；在使用者按下按鈕之前，鈴聲每 4 秒重複一次（按「先關掉鈴聲」可以先停掉），
 * Electron 版另外讓工作列的圖示閃爍。
 */
export const usePomodoroAutoAdvance = ({
  status, setStatus,
  settings,
  timeLeft,
  phaseLength, setPhaseLength,
  isPaused, setIsPaused,
  cycles, setCycles,
  showSettlement, setShowSettlement,
  showSummary, setShowSummary,
  timeline, setTimeline,
  alarmMuted, setAlarmMuted,
}: PomodoroAutoAdvanceOptions): PomodoroAutoAdvance => {
  const { playNotificationSound } = useAudio();
  // 同一次歸零只處理一次；倒數重新大於 0 才解除
  const timeoutHandledRef = useRef(false);
  const awaiting = status !== 'idle' ? awaitingOf(timeline) : null;
  const hasAwait = Boolean(awaiting);
  const ringing = hasAwait && !alarmMuted && !showSummary && !showSettlement;

  // 寫入「進入新階段」事件；若正在暫停，會先補一筆 pause_end
  const addPhaseStartEvent = (type: PomodoroEventType, time = new Date().toISOString()) => {
    const events = phaseStartEvents(type, { isPaused, time });
    setTimeline(prev => [...prev, ...events]);
  };

  /**
   * 進入專注。
   * newSession 為 true 時（從待機開始）時間軸整個重來，由呼叫端另外處理任務清單等初始化。
   * 回傳這次開始的時間（ISO 字串）。
   */
  const startFocus = ({ newSession = false }: { newSession?: boolean } = {}) => {
    const now = new Date().toISOString();
    setStatus('focus');
    setPhaseLength(settings.focus * 60);
    setIsPaused(false);
    setAlarmMuted(false);
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
  const startBreak = (currentCycles: number) => {
    setStatus('break');
    setIsPaused(false);
    setAlarmMuted(false);
    addPhaseStartEvent('break_start');
    setPhaseLength(breakSecondsFor(currentCycles, settings));
  };

  // 進入心流也一併解除暫停，與時間軸（flow_start 之後不算暫停）一致
  const enterFlow = () => {
    setStatus('flow');
    setIsPaused(false);
    setAlarmMuted(false);
    addPhaseStartEvent('flow_start');
    setPhaseLength(null);
  };

  // 倒數歸零：用「現在」重新算一次，把結束點放在倒數真正歸零的那一刻（休眠、對話框開著時也一樣），
  // 專注到時當下就算完成一個番茄；接著停下來等使用者按按鈕
  const handleTimeout = useEffectEvent(() => {
    const nowMs = Date.now();
    const clock = pomodoroClock({ timeline, phaseLength, nowMs });
    const plan = planPhaseEnd({ status, cycles, settings, clock, nowMs });
    if (!plan) return;
    if (plan.cyclesIncrement) setCycles(cycles + plan.cyclesIncrement);
    setAlarmMuted(false);
    setTimeline(prev => insertChronologically(prev, plan.events));
  });

  useEffect(() => {
    if (timeLeft > 0) {
      timeoutHandledRef.current = false;
      return;
    }
    if (timeoutHandledRef.current) return;
    if (!shouldHandleTimeout({ timeLeft, status, isPaused, showSettlement, showSummary, awaiting: hasAwait })) return;
    timeoutHandledRef.current = true;
    handleTimeout();
  }, [timeLeft, status, isPaused, showSettlement, showSummary, hasAwait]);

  // 等待中：馬上響一次，之後每 4 秒再響，直到按下按鈕或「先關掉鈴聲」
  const ring = useEffectEvent(() => playNotificationSound());
  useEffect(() => {
    if (!ringing) return undefined;
    ring();
    const id = setInterval(ring, ALARM_REPEAT_MS);
    return () => clearInterval(id);
  }, [ringing]);

  // 等待中讓工作列圖示閃爍（只有 Electron 版有；視窗本來就在前面時不閃）
  const isAwaiting = hasAwait && !showSummary && !showSettlement;
  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!isAwaiting || typeof api?.setAttention !== 'function') return undefined;
    api.setAttention(true);
    return () => api.setAttention(false);
  }, [isAwaiting]);

  return { startFocus, startBreak, enterFlow, awaiting, silenceAlarm: () => setAlarmMuted(true) };
};
