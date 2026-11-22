import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun, Layers, LayoutDashboard, Trophy, Settings2, Sparkles, Star, Search, CheckCircle2, X, Tag, RefreshCw
} from 'lucide-react';

// Context & Hooks
import { useAppData } from './contexts/useAppData.ts';
import { usePomodoroAutoAdvance } from './hooks/usePomodoroAutoAdvance.ts';

// Utils & Constants
import { generateTeethPath } from './utils/index.ts';

// Components
import IpcImage from './components/Shared/IpcImage.tsx';
import IndicatorsView from './components/Indicators/IndicatorsView';
import TasksView from './components/Tasks/TasksView';
import RewardsView from './components/Rewards/RewardsView';
import MultiRewardReveal from './components/Rewards/MultiRewardReveal';
import SettingsView from './components/Settings/SettingsView';
import Pomodoro from './components/Pomodoro/Pomodoro';
import RarityBadge from './components/Shared/RarityBadge.tsx';
import CalendarView from './components/Calendar/CalendarView';
import NoteView from './components/Note/NoteView';
import RulesView from './components/Rules/RulesView';
import TasksHistory from './components/Tasks/TasksHistory';

import TaskEditor from './components/Tasks/TaskEditor';
import HistoryEditor from './components/Rewards/HistoryEditor';
import TaskHistoryEditor from './components/Tasks/TaskHistoryEditor';
import NoteEditor from './components/Note/NoteEditor';
import PriorityManager from './components/Tasks/PriorityManager';
import LoadErrorScreen from './components/Shared/LoadErrorScreen.tsx';
import NoticeBar from './components/Shared/NoticeBar.tsx';
import SaveErrorBanner from './components/Shared/SaveErrorBanner.tsx';
import { describeRestoreSuccess, describeSecretsUnavailable } from './domain/loadError.ts';
import { completionRewardTickets } from './domain/tasks.ts';
import { LEGACY_POMODORO_KEYS, awaitingOf, lastEventMs, loadPomodoroState, pomodoroClock } from './domain/pomodoroClock.ts';
import type { PomodoroRecord } from './types/data.ts';
import type { EditingNote, EditingRewardHistory, EditingTask, EditingTaskHistory, RewardStage, RewardToShow } from './types/ui.ts';


const App = () => {
  const {
    data, updateData, isLoading, getIndicatorStats, completeSubTaskData,
    revertTaskCompletion, addLotteryTickets, ticketNotification, setTicketNotification,
    isSyncing, syncProgress,
    loadError, loadBusy, restoreFailure, retryLoad, canRestoreFromBackup, restoreFromBackup,
    restoreNotice, dismissRestoreNotice, secretsUnavailable, dismissSecretsNotice,
    saveError, isRetryingSave, retrySaveNow
  } = useAppData();
  const secretsNoticeText = describeSecretsUnavailable(secretsUnavailable);

  // --- UI State ---
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'indicators');
  const [rewardSubTab, setRewardSubTab] = useState(() => localStorage.getItem('rewardSubTab') || 'lottery');
  const [taskSubTab, setTaskSubTab] = useState(() => localStorage.getItem('taskSubTab') || 'list');
  const [calendarDate, setCalendarDate] = useState(new Date());
  
  const [rewardToShow, setRewardToShow] = useState<RewardToShow | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<EditingTask | null>(null);
  const [editingHistory, setEditingHistory] = useState<EditingRewardHistory | null>(null);
  const [editingTaskHistory, setEditingTaskHistory] = useState<EditingTaskHistory | null>(null);
  const [editingNote, setEditingNote] = useState<EditingNote | null>(null);
  const [isPriorityManagerOpen, setIsPriorityManagerOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [rewardStage, setRewardStage] = useState<RewardStage>('pack');
  const [blurImages, setBlurImages] = useState(true);
  const [claimQuantity, setClaimQuantity] = useState(1);

  useEffect(() => {
    // 預設領取數量設為 1
    setClaimQuantity(1);
  }, [rewardToShow]);

  // --- Pomodoro State ---
  // 讀取上次存的狀態；程式關閉期間的時間在這裡就處理成「暫停」（見 domain/pomodoroClock.ts 的 loadPomodoroState）
  const [initialPomodoro] = useState(() => loadPomodoroState(window.localStorage, Date.now()));
  const [pomodoroStatus, setPomodoroStatus] = useState(initialPomodoro.status);
  const [pomodoroSettings, setPomodoroSettings] = useState(initialPomodoro.settings);
  const [pomodoroSelectedTaskIds, setPomodoroSelectedTaskIds] = useState(initialPomodoro.selectedTaskIds);
  const [pomodoroSessionTasks, setPomodoroSessionTasks] = useState(initialPomodoro.sessionTasks);
  const [pomodoroCompletedSessionTaskIds, setPomodoroCompletedSessionTaskIds] = useState(initialPomodoro.completedSessionTaskIds);
  const [pomodoroIsPaused, setPomodoroIsPaused] = useState(initialPomodoro.isPaused);
  const [pomodoroCycles, setPomodoroCycles] = useState(initialPomodoro.cycles);
  const [pomodoroShowSettlement, setPomodoroShowSettlement] = useState(initialPomodoro.showSettlement);
  // 時間軸是計時的唯一依據：倒數、總專注、心流時長、抽卡券、總結、歷史都從它算
  const [pomodoroTimeline, setPomodoroTimeline] = useState(initialPomodoro.timeline);
  // 目前這個專注／休息階段要倒數幾秒（心流與待機為 null）
  const [pomodoroPhaseLength, setPomodoroPhaseLength] = useState(initialPomodoro.phaseLength);
  const [pomodoroShowSummary, setPomodoroShowSummary] = useState(initialPomodoro.showSummary);
  // 上一輪的結果（Pomodoro 結束時存的 PomodoroRecord）。localStorage 讀出來的內容沒有逐筆檢查，
  // 原本的 JS 也是直接讀它的欄位（例如 endTime），所以這裡照樣當成 PomodoroRecord
  const [pomodoroSessionStats, setPomodoroSessionStats] = useState(initialPomodoro.sessionStats as PomodoroRecord | null);
  const pomodoroSessionStartTimeRef = useRef(initialPomodoro.sessionStartTime);
  // 畫面用的「現在」，計時中每秒更新一次
  const [pomodoroNowMs, setPomodoroNowMs] = useState(() => Date.now());
  // 時間到、等待按按鈕時，鈴聲是否已經按「先關掉鈴聲」關掉
  const [pomodoroAlarmMuted, setPomodoroAlarmMuted] = useState(initialPomodoro.alarmMuted);
  // 時間到、等你按「開始休息／開始專注」（從時間軸的 await_start 判斷）
  const pomodoroAwaiting = pomodoroStatus !== 'idle' ? awaitingOf(pomodoroTimeline) : null;

  // 等待中不算計時：不必每秒更新，也不記「還活著」的時間（等待的時間本來就不算，重開程式後照樣停在等待）
  const pomodoroRunning = pomodoroStatus !== 'idle' && !pomodoroIsPaused && !pomodoroAwaiting && !pomodoroShowSettlement && !pomodoroShowSummary;

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

  // 舊版「每秒 +1」累計用的欄位已經換算進時間軸，不再需要
  useEffect(() => {
    LEGACY_POMODORO_KEYS.forEach(k => localStorage.removeItem(k));
  }, []);

  // Persist Pomodoro State
  useEffect(() => {
    localStorage.setItem('pomodoroStatus', pomodoroStatus);
    localStorage.setItem('pomodoroSettings', JSON.stringify(pomodoroSettings));
    localStorage.setItem('pomodoroSelectedTaskIds', JSON.stringify(pomodoroSelectedTaskIds));
    localStorage.setItem('pomodoroSessionTasks', JSON.stringify(pomodoroSessionTasks));
    localStorage.setItem('pomodoroCompletedSessionTaskIds', JSON.stringify(pomodoroCompletedSessionTaskIds));
    // setItem 本來就會把值轉成字串；寫 String() 只是讓型別檢查通過，存進去的內容相同
    localStorage.setItem('pomodoroIsPaused', String(pomodoroIsPaused));
    localStorage.setItem('pomodoroCycles', String(pomodoroCycles));
    localStorage.setItem('pomodoroShowSettlement', String(pomodoroShowSettlement));
    localStorage.setItem('pomodoroTimeline', JSON.stringify(pomodoroTimeline));
    if (pomodoroPhaseLength == null) localStorage.removeItem('pomodoroPhaseLength');
    else localStorage.setItem('pomodoroPhaseLength', String(pomodoroPhaseLength));
    localStorage.setItem('pomodoroShowSummary', String(pomodoroShowSummary));
    localStorage.setItem('pomodoroSessionStats', JSON.stringify(pomodoroSessionStats));
    localStorage.setItem('pomodoroAlarmMuted', String(pomodoroAlarmMuted));
    if (pomodoroSessionStartTimeRef.current) localStorage.setItem('pomodoroSessionStartTime', pomodoroSessionStartTimeRef.current);
    localStorage.setItem('lastPomodoroTick', String(new Date().getTime()));
  }, [
    pomodoroStatus, pomodoroSettings, pomodoroSelectedTaskIds,
    pomodoroSessionTasks, pomodoroCompletedSessionTaskIds, pomodoroIsPaused,
    pomodoroCycles, pomodoroShowSettlement, pomodoroTimeline, pomodoroPhaseLength,
    pomodoroShowSummary, pomodoroSessionStats, pomodoroAlarmMuted
  ]);

  // 計時中：每秒更新畫面上的「現在」，同時記下「程式還活著」的時間（lastPomodoroTick）。
  // 下次開啟時，這個時間點之後到開啟之間就是「程式關閉」的時間，視同暫停。
  // 休眠或對話框開著時這裡會停住，但醒來後是用實際時間點相減，經過的時間照算，也不會被當成關閉。
  useEffect(() => {
    if (!pomodoroRunning) return;
    const tick = () => {
      const now = Date.now();
      localStorage.setItem('lastPomodoroTick', String(now));
      // 同一秒內不重繪；每秒只更新一次畫面
      setPomodoroNowMs(prev => (Math.floor(prev / 1000) === Math.floor(now / 1000) ? prev : now));
    };
    const interval = setInterval(tick, 250);
    // 關閉視窗、重新整理前，把最後還活著的時間記到最準
    const onPageHide = () => localStorage.setItem('lastPomodoroTick', String(Date.now()));
    window.addEventListener('pagehide', onPageHide);
    return () => {
      clearInterval(interval);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [pomodoroRunning]);

  // 從時間軸算出目前的倒數、總專注等。總結或結算畫面開著時，時間停在按停止的那一刻；
  // 暫停時停在最後一個事件（暫停的那一刻）
  const pomodoroClockNowMs = (pomodoroShowSummary || pomodoroShowSettlement) && pomodoroSessionStats?.endTime
    ? new Date(pomodoroSessionStats.endTime).getTime()
    : Math.max(pomodoroNowMs, lastEventMs(pomodoroTimeline) ?? 0);
  const pomodoroClockState = pomodoroClock({
    timeline: pomodoroTimeline,
    phaseLength: pomodoroPhaseLength,
    nowMs: pomodoroClockNowMs,
  });
  const pomodoroTimeLeft = (pomodoroStatus === 'focus' || pomodoroStatus === 'break') && !pomodoroAwaiting ? pomodoroClockState.timeLeft : 0;

  // 「時間到」的處理與階段切換放在這一層，切到別的分頁也照常運作
  const {
    startFocus: pomodoroStartFocus,
    startBreak: pomodoroStartBreak,
    enterFlow: pomodoroEnterFlow,
    silenceAlarm: pomodoroSilenceAlarm,
  } = usePomodoroAutoAdvance({
    status: pomodoroStatus, setStatus: setPomodoroStatus,
    settings: pomodoroSettings,
    timeLeft: pomodoroTimeLeft,
    phaseLength: pomodoroPhaseLength, setPhaseLength: setPomodoroPhaseLength,
    isPaused: pomodoroIsPaused, setIsPaused: setPomodoroIsPaused,
    cycles: pomodoroCycles, setCycles: setPomodoroCycles,
    showSettlement: pomodoroShowSettlement, setShowSettlement: setPomodoroShowSettlement,
    showSummary: pomodoroShowSummary, setShowSummary: setPomodoroShowSummary,
    timeline: pomodoroTimeline, setTimeline: setPomodoroTimeline,
    alarmMuted: pomodoroAlarmMuted, setAlarmMuted: setPomodoroAlarmMuted,
  });

  const skipLottery = () => {
    if (!rewardToShow) return;
    // 抽卡券已經扣掉、不會退回；只是把卡包裡的獎勵刪掉，所以先確認
    if (!confirm('卡包裡的獎勵會被刪除，抽卡券不會退回。確定嗎？')) return;
    // 這個按鈕只在單抽畫面出現；十連抽的內容沒有 id（原本讀到 undefined，什麼都不刪），這裡照樣是 undefined
    const rewardId = rewardToShow.isMulti ? undefined : rewardToShow.id;
    updateData(prev => ({ ...prev, rewardHistory: prev.rewardHistory.filter(h => h.id !== rewardId) }));
    setRewardToShow(null);
  };

  const handleCompleteSubTask = (id: string) => {
    const task = completeSubTaskData(id);
    if (task) {
      const ticketsToAdd = completionRewardTickets(task);
      if (ticketsToAdd > 0) {
        addLotteryTickets(ticketsToAdd);
        setTicketNotification({ count: ticketsToAdd, type: 'gain', id: crypto.randomUUID() });
      }
    }
  };

  const handleCancelSync = async () => {
    if (window.electronAPI && window.electronAPI.cancelCloudSync) {
        await window.electronAPI.cancelCloudSync();
        // 雖然主程序會結束迴圈，但我們也可以在前端先提示中斷中
    }
  };

  // 讀檔失敗：改顯示錯誤畫面（重試／載入最近一次自動備份），不再一直轉圈
  if (isLoading && loadError) return (
    <LoadErrorScreen
      loadError={loadError}
      busy={loadBusy}
      canRestore={canRestoreFromBackup}
      restoreFailure={restoreFailure}
      onRetry={retryLoad}
      onRestore={restoreFromBackup}
    />
  );

  if (isLoading) return (
    <div className="app-scroll h-full bg-gradient-to-b from-sky-300 via-sky-100 to-white flex [align-items:safe_center] justify-center">
      <div className="text-center">
        <Sun className="w-16 h-16 text-amber-400 animate-spin mx-auto mb-4" />
        <p className="text-sky-600 font-black text-xl">載入中……</p>
      </div>
    </div>
  );

  return (
    <div className="app-scroll h-full bg-gradient-to-b from-sky-300 via-sky-100 to-white text-sky-950 font-sans selection:bg-sky-200 selection:text-sky-900">
      
      {/* 存檔失敗的紅色提示（存好後自動消失） */}
      <SaveErrorBanner saveError={saveError} isRetrying={isRetryingSave} onRetry={retrySaveNow} />

      {/* 全局進度面板（雲端上傳下載、本機匯出都會用到） */}
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
                                <span className="text-[10px] font-black text-sky-400 uppercase tracking-widest">處理中</span>
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
                                title="中斷"
                                aria-label="中斷"
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
            <div className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${pomodoroAwaiting ? 'bg-amber-400' : pomodoroIsPaused ? 'bg-slate-300' : (pomodoroStatus === 'break' ? 'bg-emerald-400' : 'bg-sky-400')} ${!pomodoroIsPaused && 'animate-pulse'}`} />
            <div className="flex flex-col">
              <span className="text-[6px] md:text-[8px] font-black text-slate-400 uppercase leading-none">{pomodoroAwaiting ? (pomodoroStatus === 'break' ? '休息結束' : '專注結束') : (pomodoroStatus === 'break' ? '休息中' : '專注中')}</span>
              <span className="text-xs md:text-sm font-black text-sky-900 font-mono leading-none mt-0.5">
                {pomodoroAwaiting ? '時間到，點這裡繼續' : pomodoroStatus === 'flow' ? '心流中' : (Math.floor(pomodoroTimeLeft / 60) + ':' + (pomodoroTimeLeft % 60).toString().padStart(2, '0'))}
              </span>
            </div>
            {pomodoroStatus === 'focus' && !pomodoroAwaiting && (
              <div className="w-12 md:w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 transition-all duration-1000"
                  style={{ width: `${(pomodoroTimeLeft / (pomodoroPhaseLength || pomodoroSettings.focus * 60)) * 100}%` }}
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
        {restoreNotice && (
          <NoticeBar tone="success" lines={describeRestoreSuccess(restoreNotice)} onDismiss={dismissRestoreNotice} />
        )}
        {secretsNoticeText && (
          <NoticeBar
            tone="warning"
            lines={[secretsNoticeText]}
            action={activeTab === 'settings' ? undefined : { label: '前往設定', onClick: () => setActiveTab('settings') }}
            onDismiss={dismissSecretsNotice}
          />
        )}
        <header className="flex flex-col lg:flex-row justify-between items-center mb-10 md:mb-16 gap-8">
          <div className="text-center lg:text-left group cursor-default">
            <div className="flex items-center justify-center lg:justify-start gap-3">
              <Sun className="w-8 h-8 md:w-10 md:h-10 text-amber-400 animate-[spin_10s_linear_infinite]" />
              <h1 className="text-4xl md:text-5xl font-black text-sky-900 tracking-tighter">LifeSync</h1>
            </div>
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
                  {/* 只有獎勵庫有 badge；沒有時原本 undefined > 0 就是 false，?? 0 結果相同 */}
                  {(tab.badge ?? 0) > 0 && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="absolute -top-2 -right-3 flex items-center justify-center min-w-[14px] h-[14px] px-1 bg-gradient-to-tr from-rose-500 to-rose-400 text-white text-[8px] font-black rounded-full shadow-[0_2px_8px_rgba(244,63,94,0.4)] border border-white/40"
                    >
                      {tab.badge}
                    </motion.span>
                  )}
                </span>
                {(tab.badge ?? 0) > 0 && (
                  <span className="sm:hidden absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full border border-white" />
                )}
              </button>
            ))}
          </nav>
        </header>

        <main className="animate-in fade-in duration-700 pb-20">
          {activeTab === 'indicators' && <IndicatorsView />}
          {activeTab === 'tasks' && (
            <div className="space-y-6 md:space-y-10">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-4">
                <div className="flex items-center gap-4 md:gap-5">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-[2rem] bg-white/40 backdrop-blur-2xl border border-white/60 flex items-center justify-center shadow-xl shadow-sky-100/50 text-sky-500 shrink-0">
                    <LayoutDashboard className="w-6 h-6 md:w-8 md:h-8" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-2xl md:text-4xl font-black text-sky-900 tracking-tight">規劃</h2>
                    <nav className="relative flex gap-4 md:gap-6 mt-2 px-1 overflow-x-auto no-scrollbar pb-1">
                      {[
                        { id: 'list', name: '計畫清單' },
                        { id: 'pomodoro', name: '專注計時' },
                        { id: 'history', name: '任務歷史' },
                        { id: 'calendar', name: '週曆' },
                        { id: 'note', name: '生活筆記' },
                        { id: 'rules', name: '行動準則' }
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
                  // 番茄鐘裡完成的任務：紀錄先記 0 張，結算按「領取」時才照任務設定的張數給券並改紀錄
                  onTaskComplete={(taskId: string, { recordId }: { recordId?: string } = {}) => completeSubTaskData(taskId, { rewardTickets: 0, recordId })}
                  // 券還沒給，撤銷時不扣券；有 recordId 就只撤銷那一筆
                  onTaskRevert={(taskId: string, recordId?: string) => revertTaskCompletion(taskId, true, { recordId })}
                  status={pomodoroStatus} setStatus={setPomodoroStatus}
                  settings={pomodoroSettings} setSettings={setPomodoroSettings}
                  timeLeft={pomodoroTimeLeft}
                  selectedTaskIds={pomodoroSelectedTaskIds} setSelectedTaskIds={setPomodoroSelectedTaskIds}
                  sessionTasks={pomodoroSessionTasks} setSessionTasks={setPomodoroSessionTasks}
                  completedSessionTaskIds={pomodoroCompletedSessionTaskIds} setCompletedSessionTaskIds={setPomodoroCompletedSessionTaskIds}
                  isPaused={pomodoroIsPaused} setIsPaused={setPomodoroIsPaused}
                  totalAccumulated={Math.floor(pomodoroClockState.workSeconds)}
                  currentSessionDuration={Math.floor(pomodoroClockState.phaseElapsed)}
                  cycles={pomodoroCycles} setCycles={setPomodoroCycles}
                  showSettlement={pomodoroShowSettlement} setShowSettlement={setPomodoroShowSettlement}
                  sessionTimeline={pomodoroTimeline} setSessionTimeline={setPomodoroTimeline}
                  showSummary={pomodoroShowSummary} setShowSummary={setPomodoroShowSummary}
                  sessionStats={pomodoroSessionStats} setSessionStats={setPomodoroSessionStats}
                  sessionStartTimeRef={pomodoroSessionStartTimeRef}
                  startFocus={pomodoroStartFocus}
                  startBreak={pomodoroStartBreak}
                  enterFlow={pomodoroEnterFlow}
                  // @ts-expect-error Pomodoro.jsx 還沒換成 TypeScript：awaiting 的預設值是 null，型別被推斷成只能是 null。換成 .tsx 後拿掉這行
                  awaiting={pomodoroAwaiting}
                  silenceAlarm={pomodoroSilenceAlarm}
                  alarmMuted={pomodoroAlarmMuted}
                  setAlarmMuted={setPomodoroAlarmMuted}
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
          <button title="關閉" aria-label="關閉" className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors z-[510]" onClick={(e) => { e.stopPropagation(); setLightboxImage(null); }}><X className="w-8 h-8" /></button>
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
                  <p className="text-xl font-black leading-none whitespace-nowrap">
                    {ticketNotification.type === 'loss' ? '扣回' : '獲得'} {ticketNotification.count} 張抽卡券
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
                <button onClick={(e) => { e.stopPropagation(); skipLottery(); }} className="absolute -bottom-20 left-1/2 -translate-x-1/2 px-8 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400/80 hover:text-rose-400 text-xs font-black rounded-full border border-rose-500/20 transition-all whitespace-nowrap">放棄這次獎勵</button>
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
                {/* 單抽時沒有 totalInStack：原本 undefined > 1 就是 false，?? 0 結果相同 */}
                {(rewardToShow.totalInStack ?? 0) > 1 && (
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
                    <span className="text-white text-xs md:text-sm font-black min-w-[3rem] md:min-w-[3.5rem] text-right">{claimQuantity} / {rewardToShow.totalInStack}</span>
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
                      {claimQuantity > 1 ? `領取 ${claimQuantity} 份獎勵` : '領取獎勵'}
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
