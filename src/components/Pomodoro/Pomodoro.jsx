import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Timer, Settings2, Target, CheckCircle2, ChevronUp, ChevronDown, Play, Square, Pause, FastForward, Trophy, Gift, Infinity as InfinityIcon, Plus, X, RotateCcw, BellOff, BellRing, Coffee
} from 'lucide-react';
import { useAppData } from '../../contexts/AppDataContext';
import { formatTime, formatFlowTime, calculatePomodoroStats, pomodoroWorkSeconds } from '../../utils/index.ts';
import { isPausedByAppClose, pomodoroClock } from '../../domain/pomodoroClock.ts';
import PomodoroSummary from './PomodoroSummary';
import PomodoroHistory from './PomodoroHistory';
import { completionRewardTickets } from '../../domain/tasks.ts';
import { addableSessionTasks, nextBreakInfo, normalizePomodoroSettings, POMODORO_RANGES, pomodoroCandidateTasks, pomodoroSettlementTickets, settlePomodoroTickets } from '../../domain/pomodoro.ts';
import AddSessionTaskPicker from './AddSessionTaskPicker';
import { sortTasksLikePlanList } from '../../shared/taskOrder.ts';

const Pomodoro = ({
  subTasks,
  onTaskComplete,
  onTaskRevert,
  // State from parent
  status, setStatus,
  settings, setSettings,
  timeLeft,
  selectedTaskIds, setSelectedTaskIds,
  sessionTasks, setSessionTasks,
  completedSessionTaskIds, setCompletedSessionTaskIds,
  isPaused, setIsPaused,
  // 以下兩個由 App 從時間軸算出（唯讀）：總專注（專注 + 心流）、目前階段已經過的秒數
  totalAccumulated,
  currentSessionDuration,
  cycles, setCycles,
  showSettlement, setShowSettlement,
  // New props for persistence
  sessionTimeline, setSessionTimeline,
  showSummary, setShowSummary,
  sessionStats, setSessionStats,
  sessionStartTimeRef,
  // 階段切換（由 App 層提供，與「時間到」自動切換共用）
  startFocus: startSharedFocus,
  startBreak,
  enterFlow,
  // 時間到、等你按「開始休息／開始專注」：{ next: 'break'|'focus' }，沒有在等就是 null
  awaiting = null,
  silenceAlarm,
  alarmMuted = false,
  setAlarmMuted,
}) => {
  const { data, updateData, addPomodoroRecord } = useAppData();

  const [isAddingTask, setIsAddingTask] = useState(false);

  // 設定一律經過整理再存（長休息的值保證是範圍內的整數）
  const updateSettings = (patch) => setSettings(prev => normalizePomodoroSettings({ ...prev, ...patch }));
  const longBreakSettings = normalizePomodoroSettings(settings);

  // 可選的「這次要做的任務」（成長維度、未完成；規則見 domain/pomodoro.ts，「＋」加入任務也用同一份）
  // 任務的先後和計畫清單一樣（使用者自己排的順序）
  const orderedSubTasks = useMemo(() => sortTasksLikePlanList(subTasks, data.majorTasks), [subTasks, data.majorTasks]);
  const candidateTasks = pomodoroCandidateTasks(orderedSubTasks);

  // 「時間到」的自動處理在 App 層（usePomodoroAutoAdvance），這裡不再監聽，避免重複觸發

  const addTimelineEvent = (type, extra = {}) => {
    setSessionTimeline(prev => [...prev, { type, time: new Date().toISOString(), ...extra }]);
  };

  // 從待機開始新的一輪；進入專注本身的狀態切換與自動切換共用同一份實作
  const startFocus = () => {
    if (status !== 'idle') {
      startSharedFocus();
      return;
    }
    const now = startSharedFocus({ newSession: true });
    sessionStartTimeRef.current = now;
    localStorage.setItem('pomodoroSessionStartTime', now);
    // 確保任務順序與選擇的順序一致
    const selectedTasks = selectedTaskIds.map(id => subTasks.find(t => t.id === id)).filter(Boolean);
    setSessionTasks(selectedTasks);
    setCompletedSessionTaskIds([]);
    setCycles(0);
  };

  // 從上一次休息之後累計的專注 + 心流秒數（用「現在」從時間軸算，進入休息時自動歸零）
  const currentCycleWork = (timeline = sessionTimeline) =>
    pomodoroClock({ timeline, nowMs: Date.now() }).cycleWork;

  const endFlow = () => {
    let newCycles = cycles;
    // 檢查專注+心流總時長是否達標
    if (currentCycleWork() >= settings.focus * 60) {
      newCycles += 1;
      setCycles(newCycles);
    }
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
    if ((status === 'focus' || status === 'flow') && currentCycleWork(finalTimeline) >= settings.focus * 60) {
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

    setIsAddingTask(false);
    setSessionStats(stats);
    addPomodoroRecord(stats);
    setShowSummary(true);
    setIsPaused(true);
  };

  // 這一輪的純專注秒數：和總結畫面、專注歷史同一個算法（同一條時間軸），時間給的券也用它
  const settledWorkSeconds = pomodoroWorkSeconds(sessionStats?.timeline);

  // 結算畫面上的券數：時間的券 + 這次完成的任務照各自設定的張數（紀錄已被撤銷或刪除的不算）
  const settlementTickets = pomodoroSettlementTickets({
    workSeconds: settledWorkSeconds,
    timeline: sessionTimeline,
    taskHistory: data.taskHistory,
  });

  // claim：true 是「領取」，false 是「結束」不領。兩種都要把這次的完成紀錄改成實際給的張數
  const handleSettlement = ({ claim = false } = {}) => {
    updateData(prev => {
      // 用最新的資料重算一次，畫面算好之後才被撤銷的紀錄不會被加券
      const { timeTickets, grants } = pomodoroSettlementTickets({
        workSeconds: settledWorkSeconds,
        timeline: sessionTimeline,
        taskHistory: prev.taskHistory,
      });
      return settlePomodoroTickets(prev, { grants, timeTickets, claim });
    });
    setStatus('idle');
    setCycles(0);
    setIsPaused(false);
    setSessionTasks([]);
    setCompletedSessionTaskIds([]);
    setShowSettlement(false);
    setShowSummary(false);
    setSelectedTaskIds([]);
    setAlarmMuted?.(false);
    // Clear local storage on settlement
    const keysToRemove = [
      'pomodoroStatus', 'pomodoroPhaseLength', 'pomodoroTimeLeft', 'pomodoroSelectedTaskIds',
      'pomodoroSessionTasks', 'pomodoroCompletedSessionTaskIds', 'pomodoroIsPaused',
      'pomodoroTotalAccumulated', 'pomodoroCurrentSessionDuration', 'pomodoroCycles',
      'pomodoroShowSettlement', 'pomodoroTimeline', 'pomodoroCurrentCycleWorkDuration',
      'pomodoroShowSummary', 'pomodoroSessionStats', 'pomodoroSessionStartTime', 'lastPomodoroTick',
      'pomodoroAlarmMuted'
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));
  };

  const handleLottery = () => handleSettlement({ claim: true });

  // 這個任務在這次番茄鐘裡最後一筆完成事件（撤銷時要撤的就是它）
  const lastCompletionEvent = (taskId) =>
    [...sessionTimeline].reverse().find(e => e.type === 'task_complete' && e.taskId === taskId);

  const removeLastCompletionEvent = (taskId) => {
    setSessionTimeline(prev => {
      const lastIdx = [...prev].reverse().findIndex(e => e.type === 'task_complete' && e.taskId === taskId);
      if (lastIdx === -1) return prev;
      const actualIdx = prev.length - 1 - lastIdx;
      return prev.filter((_, i) => i !== actualIdx);
    });
  };

  const handleSessionTaskComplete = (taskId) => {
    const task = sessionTasks.find(t => t.id === taskId);
    if (!task) return;

    // onTaskComplete 回傳 null 表示這次完成被拒絕（有未完成的優先任務、今天已完成等），
    // 這時不可標記完成、不寫時間軸，否則結算會多給券，再點一次還會撤銷到以前的真實紀錄
    const markCompleted = () => {
      // 先產生完成紀錄的 id，記在時間軸上：結算時靠它找到這筆紀錄、改成實際給的張數
      const recordId = crypto.randomUUID();
      const completed = onTaskComplete(taskId, { recordId });
      if (!completed) return;
      setCompletedSessionTaskIds(prev => [...prev, taskId]);
      addTimelineEvent('task_complete', {
        taskId,
        taskTitle: task?.title,
        recordId,
        // 照任務自己設定的張數（和在任務清單完成一樣），結算領取時才給
        rewardTickets: completionRewardTickets(completed),
      });
    };

    if (task.type === 'infinite') {
      markCompleted();
    } else {
      if (completedSessionTaskIds.includes(taskId)) {
        onTaskRevert(taskId, lastCompletionEvent(taskId)?.recordId);
        setCompletedSessionTaskIds(prev => prev.filter(id => id !== taskId));
        removeLastCompletionEvent(taskId);
      } else {
        markCompleted();
      }
    }
  };

  const handleSessionTaskRevert = (taskId) => {
    const task = sessionTasks.find(t => t.id === taskId);
    if (!task || task.type !== 'infinite') return;
    
    // 檢查本次對話中是否有完成紀錄
    const sessionCount = completedSessionTaskIds.filter(id => id === taskId).length;
    if (sessionCount <= 0) return;

    onTaskRevert(taskId, lastCompletionEvent(taskId)?.recordId);

    // 從已完成 ID 清單中移除一個
    setCompletedSessionTaskIds(prev => {
      const idx = prev.lastIndexOf(taskId);
      if (idx === -1) return prev;
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });

    // 從時間軸中移除最後一個相關事件
    removeLastCompletionEvent(taskId);
  };

  const skipToBreak = () => {
    if (status === 'focus' || status === 'flow') {
      let newCycles = cycles;
      // 只有在心流模式且時長達標時才計入完整番茄
      if (status === 'flow' && currentCycleWork() >= settings.focus * 60) {
        newCycles += 1;
        setCycles(newCycles);
      }
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
              <h2 className="text-2xl md:text-3xl font-black text-sky-900">專注計時</h2>
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
                    <label className="block text-[10px] md:text-xs font-bold text-sky-800 mb-2">每輪專注時間（分鐘）</label>
                    <input
                      type="range"
                      min="5"
                      max="90"
                      step="1"
                      value={settings.focus}
                      onChange={(e) => updateSettings({ focus: Number(e.target.value) })}
                      className="w-full accent-sky-500 h-1.5 md:h-2"
                    />
                    <div className="text-right text-lg md:text-xl font-black text-sky-700 mt-1">{settings.focus} 分鐘</div>
                  </div>
                  <div>
                    <label className="block text-[10px] md:text-xs font-bold text-sky-800 mb-2">休息時間（分鐘）</label>
                    <input
                      type="range"
                      min="1"
                      max="30"
                      value={settings.break}
                      onChange={(e) => updateSettings({ break: Number(e.target.value) })}
                      className="w-full accent-emerald-500 h-1.5 md:h-2"
                    />
                    <div className="text-right text-lg md:text-xl font-black text-emerald-600 mt-1">{settings.break} 分鐘</div>
                  </div>
                  {/* 長休息：每完成幾輪，那一次休息改用長休息的分鐘數 */}
                  <div className="pt-3 border-t border-white/60">
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-[10px] md:text-xs font-bold text-sky-800">長休息</span>
                      <input
                        type="checkbox"
                        checked={longBreakSettings.longBreakEnabled}
                        onChange={(e) => updateSettings({ longBreakEnabled: e.target.checked })}
                        className="w-4 h-4 accent-emerald-500 cursor-pointer"
                      />
                    </label>
                    {longBreakSettings.longBreakEnabled ? (
                      <div className="space-y-3 mt-3">
                        <div>
                          <label className="block text-[10px] md:text-xs font-bold text-sky-800 mb-2">長休息時間（分鐘）</label>
                          <input
                            type="range"
                            min={POMODORO_RANGES.longBreakMinutes.min}
                            max={POMODORO_RANGES.longBreakMinutes.max}
                            step="1"
                            value={longBreakSettings.longBreakMinutes}
                            onChange={(e) => updateSettings({ longBreakMinutes: Number(e.target.value) })}
                            className="w-full accent-emerald-500 h-1.5 md:h-2"
                          />
                          <div className="text-right text-lg md:text-xl font-black text-emerald-600 mt-1">{longBreakSettings.longBreakMinutes} 分鐘</div>
                        </div>
                        <div>
                          <label className="block text-[10px] md:text-xs font-bold text-sky-800 mb-2">每完成幾輪，休息一次長的</label>
                          <input
                            type="range"
                            min={POMODORO_RANGES.longBreakEvery.min}
                            max={POMODORO_RANGES.longBreakEvery.max}
                            step="1"
                            value={longBreakSettings.longBreakEvery}
                            onChange={(e) => updateSettings({ longBreakEvery: Number(e.target.value) })}
                            className="w-full accent-emerald-500 h-1.5 md:h-2"
                          />
                          <div className="text-right text-lg md:text-xl font-black text-emerald-600 mt-1">每 {longBreakSettings.longBreakEvery} 輪</div>
                        </div>
                        <p className="text-[10px] md:text-[11px] font-bold text-slate-500">
                          完成第 {longBreakSettings.longBreakEvery}、{longBreakSettings.longBreakEvery * 2}……輪後，休息 {longBreakSettings.longBreakMinutes} 分鐘
                        </p>
                      </div>
                    ) : (
                      <p className="mt-1 text-[10px] md:text-[11px] font-bold text-slate-500">未開啟：每次都休息 {settings.break} 分鐘</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-sky-50/50 rounded-2xl md:rounded-[32px] p-5 md:p-6 border border-sky-100">
                <div className="flex items-center gap-2 md:gap-3 mb-2">
                  <Gift className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
                  <span className="font-black text-sky-800 text-sm md:text-base">獎勵規則</span>
                </div>
                <p className="text-[10px] md:text-xs font-bold text-sky-800 leading-relaxed">
                  專注時間（含心流）累積滿 <span className="text-amber-600">50 分鐘</span>，
                  可獲得 <span className="text-amber-600">1 張</span> 抽卡券；
                  <br className="hidden md:block" />
                  滿 <span className="text-amber-600">100 分鐘</span>可獲得 <span className="text-amber-600">共 3 張（1＋2）</span>；
                  <br className="hidden md:block" />
                  滿 <span className="text-amber-600">150 分鐘</span>可獲得 <span className="text-amber-600">共 6 張（1＋2＋3）</span>……以此類推。
                  <br />
                  <span className="text-sky-700">* 心流：時間到也不停、想繼續就繼續計時（專注中按 ∞），這段時間也算專注時間</span>
                  <br />
                  <span className="text-rose-500 font-black">* 獎勵上限為 300 分鐘（21 張券）</span>
                  <br />
                  <span className="text-amber-600">* 在專注計時裡完成任務，照任務設定的張數給券，結算時和時間的券一起領取</span>
                  <br />
                  <span className="text-[8px] md:text-[10px] text-sky-700 italic">* 休息時間不算專注時間</span>
                </p>
              </div>
            </div>

            <div className="flex flex-col h-full min-h-[300px]">
              <div className="bg-white/40 rounded-2xl md:rounded-[32px] p-5 md:p-6 border border-white/40 flex-grow mb-4 md:mb-6 overflow-hidden flex flex-col">
                <h3 className="font-black text-sky-800 mb-3 md:mb-4 flex items-center gap-2 flex-shrink-0 text-sm md:text-base">
                  <Target className="w-4 h-4 md:w-5 md:h-5" /> 選擇這次要做的任務（只列成長類）
                </h3>
                <div className="overflow-y-auto custom-scrollbar flex-grow pr-2 space-y-2">
                  {candidateTasks.length === 0 ? (
                    <div className="text-center py-8 px-4 text-sky-500 font-bold text-xs md:text-sm">
                      <p>目前沒有未完成的成長任務</p>
                      <p className="mt-2 text-[10px] md:text-xs text-sky-400 leading-relaxed">可以直接開始專注，或先到「計畫清單」新增成長任務</p>
                    </div>
                  ) : (
                    candidateTasks.map(task => {
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
                                title="上移"
                                aria-label="上移"
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
                                title="下移"
                                aria-label="下移"
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
                disabled={candidateTasks.length > 0 && selectedTaskIds.length === 0}
                className="w-full py-4 md:py-5 bg-sky-500 hover:bg-sky-600 text-white rounded-2xl md:rounded-[24px] font-black text-lg md:text-xl shadow-lg shadow-sky-200 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" /> 開始專注
              </button>
              {candidateTasks.length > 0 && selectedTaskIds.length === 0 && (
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
          }`}>目前狀態</span>
          <h2 className={`text-xl md:text-3xl font-black ${
            status === 'break' ? 'text-emerald-800' :
            status === 'flow' ? 'text-indigo-800' :
            'text-sky-800'
          }`}>
            {awaiting ? (status === 'break' ? '休息結束' : '專注結束') : status === 'break' ? '休息時間' : status === 'flow' ? '心流中' : '專注中'}
          </h2>
        </div>
        <div className="text-right">
          <span className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">專注時間（含心流）</span>
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
          {awaiting
            ? (status === 'break' ? '休息時間到了，準備好就開始專注' : `時間到！完成第 ${cycles} 輪`)
            : status === 'flow' ? '享受心流時刻' : status === 'break' ? '深呼吸，放鬆一下' : '保持專注，你做得到'}
        </p>
        {isPausedByAppClose(sessionTimeline, isPaused) && (
          <p className="mt-2 px-4 py-2 rounded-2xl bg-white/70 border border-amber-200 text-[11px] md:text-xs font-bold text-amber-700 text-center">
            程式關閉期間不計時，已暫停在關閉時的剩餘時間；按 ▶ 繼續
          </p>
        )}
      </div>

      <div className="relative z-10 mb-8 md:mb-12 max-w-sm md:max-w-md w-full animate-in slide-up">
        <div className="bg-white/40 backdrop-blur-sm rounded-2xl md:rounded-[32px] p-4 md:p-6 border border-white/40 shadow-sm">
          <div className="flex justify-between items-center mb-3 md:mb-4 px-1 md:px-2">
            <div className="w-8" />
            <p className="text-[8px] md:text-[10px] font-black text-slate-600 uppercase tracking-widest text-center">這次要做的任務</p>
            <button
              onClick={() => setIsAddingTask(true)}
              title="加入任務"
              aria-label="加入任務"
              className="p-1 md:p-1.5 bg-sky-500/10 text-sky-600 rounded-lg hover:bg-sky-500/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </button>
          </div>
          
          <div className="space-y-2 max-h-[180px] md:max-h-[240px] overflow-y-auto custom-scrollbar pr-1 md:pr-2">
            {sessionTasks.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-[10px] md:text-xs font-bold text-slate-400">還沒有加入任務</p>
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
                      title={isInfinite ? '完成一次' : isCompleted ? '撤銷完成' : '完成'}
                      aria-label={isInfinite ? '完成一次' : isCompleted ? '撤銷完成' : '完成'}
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
                              title="撤銷最近一次完成"
                              aria-label="撤銷最近一次完成"
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
                    
                    {/* 這次已經完成過的任務不能移出清單（要先撤銷），否則畫面上的完成數會和結算的券數對不上 */}
                    {((!isInfinite && !isCompleted) || (isInfinite && sessionCount === 0)) && (
                      <div className="flex items-center gap-0.5 md:gap-1 opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => removeSessionTask(task.id)}
                          title="從這次的清單移除（任務本身不會刪掉）"
                          aria-label="從這次的清單移除（任務本身不會刪掉）"
                          className="p-1 text-slate-400 hover:text-rose-500"
                        >
                          <X className="w-3 md:w-3.5 h-3 md:h-3.5" />
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

      {awaiting ? (
        // 時間到：停在 00:00 等你按。等待的時間不算專注也不算休息，按下去才開始下一段
        <div className="relative z-10 flex flex-col items-center gap-3 md:gap-4 w-full max-w-sm md:max-w-md">
          <div className="flex items-center gap-3 md:gap-4 w-full">
            <button
              onClick={stopTimer}
              title="結束並結算"
              aria-label="結束並結算"
              className="p-3.5 md:p-4 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-2xl md:rounded-[24px] shadow-lg border border-transparent transition-all hover:scale-110 active:scale-95 shrink-0"
            >
              <Square className="w-5 h-5 md:w-6 md:h-6 fill-current" />
            </button>
            {awaiting.next === 'break' ? (() => {
              const info = nextBreakInfo(cycles, settings);
              return (
                <button
                  onClick={() => startBreak(cycles)}
                  autoFocus
                  className="flex-grow flex items-center justify-center gap-2 px-5 py-4 md:py-5 rounded-[24px] md:rounded-[32px] shadow-xl text-white font-black text-base md:text-lg bg-emerald-500 hover:bg-emerald-600 transition-all hover:scale-[1.02] active:scale-95"
                >
                  <Coffee className="w-5 h-5 md:w-6 md:h-6" />
                  {info.isLong ? '開始長休息' : '開始休息'}（{Math.round(info.seconds / 60)} 分鐘）
                </button>
              );
            })() : (
              <button
                onClick={skipToFocus}
                autoFocus
                className="flex-grow flex items-center justify-center gap-2 px-5 py-4 md:py-5 rounded-[24px] md:rounded-[32px] shadow-xl text-white font-black text-base md:text-lg bg-sky-500 hover:bg-sky-600 transition-all hover:scale-[1.02] active:scale-95"
              >
                <Play className="w-5 h-5 md:w-6 md:h-6 fill-current" />
                開始專注（{settings.focus} 分鐘）
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {alarmMuted ? (
              <span className="px-3 py-2 text-[11px] md:text-xs font-bold text-slate-400">鈴聲已關掉，按上面的按鈕繼續</span>
            ) : (
              <button
                onClick={silenceAlarm}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/80 hover:bg-white text-[11px] md:text-xs font-bold text-slate-500 hover:text-slate-700 shadow-sm transition-all"
              >
                <BellOff className="w-3.5 h-3.5" /> 先關掉鈴聲
              </button>
            )}
            {awaiting.next === 'break' && (
              <>
                <button
                  onClick={() => startFocus()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/80 hover:bg-white text-[11px] md:text-xs font-bold text-slate-500 hover:text-sky-600 shadow-sm transition-all"
                >
                  <FastForward className="w-3.5 h-3.5 fill-current" /> 跳過休息，直接專注
                </button>
                <button
                  onClick={enterFlow}
                  title="時間到也不停，繼續計時"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/80 hover:bg-white text-[11px] md:text-xs font-bold text-slate-500 hover:text-indigo-600 shadow-sm transition-all"
                >
                  <InfinityIcon className="w-3.5 h-3.5" /> 繼續心流
                </button>
              </>
            )}
          </div>
          {!alarmMuted && (
            <p className="flex items-center gap-1 text-[10px] md:text-[11px] font-bold text-amber-600/80">
              <BellRing className="w-3 h-3" /> 鈴聲會一直響，直到按下按鈕
            </p>
          )}
        </div>
      ) : (
      <div className="relative z-10 flex items-center gap-4 md:gap-6">
        <button
          onClick={stopTimer}
          title="結束並結算"
          aria-label="結束並結算"
          className="p-3.5 md:p-4 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-2xl md:rounded-[24px] shadow-lg border border-transparent transition-all hover:scale-110 active:scale-95"
        >
          <Square className="w-5 h-5 md:w-6 md:h-6 fill-current" />
        </button>

        <button
          onClick={togglePause}
          title={isPaused ? '繼續' : '暫停'}
          aria-label={isPaused ? '繼續' : '暫停'}
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
              title="提早休息（專注時間照算，但這一輪不算完成）"
              aria-label="提早休息（專注時間照算，但這一輪不算完成）"
              className="p-3.5 md:p-4 bg-white hover:bg-emerald-50 text-slate-400 hover:text-emerald-500 rounded-2xl md:rounded-[24px] shadow-lg border border-transparent transition-all hover:scale-110 active:scale-95"
            >
              <FastForward className="w-5 h-5 md:w-6 md:h-6 fill-current" />
            </button>
            <button
              onClick={enterFlow}
              title="進入心流：時間到也不停，繼續計時"
              aria-label="進入心流：時間到也不停，繼續計時"
              className="p-3.5 md:p-4 bg-white hover:bg-indigo-50 text-slate-400 hover:text-indigo-500 rounded-2xl md:rounded-[24px] shadow-lg border border-transparent transition-all hover:scale-110 active:scale-95"
            >
              <InfinityIcon className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </React.Fragment>
        )}
        
        {(status === 'flow' || status === 'break') && (
          <button
            onClick={status === 'flow' ? endFlow : skipToFocus}
            title={status === 'flow' ? '結束心流，開始休息' : '跳過休息，開始專注'}
            aria-label={status === 'flow' ? '結束心流，開始休息' : '跳過休息，開始專注'}
            className="p-3.5 md:p-4 bg-white hover:bg-emerald-50 text-slate-400 hover:text-emerald-500 rounded-2xl md:rounded-[24px] shadow-lg border border-transparent transition-all hover:scale-110 active:scale-95"
          >
            <FastForward className="w-5 h-5 md:w-6 md:h-6 fill-current" />
          </button>
        )}
      </div>
      )}

      {/* 進行中加入任務（專注、心流、休息都可以）；只是畫面上的清單，不影響計時 */}
      {isAddingTask && !showSummary && !showSettlement && (
        <AddSessionTaskPicker
          tasks={addableSessionTasks(orderedSubTasks, sessionTasks)}
          onAdd={addSessionTask}
          onClose={() => setIsAddingTask(false)}
        />
      )}

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
              <span className="text-[8px] md:text-[10px] font-black text-sky-600 uppercase tracking-widest block mb-1 md:mb-2">專注時間（含心流）</span>
              <p className="text-xl md:text-3xl font-black text-sky-800">{formatFlowTime(settledWorkSeconds)}</p>
            </div>
            <div className="bg-emerald-50 rounded-2xl md:rounded-[32px] p-4 md:p-6 text-center border border-emerald-100">
              <span className="text-[8px] md:text-[10px] font-black text-emerald-400 uppercase tracking-widest block mb-1 md:mb-2">完成任務</span>
              <p className="text-xl md:text-3xl font-black text-sky-800">{completedSessionTaskIds.length}</p>
            </div>
          </div>

          <div className="space-y-4 w-full max-w-sm">
            {settlementTickets.total > 0 && (
              <div>
                <button
                  onClick={handleLottery}
                  className="w-full py-4 md:py-5 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white rounded-2xl md:rounded-[24px] font-black text-lg md:text-xl shadow-xl shadow-amber-200 transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 md:gap-3"
                >
                  <Gift className="w-5 h-5 md:w-6 md:h-6 animate-bounce" /> 領取 {settlementTickets.total} 張抽卡券
                </button>
                <p className="text-center text-[10px] md:text-xs font-bold text-sky-600 mt-2">
                  專注時間 {settlementTickets.timeTickets} 張 ＋ 完成任務 {settlementTickets.taskTickets} 張（照各任務設定的張數）
                </p>
              </div>
            )}

            <button
              onClick={() => handleSettlement({ claim: false })}
              className="w-full py-3 md:py-4 bg-sky-100 hover:bg-sky-200 text-sky-700 rounded-2xl md:rounded-[24px] font-black text-base md:text-lg transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 md:gap-3"
            >
              <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" /> {settlementTickets.total > 0 ? '不領取，直接結束' : '結束'}
            </button>
            {settlementTickets.total > 0 && (
              <p className="text-center text-[10px] md:text-xs font-bold text-rose-400">
                這次的 {settlementTickets.total} 張抽卡券會作廢
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Pomodoro;