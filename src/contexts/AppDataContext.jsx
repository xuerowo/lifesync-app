import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { getTodayStr, getLocalISOString } from '../utils';
import { createDefaultData, normalizeData } from '../shared/defaultData';

const AppDataContext = createContext();

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
    if (window.electronAPI && window.electronAPI.onCloudProgress) {
        window.electronAPI.onCloudProgress((progress) => {
            setSyncProgress(progress);
            setIsSyncing(true);
        });
    }
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
  // 讀檔失敗：{ code, error }。此時畫面停在「載入中」，而且一律不存檔，避免空白資料蓋掉原檔
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

  // Load data
  useEffect(() => {
    const failLoad = (code, error) => {
      const info = { code: code || 'LOAD_FAILED', error: error || '讀取資料失敗' };
      console.error('Failed to load data:', info);
      // isLoading 保持 true：畫面停在載入中，也不會觸發存檔
      setLoadError(info);
    };

    const loadData = async () => {
      try {
        let loaded;
        if (window.electronAPI) {
          const res = await window.electronAPI.getData();
          if (!res || res.status === 'error') {
            failLoad(res?.code, res?.error);
            return;
          }
          if (Array.isArray(res.secretsUnavailable) && res.secretsUnavailable.length > 0) {
            console.warn('部分雲端密碼無法解密，請重新輸入:', res.secretsUnavailable);
          }
          // 主程序已經補齊欄位、解密密碼
          loaded = res.data;
        } else {
          const response = await fetch('/api/data');
          if (!response.ok) {
            let message = `HTTP ${response.status}`;
            try {
              const body = await response.json();
              if (body?.error) message = body.error;
            } catch {
              // 回應不是 JSON，沿用 HTTP 狀態碼
            }
            failLoad(`HTTP_${response.status}`, message);
            return;
          }
          loaded = normalizeData(await response.json());
        }

        latestDataRef.current = loaded;
        savedDataRef.current = loaded;
        canSaveRef.current = true;
        setData(loaded);
        setIsLoading(false);
      } catch (error) {
        failLoad('LOAD_FAILED', error?.message);
      }
    };
    loadData();
  }, []);

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

  const reorderPriorityTasks = (allSubTasks, removedTaskId = null) => {
    const remainingTasks = allSubTasks
      .filter(t => t.isPriority && t.id !== removedTaskId)
      .sort((a, b) => a.priorityOrder - b.priorityOrder);
    
    return allSubTasks.map(t => {
      if (t.id === removedTaskId) return t;
      if (!t.isPriority) return t;
      
      const newIndex = remainingTasks.findIndex(rt => rt.id === t.id);
      if (newIndex !== -1) {
        return { ...t, priorityOrder: newIndex + 1 };
      }
      return t;
    });
  };

  const activePriorityTasks = useMemo(() => {
    const todayStr = getTodayStr();
    return data.subTasks
      .filter(t => t.isPriority)
      .filter(t => {
        if (t.type === 'daily' || t.type === 'weekly') {
          return !t.lastCompletedAt || !t.lastCompletedAt.startsWith(todayStr);
        }
        return !t.completed;
      })
      .sort((a, b) => a.priorityOrder - b.priorityOrder);
  }, [data.subTasks]);

  // Business Logic Methods
  const toggleMajorTask = (taskId) => {
    updateData(prev => {
      const task = prev.majorTasks.find(t => t.id === taskId);
      if (!task) return prev;

      const subTasksToArchive = prev.subTasks.filter(s => s.majorTaskId === taskId);
      let updatedSubTasks = prev.subTasks.filter(s => s.majorTaskId !== taskId);
      
      const priorityTasksToRemove = subTasksToArchive.filter(s => s.isPriority).map(s => s.id);
      if (priorityTasksToRemove.length > 0) {
        const remainingPriorityTasks = updatedSubTasks
          .filter(t => t.isPriority)
          .sort((a, b) => a.priorityOrder - b.priorityOrder);
          
        updatedSubTasks = updatedSubTasks.map(t => {
          if (!t.isPriority) return t;
          const newIndex = remainingPriorityTasks.findIndex(rt => rt.id === t.id);
          return { ...t, priorityOrder: newIndex + 1 };
        });
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
      ticketsToRecover = newTaskHistory[historyIndex].rewardTickets || 1;
      newTaskHistory.splice(historyIndex, 1);
      if (!skipTicketUpdate) {
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
          lastCompletedAt: lastRecord ? lastRecord.completedAt : null
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
    const ticketsToRecover = relevantHistory.reduce((acc, h) => acc + (h.rewardTickets || 1), 0);
    const newTickets = Math.max(0, (prev.lotteryTickets || 0) - ticketsToRecover);

    if (ticketsToRecover > 0) {
      setTicketNotification({ count: ticketsToRecover, type: 'loss', id: crypto.randomUUID() });
    }

    let newSubTasks = prev.subTasks;
    if (task && task.isPriority) {
        newSubTasks = reorderPriorityTasks(prev.subTasks, id);
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
    const ticketsToRecover = relevantHistory.reduce((acc, h) => acc + (h.rewardTickets || 1), 0);
    const newTickets = Math.max(0, (prev.lotteryTickets || 0) - ticketsToRecover);

    if (ticketsToRecover > 0) {
      setTicketNotification({ count: ticketsToRecover, type: 'loss', id: crypto.randomUUID() });
    }

    let remainingSubTasks = prev.subTasks.filter(s => s.majorTaskId !== id);
    const priorityTasks = remainingSubTasks
      .filter(t => t.isPriority)
      .sort((a, b) => a.priorityOrder - b.priorityOrder);
      
    remainingSubTasks = remainingSubTasks.map(t => {
      if (!t.isPriority) return t;
      const newIndex = priorityTasks.findIndex(pt => pt.id === t.id);
      return { ...t, priorityOrder: newIndex + 1 };
    });

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
        newSubTasks = reorderPriorityTasks(prev.subTasks, id);
    }
    return { ...prev, subTasks: newSubTasks.filter(t => t.id !== id), archivedSubTasks: [...prev.archivedSubTasks, { ...task, completed: true, completedAt: new Date().toISOString(), isPriority: false, priorityOrder: 0 }] };
  });

  const completeSubTaskData = (id) => {
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

    const majorTask = data.majorTasks.find(m => m.id === task.majorTaskId) ||
                      data.archivedTasks.find(m => m.id === task.majorTaskId);

    updateData(prev => {
      let newSubTasks = [...prev.subTasks];
      let newArchivedSubTasks = [...prev.archivedSubTasks];

      if (task.isPriority) {
        const tempTasks = newSubTasks.map(t => t.id === id ? { ...t, isPriority: false, priorityOrder: 0 } : t);
        newSubTasks = reorderPriorityTasks(tempTasks);
      }

      const completionRecord = {
        id: crypto.randomUUID(),
        taskId: task.id,
        title: task.title,
        majorTaskTitle: majorTask?.title || '獨立任務',
        indicatorId: task.indicatorId,
        completedAt: new Date().toISOString(),
        type: task.type,
        rewardTickets: task.rewardTickets || 1
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
    saveError,
    getIndicatorStats,
    reorderPriorityTasks,
    activePriorityTasks,
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
