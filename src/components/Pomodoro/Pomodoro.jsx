import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Timer, Settings2, Target, CheckCircle2, ChevronUp, ChevronDown, Play, Square, Pause, FastForward, Trophy, Gift, Infinity as InfinityIcon, Plus, Trash2, X, RotateCcw
} from 'lucide-react';
import { useAudio } from '../../hooks/useAudio';
import { useAppData } from '../../contexts/AppDataContext';
import { formatTime, formatFlowTime, getTodayStr, calculatePomodoroStats } from '../../utils';
import PomodoroSummary from './PomodoroSummary';
import PomodoroHistory from './PomodoroHistory';

const Pomodoro = ({
  subTasks,
  onTaskComplete,
  onTaskRevert,
  // State from parent
  status, setStatus,
  settings, setSettings,
  timeLeft, setTimeLeft,
  selectedTaskIds, setSelectedTaskIds,
  sessionTasks, setSessionTasks,
  completedSessionTaskIds, setCompletedSessionTaskIds,
  isPaused, setIsPaused,
  totalAccumulated, setTotalAccumulated,
  currentSessionDuration, setCurrentSessionDuration,
  cycles, setCycles,
  showSettlement, setShowSettlement,
  // New props for persistence
  sessionTimeline, setSessionTimeline,
  currentCycleWorkDuration, setCurrentCycleWorkDuration,
  showSummary, setShowSummary,
  sessionStats, setSessionStats,
  sessionStartTimeRef
}) => {
  const { playNotificationSound } = useAudio();
  const { addPomodoroRecord, addLotteryTickets } = useAppData();
  
  const lastFocusStartTimeRef = useRef(null);
  const [isAddingTask, setIsAddingTask] = useState(false);

  const learningTasks = subTasks.filter(t => {
    if (t.indicatorId !== 'learning') return false;
    
    // 排除已歸檔/已完成的一次性任務
    if (t.completed) return false;

    const todayStr = getTodayStr();
    const today = new Date();
    const currentDay = today.getDay();

    // 如果是重複性任務
    if (t.type === 'daily' || t.type === 'weekly') {
      const isTodayCompleted = t.lastCompletedAt && t.lastCompletedAt.startsWith(todayStr);
      const isWrongDay = t.type === 'weekly' && !t.days.includes(currentDay);
      // 排除今日已完成 或 非指定日期的任務
      return !isTodayCompleted && !isWrongDay;
    }

    return true;
  });

  // 監聽時間歸零
  useEffect(() => {
    if (timeLeft <= 0 && status !== 'idle' && status !== 'flow' && !isPaused && !showSettlement && !showSummary) {
      handleTimerComplete();
    }
  }, [timeLeft, status, isPaused, showSettlement, showSummary]);

  const addTimelineEvent = (type, extra = {}) => {
    setSessionTimeline(prev => [...prev, { type, time: new Date().toISOString(), ...extra }]);
  };

  const handleTimerComplete = () => {
    playNotificationSound();
    if (status === 'focus') {
      const newCycles = cycles + 1;
      setCycles(newCycles);
      setCurrentCycleWorkDuration(0); // 重置當前週期時長
      startBreak(newCycles);
    } else if (status === 'break') {
      startFocus();
    }
  };

  const startFocus = () => {
    const now = new Date().toISOString();
    setStatus('focus');
    setTimeLeft(settings.focus * 60);
    setCurrentSessionDuration(0);
    setIsPaused(false);
    
    if (status === 'idle') {
      sessionStartTimeRef.current = now;
      localStorage.setItem('pomodoroSessionStartTime', now);
      // 確保任務順序與選擇的順序一致
      const selectedTasks = selectedTaskIds.map(id => subTasks.find(t => t.id === id)).filter(Boolean);
      setSessionTasks(selectedTasks);
      setCompletedSessionTaskIds([]);
      setSessionTimeline([{ type: 'focus_start', time: now }]);
      setCycles(0);
      setCurrentCycleWorkDuration(0);
    } else {
      addTimelineEvent('focus_start');
    }
    
    lastFocusStartTimeRef.current = now;
    setShowSettlement(false);
    setShowSummary(false);
  };

  const startBreak = (currentCycles) => {
    setStatus('break');
    setCurrentSessionDuration(0);
    setIsPaused(false);
    addTimelineEvent('break_start');
    
    if (settings.break <= 10 && currentCycles > 0 && currentCycles % 4 === 0) {
      setTimeLeft(20 * 60);
    } else {
      setTimeLeft(settings.break * 60);
    }
  };

  const enterFlow = () => {
    setStatus('flow');
    setCurrentSessionDuration(0);
    addTimelineEvent('flow_start');
  };

  const endFlow = () => {
    let newCycles = cycles;
    // 檢查專注+心流總時長是否達標
    if (currentCycleWorkDuration >= settings.focus * 60) {
      newCycles += 1;
      setCycles(newCycles);
    }
    setCurrentCycleWorkDuration(0);
    startBreak(newCycles);
  };

  const togglePause = () => {
    const newPaused = !isPaused;
    setIsPaused(newPaused);
    addTimelineEvent(newPaused ? 'pause_start' : 'pause_end');
  };

  const stopTimer = () => {
    if (status === 'idle') return;
    const now = new Date().toISOString();
    const finalTimeline = [...sessionTimeline, { type: 'end', time: now }];
    
    const { focusDuration: focusDur, flowDuration: flowDur, breakDuration: breakDur } = calculatePomodoroStats(finalTimeline);

    // 最後結算時檢查當前進行中的週期
    let finalCycles = cycles;
    if ((status === 'focus' || status === 'flow') && currentCycleWorkDuration >= settings.focus * 60) {
      finalCycles += 1;
    }

    const stats = {
      id: crypto.randomUUID(),
      startTime: sessionStartTimeRef.current,
      endTime: now,
      totalDuration: (new Date(now) - new Date(sessionStartTimeRef.current)) / 1000,
      focusDuration: focusDur,
      flowDuration: flowDur,
      breakDuration: breakDur,
      completedCycles: finalCycles,
      timeline: finalTimeline,
      tasks: sessionTasks.map(t => ({
        ...t,
        isCompleted: completedSessionTaskIds.includes(t.id),
        sessionCount: completedSessionTaskIds.filter(id => id === t.id).length
      }))
    };

    setSessionStats(stats);
    addPomodoroRecord(stats);
    setShowSummary(true);
    setIsPaused(true);
  };

  const handleSettlement = () => {
    setStatus('idle');
    setTotalAccumulated(0);
    setCurrentSessionDuration(0);
    setCycles(0);
    setIsPaused(false);
    setSessionTasks([]);
    setCompletedSessionTaskIds([]);
    setShowSettlement(false);
    setShowSummary(false);
    setSelectedTaskIds([]);
    // Clear local storage on settlement
    const keysToRemove = [
      'pomodoroStatus', 'pomodoroTimeLeft', 'pomodoroSelectedTaskIds',
      'pomodoroSessionTasks', 'pomodoroCompletedSessionTaskIds', 'pomodoroIsPaused',
      'pomodoroTotalAccumulated', 'pomodoroCurrentSessionDuration', 'pomodoroCycles',
      'pomodoroShowSettlement', 'pomodoroTimeline', 'pomodoroCurrentCycleWorkDuration',
      'pomodoroShowSummary', 'pomodoroSessionStats', 'pomodoroSessionStartTime', 'lastPomodoroTick'
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));
  };

  const handleLottery = () => {
    // 獎勵上限為 300 分鐘 (6 個階段)
    const cappedTime = Math.min(totalAccumulated, 300 * 60);
    const n = Math.floor(cappedTime / (50 * 60));
    const timeChances = (n * (n + 1)) / 2;
    const taskChances = completedSessionTaskIds.length;
    const totalTickets = timeChances + taskChances;

    if (totalTickets > 0) {
      addLotteryTickets(totalTickets);
    }
    handleSettlement();
  };

  const handleSessionTaskComplete = (taskId) => {
    const task = sessionTasks.find(t => t.id === taskId);
    if (!task) return;

    if (task.type === 'infinite') {
      onTaskComplete(taskId);
      setCompletedSessionTaskIds(prev => [...prev, taskId]);
      addTimelineEvent('task_complete', { taskId, taskTitle: task?.title });
    } else {
      if (completedSessionTaskIds.includes(taskId)) {
        onTaskRevert(taskId);
        setCompletedSessionTaskIds(prev => prev.filter(id => id !== taskId));
        setSessionTimeline(prev => {
          const lastIdx = [...prev].reverse().findIndex(e => e.type === 'task_complete' && e.taskId === taskId);
          if (lastIdx === -1) return prev;
          const actualIdx = prev.length - 1 - lastIdx;
          return prev.filter((_, i) => i !== actualIdx);
        });
      } else {
        onTaskComplete(taskId);
        setCompletedSessionTaskIds(prev => [...prev, taskId]);
        addTimelineEvent('task_complete', { taskId, taskTitle: task?.title });
      }
    }
  };

  const handleSessionTaskRevert = (taskId) => {
    const task = sessionTasks.find(t => t.id === taskId);
    if (!task || task.type !== 'infinite') return;
    
    // 檢查本次對話中是否有完成紀錄
    const sessionCount = completedSessionTaskIds.filter(id => id === taskId).length;
    if (sessionCount <= 0) return;

    onTaskRevert(taskId);
    
    // 從已完成 ID 清單中移除一個
    setCompletedSessionTaskIds(prev => {
      const idx = prev.lastIndexOf(taskId);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });

    // 從時間軸中移除最後一個相關事件
    setSessionTimeline(prev => {
      const lastIdx = [...prev].reverse().findIndex(e => e.type === 'task_complete' && e.taskId === taskId);
      if (lastIdx === -1) return prev;
      const actualIdx = prev.length - 1 - lastIdx;
      return prev.filter((_, i) => i !== actualIdx);
    });
  };

  const skipToBreak = () => {
    if (status === 'focus' || status === 'flow') {
      let newCycles = cycles;
      // 只有在心流模式且時長達標時才計入完整番茄
      if (status === 'flow' && currentCycleWorkDuration >= settings.focus * 60) {
        newCycles += 1;
        setCycles(newCycles);
      }
      setCurrentCycleWorkDuration(0);
      startBreak(newCycles);
    }
  };

  const skipToFocus = () => {
    if (status === 'break') {
      startFocus();
    }
  };

  const removeSessionTask = (taskId) => {
    setSessionTasks(prev => prev.filter(t => t.id !== taskId));
    setSelectedTaskIds(prev => prev.filter(id => id !== taskId));
    if (completedSessionTaskIds.includes(taskId)) {
      setCompletedSessionTaskIds(prev => prev.filter(id => id !== taskId));
    }
  };

  const moveSessionTask = (index, direction) => {
    const newTasks = [...sessionTasks];
    const targetIndex = index + direction;
    if (targetIndex >= 0 && targetIndex < newTasks.length) {
      [newTasks[index], newTasks[targetIndex]] = [newTasks[targetIndex], newTasks[index]];
      setSessionTasks(newTasks);
      // 同步更新 selectedTaskIds 以保持順序一致性
      setSelectedTaskIds(newTasks.map(t => t.id));
    }
  };

  const addSessionTask = (task) => {
    if (!sessionTasks.find(t => t.id === task.id)) {
      const newTasks = [...sessionTasks, task];
      setSessionTasks(newTasks);
      setSelectedTaskIds(newTasks.map(t => t.id));
    }
  };

  if (status === 'idle') {
    return (
      <div className="space-y-8 md:space-y-12">
        <div className="bg-white/40 backdrop-blur-xl rounded-3xl md:rounded-[48px] p-6 md:p-8 border border-white/60 shadow-xl animate-in fade-in">
          <div className="flex items-center gap-4 md:gap-5 mb-6 md:mb-8">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl md:rounded-[1.5rem] bg-white/40 backdrop-blur-2xl border border-white/60 flex items-center justify-center shadow-xl shadow-sky-100/50 text-sky-500 shrink-0">
              <Timer className="w-6 h-6 md:w-7 md:h-7" />
            </div>
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-sky-900">心流番茄鐘</h2>
              <p className="text-[8px] md:text-[10px] font-black text-sky-600 uppercase tracking-widest">專注當下，享受心流</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <div className="space-y-4 md:space-y-6">
              <div className="bg-white/40 rounded-2xl md:rounded-[32px] p-5 md:p-6 border border-white/40">
                <h3 className="font-black text-sky-800 mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base">
                  <Settings2 className="w-4 h-4 md:w-5 md:h-5" /> 時間設定
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] md:text-xs font-bold text-sky-800 mb-2">專注時間 (分鐘)</label>
                    <input
                      type="range"
                      min="5"
                      max="90"
                      step="1"
                      value={settings.focus}
                      onChange={(e) => setSettings({ ...settings, focus: Number(e.target.value) })}
                      className="w-full accent-sky-500 h-1.5 md:h-2"
                    />
                    <div className="text-right text-lg md:text-xl font-black text-sky-700 mt-1">{settings.focus} min</div>
                  </div>
                  <div>
                    <label className="block text-[10px] md:text-xs font-bold text-sky-800 mb-2">休息時間 (分鐘)</label>
                    <input
                      type="range"
                      min="1"
                      max="30"
                      value={settings.break}
                      onChange={(e) => setSettings({ ...settings, break: Number(e.target.value) })}
                      className="w-full accent-emerald-500 h-1.5 md:h-2"
                    />
                    <div className="text-right text-lg md:text-xl font-black text-emerald-600 mt-1">{settings.break} min</div>
                  </div>
                </div>
              </div>

              <div className="bg-sky-50/50 rounded-2xl md:rounded-[32px] p-5 md:p-6 border border-sky-100">
                <div className="flex items-center gap-2 md:gap-3 mb-2">
                  <Gift className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
                  <span className="font-black text-sky-800 text-sm md:text-base">獎勵規則</span>
                </div>
                <p className="text-[10px] md:text-xs font-bold text-sky-800 leading-relaxed">
                  累積專注（專注 + 心流）滿 <span className="text-amber-600">50 分鐘</span>，
                  可獲得 <span className="text-amber-600">1 張</span> 抽卡券；
                  <br className="hidden md:block" />
                  滿 <span className="text-amber-600">100 分鐘</span>可獲得 <span className="text-amber-600">1+2 張</span>；
                  <br className="hidden md:block" />
                  滿 <span className="text-amber-600">150 分鐘</span>可獲得 <span className="text-amber-600">1+2+3 張</span>……以此類推。
                  <br />
                  <span className="text-rose-500 font-black">* 獎勵上限為 300 分鐘 (21 張券)</span>
                  <br />
                  <span className="text-[8px] md:text-[10px] text-sky-700 italic">* 休息時間不計入累積時長</span>
                </p>
              </div>
            </div>

            <div className="flex flex-col h-full min-h-[300px]">
              <div className="bg-white/40 rounded-2xl md:rounded-[32px] p-5 md:p-6 border border-white/40 flex-grow mb-4 md:mb-6 overflow-hidden flex flex-col">
                <h3 className="font-black text-sky-800 mb-3 md:mb-4 flex items-center gap-2 flex-shrink-0 text-sm md:text-base">
                  <Target className="w-4 h-4 md:w-5 md:h-5" /> 選擇目標任務 (學習)
                </h3>
                <div className="overflow-y-auto custom-scrollbar flex-grow pr-2 space-y-2">
                  {learningTasks.length === 0 ? (
                    <div className="text-center py-8 text-sky-500 font-bold text-xs md:text-sm">目前沒有未完成的學習任務</div>
                  ) : (
                    learningTasks.map(task => {
                      const isSelected = selectedTaskIds.includes(task.id);
                      const selectedIndex = selectedTaskIds.indexOf(task.id);
                      
                      return (
                        <div key={task.id} className={`flex items-center gap-2 md:gap-3 p-2.5 md:p-3 rounded-xl transition-all border ${isSelected ? 'bg-white border-sky-200 shadow-sm' : 'bg-white/60 border-transparent hover:border-sky-100 hover:bg-white'}`}>
                          <label className="flex items-center gap-2 md:gap-3 flex-grow cursor-pointer group select-none">
                            <div className="relative flex items-center justify-center shrink-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedTaskIds([...selectedTaskIds, task.id]);
                                  else setSelectedTaskIds(selectedTaskIds.filter(id => id !== task.id));
                                }}
                                className="peer sr-only"
                              />
                              <div className={`w-5 h-5 md:w-6 md:h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 ${
                                isSelected
                                  ? 'bg-sky-500 border-sky-500 shadow-md shadow-sky-200 scale-110'
                                  : 'bg-white border-sky-200 group-hover:border-sky-400 group-hover:scale-105'
                              }`}>
                                <CheckCircle2 className={`w-3 h-3 md:w-4 md:h-4 text-white transition-all duration-300 ${
                                  isSelected ? 'scale-100 rotate-0' : 'scale-0 -rotate-90'
                                }`} />
                              </div>
                            </div>
                            <span className={`text-xs md:text-sm font-bold break-words line-clamp-2 transition-colors duration-300 ${
                              isSelected ? 'text-sky-800' : 'text-sky-700/70 group-hover:text-sky-800'
                            }`}>
                              {task.title}
                            </span>
                          </label>
                          {isSelected && (
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button
                                onClick={() => {
                                  if (selectedIndex > 0) {
                                    const newIds = [...selectedTaskIds];
                                    [newIds[selectedIndex], newIds[selectedIndex - 1]] = [newIds[selectedIndex - 1], newIds[selectedIndex]];
                                    setSelectedTaskIds(newIds);
                                  }
                                }}
                                disabled={selectedIndex === 0}
                                className="p-0.5 text-sky-500 hover:text-sky-700 disabled:opacity-30 hover:bg-sky-50 rounded"
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => {
                                  if (selectedIndex < selectedTaskIds.length - 1) {
                                    const newIds = [...selectedTaskIds];
                                    [newIds[selectedIndex], newIds[selectedIndex + 1]] = [newIds[selectedIndex + 1], newIds[selectedIndex]];
                                    setSelectedTaskIds(newIds);
                                  }
                                }}
                                disabled={selectedIndex === selectedTaskIds.length - 1}
                                className="p-0.5 text-sky-500 hover:text-sky-700 disabled:opacity-30 hover:bg-sky-50 rounded"
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          {isSelected && (
                            <span className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center text-[10px] md:text-xs font-black shrink-0">
                              {selectedIndex + 1}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <button
                onClick={startFocus}
                disabled={learningTasks.length > 0 && selectedTaskIds.length === 0}
                className="w-full py-4 md:py-5 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl md:rounded-[24px] font-black text-lg md:text-xl shadow-lg shadow-sky-200 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" /> 開始專注
              </button>
              {learningTasks.length > 0 && selectedTaskIds.length === 0 && (
                <p className="text-center text-[9px] md:text-[10px] text-rose-400 font-bold mt-2">請至少選擇一項任務</p>
              )}
            </div>
          </div>
        </div>
        
        <PomodoroHistory />
      </div>
    );
  }

  return (
    <div className={`rounded-3xl md:rounded-[48px] p-6 md:p-8 border shadow-2xl animate-in fade-in transition-colors duration-500 flex flex-col items-center justify-center min-h-[450px] md:min-h-[500px] relative overflow-hidden ${
      status === 'break' ? 'bg-emerald-50/80 border-emerald-100' :
      status === 'flow' ? 'bg-indigo-50/80 border-indigo-100' :
      'bg-sky-50/80 border-sky-100'
    }`}>
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] md:w-[600px] h-[300px] md:h-[600px] rounded-full blur-[60px] md:blur-[100px] ${isPaused ? '' : 'animate-pulse'} pointer-events-none ${
        status === 'break' ? 'bg-emerald-300/20' :
        status === 'flow' ? 'bg-indigo-300/20' :
        'bg-sky-300/20'
      }`} />

      <div className="absolute top-6 md:top-8 left-0 right-0 px-6 md:px-8 flex justify-between items-start z-10">
        <div className="flex flex-col">
          <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] ${
            status === 'break' ? 'text-emerald-400' :
            status === 'flow' ? 'text-indigo-400' :
            'text-sky-600'
          }`}>Status</span>
          <h2 className={`text-xl md:text-3xl font-black ${
            status === 'break' ? 'text-emerald-800' :
            status === 'flow' ? 'text-indigo-800' :
            'text-sky-800'
          }`}>
            {status === 'break' ? '休息時間' : status === 'flow' ? '心流中' : '專注中'}
          </h2>
        </div>
        <div className="text-right">
          <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Total</span>
          <p className="text-lg md:text-2xl font-black text-slate-600 font-mono">{formatFlowTime(totalAccumulated)}</p>
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center mb-8 md:mb-12 mt-4 md:mt-8">
        <div className={`text-[80px] md:text-[120px] leading-none font-black font-mono tracking-tighter drop-shadow-lg tabular-nums ${
            status === 'break' ? 'text-emerald-500' :
            status === 'flow' ? 'text-indigo-500' :
            'text-sky-500'
        }`}>
          {status === 'flow' ? formatFlowTime(currentSessionDuration) : formatTime(timeLeft)}
        </div>
        <p className={`text-sm md:text-lg font-bold mt-1 md:mt-2 ${
            status === 'break' ? 'text-emerald-600/60' :
            status === 'flow' ? 'text-indigo-600/60' :
            'text-sky-600/60'
        }`}>
          {status === 'flow' ? '享受心流時刻' : status === 'break' ? '深呼吸，放鬆一下' : '保持專注，你做得到'}
        </p>
      </div>

      <div className="relative z-10 mb-8 md:mb-12 max-w-sm md:max-w-md w-full animate-in slide-up">
        <div className="bg-white/40 backdrop-blur-sm rounded-2xl md:rounded-[32px] p-4 md:p-6 border border-white/40 shadow-sm">
          <div className="flex justify-between items-center mb-3 md:mb-4 px-1 md:px-2">
            <div className="w-8" />
            <p className="text-[8px] md:text-[10px] font-black text-slate-600 uppercase tracking-widest text-center">本次目標</p>
            <button
              onClick={() => setIsAddingTask(true)}
              className="p-1 md:p-1.5 bg-sky-500/10 text-sky-600 rounded-lg hover:bg-sky-500/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          </div>
          
          <div className="space-y-2 max-h-[180px] md:max-h-[240px] overflow-y-auto custom-scrollbar pr-1 md:pr-2">
            {sessionTasks.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-[10px] md:text-xs font-bold text-slate-400">目前沒有目標任務</p>
              </div>
            ) : (
              sessionTasks.map((task, index) => {
                const isInfinite = task.type === 'infinite';
                const isCompleted = completedSessionTaskIds.includes(task.id);
                const sessionCount = completedSessionTaskIds.filter(id => id === task.id).length;

                return (
                  <div key={task.id} className={`group flex items-center gap-2 md:gap-3 p-2.5 md:p-3 rounded-xl md:rounded-2xl transition-all border ${
                    !isInfinite && isCompleted ? 'bg-emerald-50/50 border-emerald-100' : 
                    isInfinite && sessionCount > 0 ? 'bg-sky-50/50 border-sky-100' :
                    'bg-white/60 border-transparent hover:border-sky-100 hover:bg-white'
                  }`}>
                    <button
                      onClick={() => handleSessionTaskComplete(task.id)}
                      className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-lg md:rounded-xl flex items-center justify-center transition-all ${
                        !isInfinite && isCompleted
                          ? 'bg-emerald-500 text-white shadow-lg scale-110'
                          : isInfinite && sessionCount > 0
                          ? 'bg-sky-500 text-white shadow-lg scale-110'
                          : 'bg-white border border-slate-100 text-slate-300 hover:text-sky-400'
                      }`}
                    >
                      {(!isInfinite && isCompleted) ? <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" /> : 
                       (isInfinite && sessionCount > 0) ? <Plus className="w-4 h-4 md:w-5 md:h-5" /> :
                       <span className="text-[10px] md:text-xs font-black">{index + 1}</span>}
                    </button>
                    <div className="flex-grow min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[11px] md:text-sm font-bold truncate ${!isInfinite && isCompleted ? 'text-emerald-700 line-through opacity-70' : 'text-slate-700'}`}>
                          {task.title}
                        </span>
                        {isInfinite && sessionCount > 0 && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleSessionTaskRevert(task.id); }}
                              className="p-0.5 text-rose-300 hover:text-rose-500 transition-colors"
                            >
                              <RotateCcw className="w-2.5 h-2.5 md:w-3 md:h-3" />
                            </button>
                            <span className="px-1 py-0.5 rounded-lg bg-sky-500/10 text-sky-600 text-[8px] md:text-[9px] font-black border border-sky-500/20">
                              ×{sessionCount}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {((!isInfinite && !isCompleted) || isInfinite) && (
                      <div className="flex items-center gap-0.5 md:gap-1 opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => removeSessionTask(task.id)}
                          className="p-1 text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-3 md:w-3.5 h-3 md:h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-4 md:gap-6">
        <button
          onClick={stopTimer}
          className="p-3.5 md:p-4 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-2xl md:rounded-[24px] shadow-lg border border-transparent transition-all hover:scale-110 active:scale-95"
        >
          <Square className="w-5 h-5 md:w-6 md:h-6 fill-current" />
        </button>

        <button
          onClick={togglePause}
          className={`p-5 md:p-6 rounded-[24px] md:rounded-[32px] shadow-xl text-white transition-all hover:scale-105 active:scale-95 ${
            status === 'break' ? 'bg-emerald-400 hover:bg-emerald-500' :
            status === 'flow' ? 'bg-indigo-400 hover:bg-indigo-500' :
            'bg-sky-400 hover:bg-sky-500'
          }`}
        >
          {isPaused ? <Play className="w-8 h-8 md:w-10 md:h-10 fill-current" /> : <Pause className="w-8 h-8 md:w-10 md:h-10 fill-current" />}
        </button>

        {status === 'focus' && (
          <React.Fragment>
            <button
              onClick={skipToBreak}
              className="p-3.5 md:p-4 bg-white hover:bg-emerald-50 text-slate-400 hover:text-emerald-500 rounded-2xl md:rounded-[24px] shadow-lg border border-transparent transition-all hover:scale-110 active:scale-95"
            >
              <FastForward className="w-5 h-5 md:w-6 md:h-6 fill-current" />
            </button>
            <button
              onClick={enterFlow}
              className="p-3.5 md:p-4 bg-white hover:bg-indigo-50 text-slate-400 hover:text-indigo-500 rounded-2xl md:rounded-[24px] shadow-lg border border-transparent transition-all hover:scale-110 active:scale-95"
            >
              <InfinityIcon className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </React.Fragment>
        )}
        
        {(status === 'flow' || status === 'break') && (
          <button
            onClick={status === 'flow' ? endFlow : skipToFocus}
            className="p-3.5 md:p-4 bg-white hover:bg-emerald-50 text-slate-400 hover:text-emerald-500 rounded-2xl md:rounded-[24px] shadow-lg border border-transparent transition-all hover:scale-110 active:scale-95"
          >
            <FastForward className="w-5 h-5 md:w-6 md:h-6 fill-current" />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showSummary && (
          <PomodoroSummary
            stats={sessionStats}
            onConfirm={() => {
              setShowSummary(false);
              setShowSettlement(true);
            }}
          />
        )}
      </AnimatePresence>

      {showSettlement && (
        <div className="absolute inset-0 z-50 bg-white/95 md:bg-white/90 backdrop-blur-xl flex flex-col items-center justify-center animate-in fade-in duration-500 p-6">
          <div className="text-center mb-8 md:mb-12">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-gradient-to-br from-amber-300 to-orange-500 rounded-2xl md:rounded-3xl mx-auto mb-4 md:mb-6 flex items-center justify-center shadow-2xl shadow-amber-200 rotate-12 shrink-0">
              <Trophy className="w-8 h-8 md:w-10 md:h-10 text-white" />
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-sky-900 mb-1 md:mb-2 tracking-tight">專注完成！</h2>
            <p className="text-xs md:text-sm text-sky-600 font-bold tracking-widest uppercase">本次成果結算</p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:gap-8 mb-8 md:mb-12 w-full max-w-lg">
            <div className="bg-sky-50 rounded-2xl md:rounded-[32px] p-4 md:p-6 text-center border border-sky-100">
              <span className="text-[8px] md:text-[10px] font-black text-sky-600 uppercase tracking-widest block mb-1 md:mb-2">專注時長</span>
              <p className="text-xl md:text-3xl font-black text-sky-800">{formatFlowTime(totalAccumulated)}</p>
            </div>
            <div className="bg-emerald-50 rounded-2xl md:rounded-[32px] p-4 md:p-6 text-center border border-emerald-100">
              <span className="text-[8px] md:text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-1 md:mb-2">完成任務</span>
              <p className="text-xl md:text-3xl font-black text-sky-800">{completedSessionTaskIds.length}</p>
            </div>
          </div>

          <div className="space-y-4 w-full max-w-sm">
            {(() => {
                const cappedTime = Math.min(totalAccumulated, 300 * 60);
                const n = Math.floor(cappedTime / (50 * 60));
                const timeChances = (n * (n + 1)) / 2;
                const totalTickets = timeChances + completedSessionTaskIds.length;
                
                if (totalTickets > 0) {
                  return (
                  <button
                    onClick={handleLottery}
                    className="w-full py-4 md:py-5 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white rounded-2xl md:rounded-[24px] font-black text-lg md:text-xl shadow-xl shadow-amber-200 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 md:gap-3"
                  >
                    <Gift className="w-5 h-5 md:w-6 md:h-6 animate-bounce" /> 領取 {totalTickets} 張抽卡券
                  </button>
                  );
                }
                return null;
            })()}
            
            <button
              onClick={handleSettlement}
              className="w-full py-3 md:py-4 bg-sky-100 hover:bg-sky-200 text-sky-700 rounded-2xl md:rounded-[24px] font-black text-base md:text-lg transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 md:gap-3"
            >
              <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" /> 結束
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pomodoro;