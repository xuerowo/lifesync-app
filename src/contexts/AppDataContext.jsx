import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getTodayStr, getLocalISOString } from '../utils';
import { createDefaultData, normalizeData } from '../shared/defaultData';
import { computeActivePriorityTasks, createRecentGuard, isOneTimeTask, renumberPriorityTasks } from '../domain/tasks';
import { localStampedIsoFromUtcIso, parseLocalDate } from '../domain/dates';

const AppDataContext = createContext();

// 把主程序回傳的 { status, data, secretsUnavailable, code, error } 轉成畫面用的讀取結果
const toLoadResult = (res) => {
  if (!res || res.status === 'error') {
    return { ok: false, code: res?.code, error: res?.error, dataFile: res?.dataFile };
  }
  return {
    ok: true,
    // 主程序已經補齊欄位、解密密碼
    data: res.data,
    secretsUnavailable: Array.isArray(res.secretsUnavailable) ? res.secretsUnavailable : [],
  };
};

/** 讀取資料（Electron 走 IPC；瀏覽器模式走 server.js）。不丟錯，一律回傳 { ok, ... } */
const fetchAppData = async () => {
  try {
    if (window.electronAPI) {
      return toLoadResult(await window.electronAPI.getData());
    }
    const response = await fetch('/api/data');
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      let code = `HTTP_${response.status}`;
      try {
        const body = await response.json();
        if (body?.error) message = body.error;
        // server.js 會帶上讀檔失敗的原因（例如 PARSE_ERROR），畫面才能說明得具體
        if (body?.code) code = body.code;
      } catch {
        // 回應不是 JSON，沿用 HTTP 狀態碼
      }
      return { ok: false, code, error: message };
    }
    return { ok: true, data: normalizeData(await response.json()), secretsUnavailable: [] };
  } catch (error) {
    return { ok: false, code: 'LOAD_FAILED', error: error?.message };
  }
};

export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
};

export const AppDataProvider = ({ children }) => {
  const [ticketNotification, setTicketNotification] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null); // { current, total, message }

  // 監聽全局同步進度
  useEffect(() => {
    if (!window.electronAPI?.onCloudProgress) return;
    const unsubscribe = window.electronAPI.onCloudProgress((progress) => {
      setSyncProgress(progress);
      setIsSyncing(true);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // 通知自動關閉處理
  useEffect(() => {
    let timer;
    if (ticketNotification) {
      timer = setTimeout(() => setTicketNotification(null), 3000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [ticketNotification]);

  const [data, setData] = useState(createDefaultData);
  const [isLoading, setIsLoading] = useState(true);
  // 讀檔失敗：{ code, error, dataFile?, at }。此時畫面改顯示讀檔失敗畫面，而且一律不存檔，避免空白資料蓋掉原檔
  const [loadError, setLoadError] = useState(null);
  // 最近一次存檔失敗：{ error, at }（目前只記錄，尚未顯示）
  const [saveError, setSaveError] = useState(null);

  // 關窗前存檔用：記住最新資料、最後一次確定存好的資料，以及是否允許存檔
  const latestDataRef = useRef(data);
  const savedDataRef = useRef(data);
  const canSaveRef = useRef(false);
  // 存檔要求的編號，避免較舊的存檔結果蓋掉較新的「已存」狀態
  const saveSeqRef = useRef(0);
  const savedSeqRef = useRef(0);

  const markSaved = (seq, savedData) => {
    if (seq > savedSeqRef.current) {
      savedSeqRef.current = seq;
      savedDataRef.current = savedData;
    }
  };

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  // 讀檔失敗畫面（H8）的狀態：正在重試或還原、上一次還原失敗的原因
  const [loadBusy, setLoadBusy] = useState(null); // 'retry' | 'restore' | null
  const [restoreFailure, setRestoreFailure] = useState(null);
  // 從備份還原成功後顯示的提示：{ restoredFrom, restoredFromTime, preservedAs }
  const [restoreNotice, setRestoreNotice] = useState(null);
  // 這台電腦解不開的雲端密碼欄位（例如資料從另一台電腦搬過來），畫面上提示重新輸入
  const [secretsUnavailable, setSecretsUnavailable] = useState([]);

  // 讀取結果的共同處理：成功就換上資料、開放存檔；失敗就記下錯誤，畫面改顯示讀檔失敗畫面
  const finishLoad = useCallback((result) => {
    if (!result.ok) {
      const info = {
        code: result.code || 'LOAD_FAILED',
        error: result.error || '讀取資料失敗',
        dataFile: result.dataFile,
        // 讓錯誤畫面顯示「最後一次讀取的時間」，按重試後仍失敗也看得出來有重新讀過
        at: new Date().toISOString(),
      };
      console.error('Failed to load data:', info);
      // isLoading 保持 true，也不會觸發存檔
      setLoadError(info);
      return false;
    }
    if (result.secretsUnavailable.length > 0) {
      console.warn('部分雲端密碼無法解密，請重新輸入:', result.secretsUnavailable);
    }
    latestDataRef.current = result.data;
    savedDataRef.current = result.data;
    canSaveRef.current = true;
    setData(result.data);
    setSecretsUnavailable(result.secretsUnavailable);
    setLoadError(null);
    setIsLoading(false);
    return true;
  }, []);

  // Load data
  useEffect(() => {
    let cancelled = false;
    fetchAppData().then((result) => {
      if (!cancelled) finishLoad(result);
    });
    return () => {
      cancelled = true;
    };
  }, [finishLoad]);

  // 讀檔失敗畫面的「重試」
  const retryLoad = async () => {
    if (loadBusy) return;
    setLoadBusy('retry');
    setRestoreFailure(null);
    finishLoad(await fetchAppData());
    setLoadBusy(null);
  };

  // 讀檔失敗畫面的「載入最近一次自動備份」（只有 Electron 有）
  const canRestoreFromBackup = Boolean(window.electronAPI?.restoreLatestBackup);
  const restoreFromBackup = async () => {
    if (loadBusy || !canRestoreFromBackup) return;
    setLoadBusy('restore');
    setRestoreFailure(null);
    let res;
    try {
      res = await window.electronAPI.restoreLatestBackup();
    } catch (error) {
      res = { status: 'error', code: 'RESTORE_FAILED', error: error?.message || String(error) };
    }
    if (res && (res.status === 'ok' || res.status === 'new')) {
      finishLoad(toLoadResult(res));
      setRestoreNotice({ restoredFrom: res.restoredFrom, restoredFromTime: res.restoredFromTime, preservedAs: res.preservedAs });
    } else {
      console.error('Failed to restore from backup:', res);
      setRestoreFailure({ code: res?.code, error: res?.error });
    }
    setLoadBusy(null);
  };

  // Save data
  useEffect(() => {
    if (isLoading || loadError) return;
    // 和最後一次存好的內容相同（例如剛載入完），不必再存
    if (data === savedDataRef.current) return;
    const saveData = async () => {
      const seq = ++saveSeqRef.current;
      try {
        if (window.electronAPI) {
          // 密碼由主程序負責加密
          await window.electronAPI.saveData(data);
        } else {
          const response = await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }
        markSaved(seq, data);
        setSaveError(null);
      } catch (error) {
        console.error('Failed to save data:', error);
        setSaveError({ error: error?.message || String(error), at: new Date().toISOString() });
      }
    };
    const timer = setTimeout(saveData, 500);
    return () => clearTimeout(timer);
  }, [data, isLoading, loadError]);

  // 關閉視窗或重新整理前，立刻把還沒存的資料同步存完（只限 Electron）。
  // 注意：這裡不可設定 returnValue 或呼叫 preventDefault，否則 Electron 會默默取消關窗。
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!window.electronAPI?.saveDataSync) return;
      if (!canSaveRef.current) return;
      const latest = latestDataRef.current;
      if (latest === savedDataRef.current) return;
      const seq = ++saveSeqRef.current;
      try {
        const res = window.electronAPI.saveDataSync(latest);
        if (res?.success) {
          markSaved(seq, latest);
        } else {
          console.error('Failed to save data before unload:', res?.error);
        }
      } catch (error) {
        console.error('Failed to save data before unload:', error);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const updateData = (updater) => setData(prev => {
    const newData = typeof updater === 'function' ? updater(prev) : updater;
    return { ...prev, ...newData };
  });

  const getIndicatorStats = (indicatorId) => {
    const activeSubs = data.subTasks.filter(s => indicatorId === 'total' ? true : s.indicatorId === indicatorId);
    const archivedSubs = data.archivedSubTasks.filter(s => indicatorId === 'total' ? true : s.indicatorId === indicatorId);
    
    return [
      ...activeSubs.filter(s => s.type === 'daily' || s.type === 'weekly' || s.type === 'infinite'),
      ...archivedSubs
    ].reduce((acc, s) => {
      if (s.type === 'daily' || s.type === 'weekly' || s.type === 'infinite') {
        return acc + (s.completionCount || 0);
      }
      return acc + 1;
    }, 0);
  };

  // 重排優先順序（1..n），規則見 domain/tasks.js
  const reorderPriorityTasks = renumberPriorityTasks;

  // 今天的本地日期。程式開著跨過午夜時，每分鐘檢查一次，日期變了就更新，讓優先任務清單重新計算
  const [todayStr, setTodayStr] = useState(getTodayStr);
  useEffect(() => {
    const timer = setInterval(() => {
      const current = getTodayStr();
      setTodayStr(prev => (prev === current ? prev : current));
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const activePriorityTasks = useMemo(
    () => computeActivePriorityTasks(data.subTasks, parseLocalDate(todayStr) || new Date()),
    [data.subTasks, todayStr]
  );

  // Business Logic Methods
  const toggleMajorTask = (taskId) => {
    updateData(prev => {
      const task = prev.majorTasks.find(t => t.id === taskId);
      if (!task) return prev;

      const subTasksToArchive = prev.subTasks.filter(s => s.majorTaskId === taskId);
      let updatedSubTasks = prev.subTasks.filter(s => s.majorTaskId !== taskId);
      
      // 有優先任務被歸檔時，剩下的優先任務重新編號
      if (subTasksToArchive.some(s => s.isPriority)) {
        updatedSubTasks = renumberPriorityTasks(updatedSubTasks);
      }

      return {
        ...prev,
        majorTasks: prev.majorTasks.filter(t => t.id !== taskId),
        subTasks: updatedSubTasks,
        archivedTasks: [...prev.archivedTasks, { ...task, completed: true, completedAt: new Date().toISOString() }],
        archivedSubTasks: [...prev.archivedSubTasks, ...subTasksToArchive.map(s => ({ ...s, completed: true, completedAt: new Date().toISOString(), isPriority: false, priorityOrder: 0 }))]
      };
    });
  };

  const revertTaskCompletion = (id, skipTicketUpdate = false) => updateData(prev => {
    const targetArchivedTask = prev.archivedSubTasks.find(t => t.id === id);
    const isRestoringRepetitive = targetArchivedTask && (targetArchivedTask.type === 'daily' || targetArchivedTask.type === 'weekly');
    const historyIndex = isRestoringRepetitive ? -1 : prev.taskHistory.findIndex(h => h.taskId === id);
    let newTaskHistory = [...prev.taskHistory];
    let ticketsToRecover = 0;
    
    if (historyIndex !== -1) {
      ticketsToRecover = newTaskHistory[historyIndex].rewardTickets ?? 1;
      newTaskHistory.splice(historyIndex, 1);
      if (!skipTicketUpdate && ticketsToRecover > 0) {
        setTicketNotification({ count: ticketsToRecover, type: 'loss', id: crypto.randomUUID() });
      }
    }

    const newTickets = (historyIndex !== -1 && !skipTicketUpdate)
      ? Math.max(0, (prev.lotteryTickets || 0) - ticketsToRecover)
      : (prev.lotteryTickets || 0);

    const dailyTask = prev.subTasks.find(t => t.id === id);
    if (dailyTask && (dailyTask.type === 'daily' || dailyTask.type === 'weekly' || dailyTask.type === 'infinite')) {
      const newCount = Math.max(0, (dailyTask.completionCount || 0) - 1);
      const remainingHistory = newTaskHistory.filter(h => h.taskId === id);
      const lastRecord = remainingHistory.length > 0 ? remainingHistory[0] : null;

      return {
        ...prev,
        lotteryTickets: newTickets,
        taskHistory: newTaskHistory,
        subTasks: prev.subTasks.map(t => t.id === id ? {
          ...t,
          completionCount: newCount,
          // completedAt 是真正的 UTC 時間；lastCompletedAt 要用和其他地方一樣的「本地時間標 Z」格式
          lastCompletedAt: lastRecord ? localStampedIsoFromUtcIso(lastRecord.completedAt) : null
        } : t)
      };
    }

    if (targetArchivedTask) {
      return {
        ...prev,
        lotteryTickets: newTickets,
        taskHistory: newTaskHistory,
        archivedSubTasks: prev.archivedSubTasks.filter(t => t.id !== id),
        subTasks: [...prev.subTasks, { ...targetArchivedTask, completed: false }]
      };
    }

    return { ...prev, lotteryTickets: newTickets, taskHistory: newTaskHistory };
  });

  const uncompleteSubTask = (id) => updateData(prev => {
    const task = prev.archivedSubTasks.find(t => t.id === id);
    if (task) return { ...prev, archivedSubTasks: prev.archivedSubTasks.filter(t => t.id !== id), subTasks: [...prev.subTasks, { ...task, completed: false }] };
    return prev;
  });

  const deleteSubTask = (id) => updateData(prev => {
    const task = prev.subTasks.find(t => t.id === id) || prev.archivedSubTasks.find(t => t.id === id);
    const relevantHistory = prev.taskHistory.filter(h => h.taskId === id);
    const ticketsToRecover = relevantHistory.reduce((acc, h) => acc + (h.rewardTickets ?? 1), 0);
    const newTickets = Math.max(0, (prev.lotteryTickets || 0) - ticketsToRecover);

    if (ticketsToRecover > 0) {
      setTicketNotification({ count: ticketsToRecover, type: 'loss', id: crypto.randomUUID() });
    }

    let newSubTasks = prev.subTasks;
    if (task && task.isPriority) {
        newSubTasks = renumberPriorityTasks(prev.subTasks, id);
    }
    return {
      ...prev,
      lotteryTickets: newTickets,
      subTasks: newSubTasks.filter(t => t.id !== id),
      archivedSubTasks: prev.archivedSubTasks.filter(t => t.id !== id),
      taskHistory: prev.taskHistory.filter(h => h.taskId !== id)
    };
  });

  const deleteMajorTask = (id) => updateData(prev => {
    const subTaskIdsToDelete = [
      ...prev.subTasks.filter(s => s.majorTaskId === id).map(s => s.id),
      ...prev.archivedSubTasks.filter(s => s.majorTaskId === id).map(s => s.id)
    ];
    const relevantHistory = prev.taskHistory.filter(h => subTaskIdsToDelete.includes(h.taskId));
    const ticketsToRecover = relevantHistory.reduce((acc, h) => acc + (h.rewardTickets ?? 1), 0);
    const newTickets = Math.max(0, (prev.lotteryTickets || 0) - ticketsToRecover);

    if (ticketsToRecover > 0) {
      setTicketNotification({ count: ticketsToRecover, type: 'loss', id: crypto.randomUUID() });
    }

    const remainingSubTasks = renumberPriorityTasks(prev.subTasks.filter(s => s.majorTaskId !== id));

    return {
      ...prev,
      majorTasks: prev.majorTasks.filter(t => t.id !== id),
      archivedTasks: prev.archivedTasks.filter(t => t.id !== id),
      lotteryTickets: newTickets,
      subTasks: remainingSubTasks,
      archivedSubTasks: prev.archivedSubTasks.filter(s => s.majorTaskId !== id),
      taskHistory: prev.taskHistory.filter(h => !subTaskIdsToDelete.includes(h.taskId))
    };
  });

  const terminateSubTask = (id) => updateData(prev => {
    const task = prev.subTasks.find(t => t.id === id);
    if (!task) return prev;
    let newSubTasks = prev.subTasks;
    if (task.isPriority) {
        newSubTasks = renumberPriorityTasks(prev.subTasks, id);
    }
    return { ...prev, subTasks: newSubTasks.filter(t => t.id !== id), archivedSubTasks: [...prev.archivedSubTasks, { ...task, completed: true, completedAt: new Date().toISOString(), isPriority: false, priorityOrder: 0 }] };
  });

  // 防連點：一次性任務完成後，那一列會播放約 0.3 秒的淡出動畫。動畫期間它還點得到，
  // 而且拿的是完成前的舊資料，連點會被完成兩次（兩筆紀錄、發兩次券、歸檔兩份）。
  // 所以記住剛完成的一次性任務 id，1.5 秒內同一個 id 再呼叫就直接回傳 null。
  // 選擇在這裡擋而不是在任務清單畫面擋：番茄鐘等所有呼叫入口都會一起受到保護，也不用改畫面。
  const [oneTimeCompletionGuard] = useState(() => createRecentGuard(1500));

  /**
   * 完成一個子任務：寫完成紀錄、更新次數或歸檔。被拒絕（今日已完成、有未完成的優先任務）時回傳 null。
   * 這裡不發券，券由呼叫端發。
   * @param {string} id
   * @param {{ rewardTickets?: number }} [options] rewardTickets：完成紀錄要記下的實際發券數。
   *   不給就用任務設定的張數。番茄鐘結算是每個完成任務固定給 1 張，所以番茄鐘會傳 1，
   *   之後撤銷時才會扣回正確的張數。
   */
  const completeSubTaskData = (id, options = {}) => {
    // 剛完成的一次性任務，在淡出動畫期間連點又被完成一次：直接忽略
    if (oneTimeCompletionGuard.isBlocked(id)) return null;

    const task = data.subTasks.find(t => t.id === id);
    if (!task) return null;

    if (task.type === 'daily' || task.type === 'weekly') {
      const todayStr = getTodayStr();
      if (task.lastCompletedAt && task.lastCompletedAt.startsWith(todayStr)) {
        alert(`此任務今日已完成！`);
        return null;
      }
    }

    if (task.type !== 'infinite' && activePriorityTasks.length > 0) {
      const topPriority = activePriorityTasks[0];
      if (task.id !== topPriority.id) {
        alert(`存在未完成的優先任務！請先完成：${topPriority.title}`);
        return null;
      }
    }

    if (isOneTimeTask(task)) oneTimeCompletionGuard.mark(id);

    const majorTask = data.majorTasks.find(m => m.id === task.majorTaskId) ||
                      data.archivedTasks.find(m => m.id === task.majorTaskId);

    updateData(prev => {
      let newSubTasks = [...prev.subTasks];
      let newArchivedSubTasks = [...prev.archivedSubTasks];

      if (task.isPriority) {
        const tempTasks = newSubTasks.map(t => t.id === id ? { ...t, isPriority: false, priorityOrder: 0 } : t);
        newSubTasks = renumberPriorityTasks(tempTasks);
      }

      const completionRecord = {
        id: crypto.randomUUID(),
        taskId: task.id,
        title: task.title,
        majorTaskTitle: majorTask?.title || '獨立任務',
        indicatorId: task.indicatorId,
        completedAt: new Date().toISOString(),
        type: task.type,
        rewardTickets: options.rewardTickets ?? task.rewardTickets ?? 1
      };

      if (task.type === 'daily' || task.type === 'weekly' || task.type === 'infinite') {
        newSubTasks = newSubTasks.map(t => t.id === id ? { ...t, completionCount: (t.completionCount || 0) + 1, lastCompletedAt: getLocalISOString() } : t);
        return { ...prev, subTasks: newSubTasks, taskHistory: [completionRecord, ...prev.taskHistory] };
      } else {
        const taskToArchive = newSubTasks.find(t => t.id === id);
        newSubTasks = newSubTasks.filter(t => t.id !== id);
        if (taskToArchive) {
           newArchivedSubTasks = [...newArchivedSubTasks, { ...taskToArchive, completed: true, completedAt: new Date().toISOString(), isPriority: false, priorityOrder: 0 }];
        }
        return { ...prev, subTasks: newSubTasks, archivedSubTasks: newArchivedSubTasks, taskHistory: [completionRecord, ...prev.taskHistory] };
      }
    });

    return task;
  };

  const addPomodoroRecord = (record) => {
    updateData(prev => ({
      ...prev,
      pomodoroHistory: [record, ...prev.pomodoroHistory]
    }));
  };

  const deletePomodoroRecord = (id) => {
    updateData(prev => ({
      ...prev,
      pomodoroHistory: prev.pomodoroHistory.filter(r => r.id !== id)
    }));
  };

  const addLotteryTickets = (amount) => {
    updateData(prev => ({
      ...prev,
      lotteryTickets: (prev.lotteryTickets || 0) + amount
    }));
  };

  const consumeLotteryTickets = (amount) => {
    if (data.lotteryTickets < amount) return false;
    updateData(prev => ({
      ...prev,
      lotteryTickets: prev.lotteryTickets - amount
    }));
    return true;
  };

  const value = {
    data,
    setData,
    updateData,
    isLoading,
    loadError,
    loadBusy,
    restoreFailure,
    retryLoad,
    canRestoreFromBackup,
    restoreFromBackup,
    restoreNotice,
    dismissRestoreNotice: () => setRestoreNotice(null),
    secretsUnavailable,
    dismissSecretsNotice: () => setSecretsUnavailable([]),
    saveError,
    getIndicatorStats,
    reorderPriorityTasks,
    activePriorityTasks,
    todayStr,
    toggleMajorTask,
    revertTaskCompletion,
    uncompleteSubTask,
    deleteSubTask,
    deleteMajorTask,
    terminateSubTask,
    completeSubTaskData,
    addPomodoroRecord,
    deletePomodoroRecord,
    addLotteryTickets,
    consumeLotteryTickets,
    ticketNotification,
    setTicketNotification,
    isSyncing,
    setIsSyncing,
    syncProgress,
    setSyncProgress
  };

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
};
