import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun, Layers, LayoutDashboard, Trophy, Settings2, Sparkles, Star, Search, CheckCircle2, X, Tag, RefreshCw
} from 'lucide-react';

// Context & Hooks
import { useAppData } from './contexts/AppDataContext';

// Utils & Constants
import { generateTeethPath } from './utils';

// Components
import IpcImage from './components/Shared/IpcImage';
import IndicatorsView from './components/Indicators/IndicatorsView';
import TasksView from './components/Tasks/TasksView';
import RewardsView from './components/Rewards/RewardsView';
import MultiRewardReveal from './components/Rewards/MultiRewardReveal';
import SettingsView from './components/Settings/SettingsView';
import Pomodoro from './components/Pomodoro/Pomodoro';
import RarityBadge from './components/Shared/RarityBadge';
import CalendarView from './components/Calendar/CalendarView';
import NoteView from './components/Note/NoteView';
import RulesView from './components/Rules/RulesView';
import TasksHistory from './components/Tasks/TasksHistory';

import TaskEditor from './components/Tasks/TaskEditor';
import HistoryEditor from './components/Rewards/HistoryEditor';
import TaskHistoryEditor from './components/Tasks/TaskHistoryEditor';
import NoteEditor from './components/Note/NoteEditor';
import PriorityManager from './components/Tasks/PriorityManager';


const App = () => {
  const {
    data, updateData, isLoading, getIndicatorStats, completeSubTaskData,
    revertTaskCompletion, addLotteryTickets, ticketNotification, setTicketNotification,
    isSyncing, syncProgress, setIsSyncing
  } = useAppData();

  // --- UI State ---
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'indicators');
  const [rewardSubTab, setRewardSubTab] = useState(() => localStorage.getItem('rewardSubTab') || 'lottery');
  const [taskSubTab, setTaskSubTab] = useState(() => localStorage.getItem('taskSubTab') || 'list');
  const [calendarDate, setCalendarDate] = useState(new Date());
  
  const [rewardToShow, setRewardToShow] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editingHistory, setEditingHistory] = useState(null);
  const [editingTaskHistory, setEditingTaskHistory] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [isPriorityManagerOpen, setIsPriorityManagerOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [rewardStage, setRewardStage] = useState('pack');
  const [blurImages, setBlurImages] = useState(true);
  const [claimQuantity, setClaimQuantity] = useState(1);

  useEffect(() => {
    // 預設領取數量設為 1
    setClaimQuantity(1);
  }, [rewardToShow]);

  // --- Pomodoro State ---
  const [pomodoroStatus, setPomodoroStatus] = useState(() => localStorage.getItem('pomodoroStatus') || 'idle');
  const [pomodoroSettings, setPomodoroSettings] = useState(() => {
    const saved = localStorage.getItem('pomodoroSettings');
    return saved ? JSON.parse(saved) : { focus: 25, break: 5 };
  });
  const [pomodoroTimeLeft, setPomodoroTimeLeft] = useState(() => Number(localStorage.getItem('pomodoroTimeLeft')) || 25 * 60);
  const [pomodoroSelectedTaskIds, setPomodoroSelectedTaskIds] = useState(() => {
    const saved = localStorage.getItem('pomodoroSelectedTaskIds');
    return saved ? JSON.parse(saved) : [];
  });
  const [pomodoroSessionTasks, setPomodoroSessionTasks] = useState(() => {
    const saved = localStorage.getItem('pomodoroSessionTasks');
    return saved ? JSON.parse(saved) : [];
  });
  const [pomodoroCompletedSessionTaskIds, setPomodoroCompletedSessionTaskIds] = useState(() => {
    const saved = localStorage.getItem('pomodoroCompletedSessionTaskIds');
    return saved ? JSON.parse(saved) : [];
  });
  const [pomodoroIsPaused, setPomodoroIsPaused] = useState(() => localStorage.getItem('pomodoroIsPaused') === 'true');
  const [pomodoroTotalAccumulated, setPomodoroTotalAccumulated] = useState(() => Number(localStorage.getItem('pomodoroTotalAccumulated')) || 0);
  const [pomodoroCurrentSessionDuration, setPomodoroCurrentSessionDuration] = useState(() => Number(localStorage.getItem('pomodoroCurrentSessionDuration')) || 0);
  const [pomodoroCycles, setPomodoroCycles] = useState(() => Number(localStorage.getItem('pomodoroCycles')) || 0);
  const [pomodoroShowSettlement, setPomodoroShowSettlement] = useState(() => localStorage.getItem('pomodoroShowSettlement') === 'true');
  
  // --- Pomodoro Background Persistence ---
  const [pomodoroTimeline, setPomodoroTimeline] = useState(() => {
    const saved = localStorage.getItem('pomodoroTimeline');
    return saved ? JSON.parse(saved) : [];
  });
  const [pomodoroCurrentCycleWorkDuration, setPomodoroCurrentCycleWorkDuration] = useState(() => Number(localStorage.getItem('pomodoroCurrentCycleWorkDuration')) || 0);
  const [pomodoroShowSummary, setPomodoroShowSummary] = useState(() => localStorage.getItem('pomodoroShowSummary') === 'true');
  const [pomodoroSessionStats, setPomodoroSessionStats] = useState(() => {
    const saved = localStorage.getItem('pomodoroSessionStats');
    return saved ? JSON.parse(saved) : null;
  });
  const pomodoroSessionStartTimeRef = useRef(localStorage.getItem('pomodoroSessionStartTime'));

  // Persist UI State
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('rewardSubTab', rewardSubTab);
  }, [rewardSubTab]);

  useEffect(() => {
    localStorage.setItem('taskSubTab', taskSubTab);
  }, [taskSubTab]);

  // Persist Pomodoro State
  useEffect(() => {
    localStorage.setItem('pomodoroStatus', pomodoroStatus);
    localStorage.setItem('pomodoroSettings', JSON.stringify(pomodoroSettings));
    localStorage.setItem('pomodoroTimeLeft', pomodoroTimeLeft);
    localStorage.setItem('pomodoroSelectedTaskIds', JSON.stringify(pomodoroSelectedTaskIds));
    localStorage.setItem('pomodoroSessionTasks', JSON.stringify(pomodoroSessionTasks));
    localStorage.setItem('pomodoroCompletedSessionTaskIds', JSON.stringify(pomodoroCompletedSessionTaskIds));
    localStorage.setItem('pomodoroIsPaused', pomodoroIsPaused);
    localStorage.setItem('pomodoroTotalAccumulated', pomodoroTotalAccumulated);
    localStorage.setItem('pomodoroCurrentSessionDuration', pomodoroCurrentSessionDuration);
    localStorage.setItem('pomodoroCycles', pomodoroCycles);
    localStorage.setItem('pomodoroShowSettlement', pomodoroShowSettlement);
    localStorage.setItem('pomodoroTimeline', JSON.stringify(pomodoroTimeline));
    localStorage.setItem('pomodoroCurrentCycleWorkDuration', pomodoroCurrentCycleWorkDuration);
    localStorage.setItem('pomodoroShowSummary', pomodoroShowSummary);
    localStorage.setItem('pomodoroSessionStats', JSON.stringify(pomodoroSessionStats));
    if (pomodoroSessionStartTimeRef.current) localStorage.setItem('pomodoroSessionStartTime', pomodoroSessionStartTimeRef.current);
    localStorage.setItem('lastPomodoroTick', new Date().getTime());
  }, [
    pomodoroStatus, pomodoroSettings, pomodoroTimeLeft, pomodoroSelectedTaskIds,
    pomodoroSessionTasks, pomodoroCompletedSessionTaskIds, pomodoroIsPaused,
    pomodoroTotalAccumulated, pomodoroCurrentSessionDuration, pomodoroCycles,
    pomodoroShowSettlement, pomodoroTimeline, pomodoroCurrentCycleWorkDuration,
    pomodoroShowSummary, pomodoroSessionStats
  ]);

  // Handle "Offline" time during refresh
  useEffect(() => {
    if (pomodoroStatus !== 'idle' && !pomodoroIsPaused) {
      const lastTick = Number(localStorage.getItem('lastPomodoroTick'));
      if (lastTick) {
        const now = new Date().getTime();
        const diffSeconds = Math.floor((now - lastTick) / 1000);
        
        if (diffSeconds > 0) {
          if (pomodoroStatus === 'focus' || pomodoroStatus === 'break') {
            setPomodoroTimeLeft(prev => Math.max(0, prev - diffSeconds));
            if (pomodoroStatus === 'focus') {
              setPomodoroTotalAccumulated(prev => prev + diffSeconds);
              setPomodoroCurrentSessionDuration(prev => prev + diffSeconds);
              setPomodoroCurrentCycleWorkDuration(prev => prev + diffSeconds);
            }
          } else if (pomodoroStatus === 'flow') {
            setPomodoroTotalAccumulated(prev => prev + diffSeconds);
            setPomodoroCurrentSessionDuration(prev => prev + diffSeconds);
            setPomodoroCurrentCycleWorkDuration(prev => prev + diffSeconds);
          }
        }
      }
    }
  }, []); // Only on mount

  useEffect(() => {
    let interval = null;
    if (pomodoroStatus !== 'idle' && !pomodoroIsPaused && !pomodoroShowSettlement && !pomodoroShowSummary) {
      interval = setInterval(() => {
        if (pomodoroStatus === 'focus' || pomodoroStatus === 'break') {
          setPomodoroTimeLeft(prev => {
            if (prev <= 1) {
              // 這裡需要觸發完成邏輯，我們透過狀態變更讓 Pomodoro 元件處理或在此實作
              return 0;
            }
            return prev - 1;
          });
          if (pomodoroStatus === 'focus') {
            setPomodoroCurrentSessionDuration(prev => prev + 1);
            setPomodoroTotalAccumulated(prev => prev + 1);
            setPomodoroCurrentCycleWorkDuration(prev => prev + 1);
          }
        } else if (pomodoroStatus === 'flow') {
          setPomodoroCurrentSessionDuration(prev => prev + 1);
          setPomodoroTotalAccumulated(prev => prev + 1);
          setPomodoroCurrentCycleWorkDuration(prev => prev + 1);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [pomodoroStatus, pomodoroIsPaused, pomodoroShowSettlement, pomodoroShowSummary]);

  const skipLottery = () => {
    if (!rewardToShow) return;
    updateData(prev => ({ ...prev, rewardHistory: prev.rewardHistory.filter(h => h.id !== rewardToShow.id) }));
    setRewardToShow(null);
  };

  const handleCompleteSubTask = (id) => {
    const task = completeSubTaskData(id);
    if (task) {
      const ticketsToAdd = task.rewardTickets || 1;
      addLotteryTickets(ticketsToAdd);
      setTicketNotification({ count: ticketsToAdd, type: 'gain', id: crypto.randomUUID() });
    }
  };

  const handleCancelSync = async () => {
    if (window.electronAPI && window.electronAPI.cancelCloudSync) {
        await window.electronAPI.cancelCloudSync();
        // 雖然主程序會結束迴圈，但我們也可以在前端先提示中斷中
    }
  };

  if (isLoading) return (
    <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-100 to-white flex items-center justify-center">
      <div className="text-center">
        <Sun className="w-16 h-16 text-amber-400 animate-spin mx-auto mb-4" />
        <p className="text-sky-600 font-black text-xl">載入中...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-100 to-white text-sky-950 font-sans selection:bg-sky-200 selection:text-sky-900">
      
      {/* 全局同步進度面板 */}
      <AnimatePresence>
        {isSyncing && syncProgress && (
            <motion.div 
                initial={{ y: 100, x: '-50%', opacity: 0 }}
                animate={{ y: 0, x: '-50%', opacity: 1 }}
                exit={{ y: 100, x: '-50%', opacity: 0 }}
                className="fixed bottom-8 left-1/2 z-[1000] w-full max-w-md px-6 pointer-events-auto"
            >
                <div className="bg-white/90 backdrop-blur-2xl rounded-[32px] border-2 border-sky-400 shadow-[0_20px_50px_rgba(14,165,233,0.3)] p-6 space-y-4 relative overflow-hidden group">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center">
                                <RefreshCw className="w-4 h-4 text-sky-500 animate-spin" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">系統同步中</span>
                                <span className="text-sm font-black text-sky-900 line-clamp-1">{syncProgress.message}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {syncProgress.total > 0 && (
                                <span className="text-xs font-black text-sky-500 bg-sky-50 px-2 py-1 rounded-lg">
                                    {syncProgress.current} / {syncProgress.total}
                                </span>
                            )}
                            <button 
                                onClick={handleCancelSync}
                                className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors"
                                title="中斷同步"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    {syncProgress.total > 0 && (
                        <div className="w-full h-2.5 bg-sky-100 rounded-full overflow-hidden shadow-inner border border-sky-50">
                            <motion.div 
                                className="h-full bg-gradient-to-r from-sky-400 to-sky-600"
                                initial={{ width: 0 }}
                                animate={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>
                    )}
                </div>
            </motion.div>
        )}
      </AnimatePresence>

      {/* 迷你懸浮計時器 (當不在番茄鐘頁面且正在計時時顯示) */}
      <AnimatePresence>
        {pomodoroStatus !== 'idle' && (activeTab !== 'tasks' || taskSubTab !== 'pomodoro') && (
          <motion.div
            initial={{ y: -100, x: '-50%', opacity: 0 }}
            animate={{ y: 0, x: '-50%', opacity: 1 }}
            exit={{ y: -100, x: '-50%', opacity: 0 }}
            className="fixed top-2 md:top-4 left-1/2 z-[100] px-4 md:px-6 py-1.5 md:py-2 bg-white/80 backdrop-blur-xl rounded-full border border-white shadow-2xl flex items-center gap-3 md:gap-4 cursor-pointer hover:bg-white transition-colors"
            onClick={() => { setActiveTab('tasks'); setTaskSubTab('pomodoro'); }}
          >
            <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${pomodoroIsPaused ? 'bg-slate-300' : (pomodoroStatus === 'break' ? 'bg-emerald-400' : 'bg-sky-400')} ${!pomodoroIsPaused && 'animate-pulse'}`} />
            <div className="flex flex-col">
              <span className="text-[6px] md:text-[8px] font-black text-slate-400 uppercase leading-none">{pomodoroStatus === 'break' ? '休息中' : '專注中'}</span>
              <span className="text-xs md:text-sm font-black text-sky-900 font-mono leading-none mt-0.5">
                {pomodoroStatus === 'flow' ? '心流中' : (Math.floor(pomodoroTimeLeft / 60) + ':' + (pomodoroTimeLeft % 60).toString().padStart(2, '0'))}
              </span>
            </div>
            {pomodoroStatus === 'focus' && (
              <div className="w-12 md:w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 transition-all duration-1000"
                  style={{ width: `${(pomodoroTimeLeft / (pomodoroSettings.focus * 60)) * 100}%` }}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[10%] left-[15%] w-96 h-96 bg-white/40 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[20%] right-[10%] w-[500px] h-[500px] bg-blue-400/10 blur-[150px] rounded-full" />
        <div className="absolute top-[40%] right-[20%] w-32 h-32 bg-amber-200/20 blur-[60px] rounded-full" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8 md:px-6 md:py-12 max-w-7xl">
        <header className="flex flex-col lg:flex-row justify-between items-center mb-10 md:mb-16 gap-8">
          <div className="text-center lg:text-left group cursor-default">
            <div className="flex items-center justify-center lg:justify-start gap-3 mb-1">
              <Sun className="w-8 h-8 md:w-10 md:h-10 text-amber-400 animate-[spin_10s_linear_infinite]" />
              <h1 className="text-4xl md:text-5xl font-black text-sky-900 tracking-tighter">LifeSync</h1>
            </div>
            <p className="text-sky-400 font-black tracking-[0.4em] uppercase text-[8px] md:text-[10px] ml-1">Blue Sky Thinking</p>
          </div>
          <nav className="relative flex items-center gap-1 p-1 md:p-1.5 bg-white/40 backdrop-blur-xl rounded-full md:rounded-[32px] border border-white/60 shadow-lg overflow-hidden w-full max-w-md lg:min-w-[400px]">
            <div
              className="absolute top-1 md:top-1.5 bottom-1 md:bottom-1.5 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] bg-sky-500 rounded-full md:rounded-[24px] shadow-lg shadow-sky-200/50"
              style={(() => {
                const tabs = ['indicators', 'tasks', 'rewards', 'settings'];
                const activeIdx = tabs.indexOf(activeTab);
                return {
                  width: 'calc(25% - 6px)',
                  left: `calc(${activeIdx * 25}% + 3px)`,
                  opacity: activeIdx === -1 ? 0 : 1
                };
              })()}
            />
            {[
              { id: 'indicators', name: '維度', icon: <Layers className="w-4 h-4" /> },
              { id: 'tasks', name: '規劃', icon: <LayoutDashboard className="w-4 h-4" /> },
              {
                id: 'rewards',
                name: '獎勵庫',
                icon: <Trophy className="w-4 h-4" />,
                badge: data.rewardHistory.filter(h => !h.claimed).length + data.achievements.filter(a => {
                  const currentCount = getIndicatorStats(a.type);
                  return currentCount >= a.condition && !a.claimed;
                }).length
              },
              { id: 'settings', name: '設定', icon: <Settings2 className="w-4 h-4" /> },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 md:gap-2 py-2.5 md:py-3.5 rounded-full md:rounded-[24px] text-[10px] md:text-xs font-black transition-all duration-500 whitespace-nowrap ${activeTab === tab.id ? 'text-white scale-105' : 'text-sky-600 hover:bg-white/40'}`}
              >
                {tab.icon}
                <span className="relative hidden sm:inline">
                  {tab.name}
                  {tab.badge > 0 && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute -top-2 -right-3 flex items-center justify-center min-w-[14px] h-[14px] px-1 bg-gradient-to-tr from-rose-500 to-rose-400 text-white text-[8px] font-black rounded-full shadow-[0_2px_8px_rgba(244,63,94,0.4)] border border-white/40"
                    >
                      {tab.badge}
                    </motion.span>
                  )}
                </span>
                {tab.badge > 0 && (
                  <span className="sm:hidden absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full border border-white" />
                )}
              </button>
            ))}
          </nav>
        </header>

        <main className="animate-in fade-in duration-700 pb-20">
          {activeTab === 'indicators' && <IndicatorsView setEditingTask={setEditingTask} />}
          {activeTab === 'tasks' && (
            <div className="space-y-6 md:space-y-10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-4">
                <div className="flex items-center gap-4 md:gap-5">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-[2rem] bg-white/40 backdrop-blur-2xl border border-white/60 flex items-center justify-center shadow-xl shadow-sky-100/50 text-sky-500 shrink-0">
                    <LayoutDashboard className="w-6 h-6 md:w-8 md:h-8" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl md:text-4xl font-black text-sky-900 tracking-tight">行動藍圖</h2>
                    <nav className="relative flex gap-4 md:gap-6 mt-2 px-1 overflow-x-auto no-scrollbar pb-1">
                      {[
                        { id: 'list', name: '計畫清單' },
                        { id: 'pomodoro', name: '專注計時' },
                        { id: 'history', name: '任務歷史' },
                        { id: 'calendar', name: '日程視圖' },
                        { id: 'note', name: '生活筆記' },
                        { id: 'rules', name: '行為準則' }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setTaskSubTab(tab.id)}
                          className={`relative text-xs md:text-sm font-black transition-all py-1 whitespace-nowrap ${taskSubTab === tab.id ? 'text-sky-600' : 'text-sky-500 hover:text-sky-600'}`}
                        >
                          {tab.name}
                          {taskSubTab === tab.id && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-sky-500 rounded-full animate-in zoom-in-x duration-300" />
                          )}
                        </button>
                      ))}
                    </nav>
                  </div>
                </div>
              </div>

              {taskSubTab === 'list' && (
                <TasksView
                  setEditingTask={setEditingTask}
                  setIsPriorityManagerOpen={setIsPriorityManagerOpen}
                  onCompleteSubTask={handleCompleteSubTask}
                />
              )}
              {taskSubTab === 'pomodoro' && (
                <Pomodoro
                  subTasks={data.subTasks}
                  onTaskComplete={(taskId) => completeSubTaskData(taskId)}
                  onTaskRevert={(taskId) => revertTaskCompletion(taskId, true)}
                  status={pomodoroStatus} setStatus={setPomodoroStatus}
                  settings={pomodoroSettings} setSettings={setPomodoroSettings}
                  timeLeft={pomodoroTimeLeft} setTimeLeft={setPomodoroTimeLeft}
                  selectedTaskIds={pomodoroSelectedTaskIds} setSelectedTaskIds={setPomodoroSelectedTaskIds}
                  sessionTasks={pomodoroSessionTasks} setSessionTasks={setPomodoroSessionTasks}
                  completedSessionTaskIds={pomodoroCompletedSessionTaskIds} setCompletedSessionTaskIds={setPomodoroCompletedSessionTaskIds}
                  isPaused={pomodoroIsPaused} setIsPaused={setPomodoroIsPaused}
                  totalAccumulated={pomodoroTotalAccumulated} setTotalAccumulated={setPomodoroTotalAccumulated}
                  currentSessionDuration={pomodoroCurrentSessionDuration} setCurrentSessionDuration={setPomodoroCurrentSessionDuration}
                  cycles={pomodoroCycles} setCycles={setPomodoroCycles}
                  showSettlement={pomodoroShowSettlement} setShowSettlement={setPomodoroShowSettlement}
                  sessionTimeline={pomodoroTimeline} setSessionTimeline={setPomodoroTimeline}
                  currentCycleWorkDuration={pomodoroCurrentCycleWorkDuration} setCurrentCycleWorkDuration={setPomodoroCurrentCycleWorkDuration}
                  showSummary={pomodoroShowSummary} setShowSummary={setPomodoroShowSummary}
                  sessionStats={pomodoroSessionStats} setSessionStats={setPomodoroSessionStats}
                  sessionStartTimeRef={pomodoroSessionStartTimeRef}
                />
              )}
              {taskSubTab === 'history' && <TasksHistory setEditingTaskHistory={setEditingTaskHistory} />}
              {taskSubTab === 'calendar' && <CalendarView calendarDate={calendarDate} setCalendarDate={setCalendarDate} setEditingTask={setEditingTask} />}
              {taskSubTab === 'note' && <NoteView setEditingNote={setEditingNote} />}
              {taskSubTab === 'rules' && <RulesView />}
            </div>
          )}
          {activeTab === 'rewards' && (
            <RewardsView
              rewardSubTab={rewardSubTab}
              setRewardSubTab={setRewardSubTab}
              setEditingHistory={setEditingHistory}
              setRewardToShow={setRewardToShow}
              setRewardStage={setRewardStage}
              isScanning={isScanning}
              setIsScanning={setIsScanning}
              blurImages={blurImages}
              setBlurImages={setBlurImages}
            />
          )}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {editingTask && <TaskEditor editingTask={editingTask} setEditingTask={setEditingTask} />}
      {editingHistory && <HistoryEditor editingHistory={editingHistory} setEditingHistory={setEditingHistory} />}
      {editingTaskHistory && <TaskHistoryEditor editingTaskHistory={editingTaskHistory} setEditingTaskHistory={setEditingTaskHistory} />}
      {editingNote && <NoteEditor editingNote={editingNote} setEditingNote={setEditingNote} />}
      <PriorityManager isOpen={isPriorityManagerOpen} onClose={() => setIsPriorityManagerOpen(false)} />

      {lightboxImage && (
        <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 animate-in fade-in duration-300 cursor-zoom-out" onClick={() => setLightboxImage(null)}>
          <button className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-[510]" onClick={(e) => { e.stopPropagation(); setLightboxImage(null); }}><X className="w-8 h-8" /></button>
          <IpcImage
            src={lightboxImage}
            className="max-w-full max-h-full object-contain shadow-2xl animate-in zoom-in-95 duration-300"
          />
        </div>
      )}

      <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[400] pointer-events-none">
        <AnimatePresence>
          {ticketNotification && (
            <motion.div
              key={ticketNotification.id}
              initial={{ opacity: 0, y: 50, scale: 0.5 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -50, scale: 0.5 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            >
              <div className={`px-8 py-4 rounded-3xl shadow-2xl border-2 border-white/50 flex items-center gap-4 ${
                ticketNotification.type === 'loss'
                  ? 'bg-gradient-to-r from-rose-500 to-red-600 shadow-rose-500/40'
                  : 'bg-gradient-to-r from-amber-400 to-orange-500 shadow-amber-500/40'
              }`}>
                <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-inner">
                  <Tag className={`w-7 h-7 text-white fill-current ${ticketNotification.type === 'loss' ? 'animate-pulse' : 'animate-bounce'}`} />
                </div>
                <div className="text-white">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-80 leading-none mb-1">
                    {ticketNotification.type === 'loss' ? 'Reward Reverted' : 'Reward Earned'}
                  </p>
                  <p className="text-xl font-black leading-none whitespace-nowrap">
                    {ticketNotification.type === 'loss' ? '收回' : '獲得'} {ticketNotification.count} 張抽卡券
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {rewardToShow && rewardToShow.isMulti && (
        <MultiRewardReveal
          results={rewardToShow.results}
          setLightboxImage={setLightboxImage}
          onClaimAll={() => {
            updateData(prev => ({
              ...prev,
              rewardHistory: prev.rewardHistory.map(h =>
                rewardToShow.results.some(r => r.id === h.id) ? { ...h, claimed: true, claimedAt: new Date().toISOString() } : h
              )
            }));
            setRewardToShow(null);
          }}
          onCancel={() => setRewardToShow(null)}
        />
      )}

      {rewardToShow && !rewardToShow.isMulti && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-sky-950/80 backdrop-blur-3xl p-6 animate-in fade-in duration-500">
          <div className="absolute inset-0 overflow-hidden pointer-events-none"><div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[100px] transition-all duration-1000 ${rewardStage === 'revealed' ? (rewardToShow.rarity === 'UR' ? 'bg-rose-500/30' : rewardToShow.rarity === 'SSR' ? 'bg-amber-500/30' : rewardToShow.rarity === 'SR' ? 'bg-purple-500/30' : rewardToShow.rarity === 'R' ? 'bg-sky-500/30' : 'bg-slate-500/30') : 'bg-sky-500/10'}`} /></div>
          <div className={`fixed inset-0 bg-white z-[250] pointer-events-none transition-opacity duration-1000 ${rewardStage === 'opening' ? 'opacity-100' : 'opacity-0'}`} />
          {rewardStage !== 'revealed' && (
            <div className={`relative w-64 h-96 cursor-pointer transition-all duration-500 ${rewardStage === 'opening' ? 'scale-110' : 'hover:scale-105 animate-float'}`} onClick={() => { if (rewardStage === 'pack') { setRewardStage('opening'); setTimeout(() => setRewardStage('revealed'), 1000); } }}>
              <div className={`absolute top-[22%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-white shadow-[0_0_100px_50px_rgba(255,255,255,0.8)] rounded-full transition-all duration-1000 z-0 ${rewardStage === 'opening' ? 'scale-[50] opacity-100' : 'scale-0 opacity-0'}`} />
              <div className={`absolute left-1/2 -translate-x-1/2 w-48 h-72 rounded-xl shadow-2xl z-[5] transition-all duration-1000 ease-out ${rewardStage === 'opening' ? '-top-24 scale-100 rotate-0' : 'top-12 scale-95 rotate-3'}`} style={{ background: rewardToShow.rarity === 'UR' ? 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)' : rewardToShow.rarity === 'SSR' ? 'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)' : rewardToShow.rarity === 'SR' ? 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)' : rewardToShow.rarity === 'R' ? 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)' : 'linear-gradient(135deg, #94a3b8 0%, #475569 100%)', border: rewardToShow.rarity === 'UR' ? '2px solid rgba(251, 113, 133, 0.5)' : rewardToShow.rarity === 'SSR' ? '2px solid rgba(251, 191, 36, 0.5)' : rewardToShow.rarity === 'SR' ? '2px solid rgba(192, 132, 252, 0.5)' : rewardToShow.rarity === 'R' ? '2px solid rgba(56, 189, 248, 0.5)' : '2px solid rgba(203, 213, 225, 0.5)', boxShadow: '0 0 20px rgba(0,0,0,0.5)' }}><div className="w-full h-full flex items-center justify-center"><div className="w-16 h-16 rounded-full border-2 border-white/30 flex items-center justify-center bg-white/10 backdrop-blur-sm"><Sparkles className="w-8 h-8 text-white/80" /></div></div></div>
              <div className={`absolute top-0 left-0 w-full h-24 z-20 transition-all duration-700 ease-in ${rewardStage === 'opening' ? '-translate-y-[150%] rotate-[-15deg] opacity-0' : ''}`}><svg viewBox="0 0 256 96" className="w-full h-full drop-shadow-2xl" preserveAspectRatio="none"><defs><linearGradient id="gradPackBase" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#312e81" /><stop offset="50%" stopColor="#4338ca" /><stop offset="100%" stopColor="#1e1b4b" /></linearGradient><radialGradient id="gradPackHighlight" cx="50%" cy="0%" r="80%" fx="50%" fy="0%"><stop offset="0%" stopColor="rgba(255,255,255,0.4)" /><stop offset="100%" stopColor="rgba(255,255,255,0)" /></radialGradient></defs><path d={generateTeethPath(256, 96, 20, true)} fill="url(#gradPackBase)" /><path d={generateTeethPath(256, 96, 20, true)} fill="url(#gradPackHighlight)" /><path d={generateTeethPath(256, 96, 20, true)} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" /></svg></div>
              <div className={`absolute left-0 w-full h-[308px] z-10 transition-all duration-700 ease-in ${rewardStage === 'opening' ? 'translate-y-[100%] rotate-[5deg] opacity-0' : ''}`} style={{ top: '76px' }}>
                <svg viewBox="0 0 256 308" className="w-full h-full drop-shadow-2xl" preserveAspectRatio="none">
                  <defs>
                    <radialGradient id="gradPackBodyHighlight" cx="50%" cy="40%" r="60%" fx="50%" fy="40%">
                      <stop offset="0%" stopColor="rgba(255,255,255,0.15)" />
                      <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                    </radialGradient>
                  </defs>
                  <path d={generateTeethPath(256, 308, 20, false)} fill="url(#gradPackBase)" />
                  <path d={generateTeethPath(256, 308, 20, false)} fill="url(#gradPackBodyHighlight)" />
                  <path d={generateTeethPath(256, 308, 20, false)} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                </svg>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center w-full">
                  <div className="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border-2 border-white/40 shadow-lg">
                    <Sparkles className="w-10 h-10 text-white" />
                  </div>
                  <h3 className="text-3xl font-black text-white tracking-widest drop-shadow-lg">LIFESYNC</h3>
                  <p className="text-white/80 font-bold text-xs tracking-[0.5em] mt-2 uppercase">Mystery Pack</p>
                </div>
              </div>
              {rewardStage === 'pack' && (
                <button onClick={(e) => { e.stopPropagation(); skipLottery(); }} className="absolute -bottom-20 left-1/2 -translate-x-1/2 px-8 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400/80 hover:text-rose-400 text-xs font-black rounded-full border border-rose-500/20 transition-all whitespace-nowrap">放棄抽卡</button>
              )}
            </div>
          )}
          {rewardStage === 'revealed' && (
            <div className="relative w-full max-w-[95%] md:max-w-lg lg:max-w-xl text-center animate-in zoom-in-50 duration-700 slide-in-from-bottom-10 flex flex-col items-center max-h-[95vh] overflow-y-auto no-scrollbar py-4">
              <div className={`relative w-full max-w-[280px] md:max-w-[320px] aspect-[2/3] rounded-[32px] md:rounded-[40px] overflow-hidden shadow-2xl mb-6 md:mb-8 bg-gray-900 border-4 group transition-transform hover:scale-[1.02] duration-500 shrink-0 flex flex-col ${rewardToShow.rarity === 'UR' ? 'border-rose-500 shadow-rose-500/50' : rewardToShow.rarity === 'SSR' ? 'border-amber-400 shadow-amber-500/50' : rewardToShow.rarity === 'SR' ? 'border-purple-400 shadow-purple-500/50' : rewardToShow.rarity === 'R' ? 'border-sky-400 shadow-sky-500/50' : 'border-slate-400 shadow-slate-500/50'}`}>
                <div className="absolute top-4 left-4 md:top-6 md:left-6 z-30 scale-100 md:scale-125 origin-top-left">
                  <RarityBadge rarity={rewardToShow.rarity} />
                </div>
                {rewardToShow.prize.type === 'image' ? (
                  <div className="relative h-full bg-black flex items-center justify-center overflow-hidden cursor-zoom-in group/img" onClick={() => setLightboxImage(rewardToShow.prize.content)}>
                    <IpcImage
                      src={rewardToShow.prize.content}
                      className="w-full h-full object-cover relative z-10"
                    />
                    <div className="absolute inset-0 z-20 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="bg-white/20 backdrop-blur-md p-3 rounded-full text-white border border-white/30">
                        <Search className="w-6 h-6" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center p-6 md:p-10 bg-slate-800 relative overflow-hidden">
                    <p className="relative z-10 text-lg md:text-2xl font-black text-white drop-shadow-lg leading-relaxed break-words whitespace-pre-wrap text-center">
                      "{rewardToShow.prize.content}"
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-center gap-6 md:gap-8 w-full">
                {rewardToShow.totalInStack > 1 && (
                  <div className="w-full max-w-xs bg-white/10 backdrop-blur-md px-4 py-2 md:px-6 md:py-3 rounded-full border border-white/20 shadow-xl flex items-center gap-3 md:gap-4">
                    <span className="text-white/60 text-[8px] md:text-[10px] font-black uppercase tracking-widest whitespace-nowrap">數量</span>
                    <input
                      type="range"
                      min="1"
                      max={rewardToShow.totalInStack}
                      value={claimQuantity}
                      onChange={(e) => setClaimQuantity(parseInt(e.target.value))}
                      className="flex-grow h-1 md:h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-sky-400"
                    />
                    <span className="text-white text-xs md:text-sm font-black min-w-[2.5rem] md:min-w-[3rem] text-right">{claimQuantity}/{rewardToShow.totalInStack}</span>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3 md:gap-4 w-full justify-center px-4">
                  <button
                    onClick={() => {
                      updateData(prev => {
                        const idsToClaim = rewardToShow.groupIds ? rewardToShow.groupIds.slice(0, claimQuantity) : [rewardToShow.id];
                        const now = new Date().toISOString();
                        return {
                          ...prev,
                          rewardHistory: prev.rewardHistory.map(h =>
                            idsToClaim.includes(h.id) ? { ...h, claimed: true, claimedAt: now } : h
                          )
                        };
                      });
                      setRewardToShow(null);
                    }}
                    className="group relative flex-1 sm:flex-none px-8 md:px-12 py-4 md:py-5 bg-white/20 backdrop-blur-xl text-white text-lg md:text-xl font-black rounded-full shadow-[0_0_50px_rgba(255,255,255,0.2)] hover:bg-white/30 hover:shadow-[0_0_60px_rgba(255,255,255,0.4)] md:hover:-translate-y-2 active:scale-95 border border-white/40 transition-all duration-300 overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:animate-shine pointer-events-none" />
                    <span className="relative flex items-center justify-center gap-2 md:gap-3">
                      <CheckCircle2 className="w-5 h-5 md:w-7 md:h-7 text-emerald-400 animate-pulse" />
                      {claimQuantity > 1 ? `領取 ${claimQuantity} 份獎勵` : '收下獎勵'}
                    </span>
                  </button>
                  <button onClick={() => setRewardToShow(null)} className="flex-1 sm:flex-none px-6 md:px-8 py-4 md:py-5 bg-white/5 backdrop-blur-md text-white/50 hover:text-white/80 text-base md:text-lg font-bold rounded-full border border-white/10 hover:bg-white/10 transition-all">稍後領取</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes shine { from { transform: skewX(-12deg) translateX(-200%); } to { transform: skewX(-12deg) translateX(300%); } }
        @keyframes slide-up { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slide-down { from { transform: translateY(-10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes zoom-in { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes zoom-in-x { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
        .animate-in { animation-duration: 0.6s; animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1); animation-fill-mode: both; }
        .zoom-in-x { animation-name: zoom-in-x; }
        .animate-shine { animation: shine 1s ease-in-out infinite; }
        .fade-in { animation-name: fade-in; }
        .slide-up { animation-name: slide-up; }
        .slide-down { animation-name: slide-down; }
        .zoom-in-50 { animation-name: zoom-in; }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .animate-float { animation: float 3s ease-in-out infinite; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(14, 165, 233, 0.2); border-radius: 20px; }
        input[type="date"]::-webkit-calendar-picker-indicator, input[type="time"]::-webkit-calendar-picker-indicator, input[type="datetime-local"]::-webkit-calendar-picker-indicator { filter: invert(0.5) sepia(1) saturate(5) hue-rotate(175deg); }
      `}</style>
    </div>
  );
};

export default App;
