import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { getTodayStr, getLocalISOString } from '../utils';

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

  const [data, setData] = useState({
    goals: { learning: [], health: [], happiness: [] },
    majorTasks: [],
    subTasks: [],
    archivedTasks: [],
    archivedSubTasks: [],
    rewardFolderPath: '',
    lotteryPrizes: { N: [], R: [], SR: [], SSR: [], UR: [] },
    lotteryProbability: { N: 50, R: 25, SR: 15, SSR: 8, UR: 2 },
    rewardHistory: [],
    archivedGoals: [],
    achievements: [],
    notes: [],
    rules: [],
    pomodoroHistory: [],
    lotteryTickets: 0,
    taskHistory: [],
    cloudConfig: {
      type: 'webdav',
      url: '',
      username: '',
      password: '',
      masterPassword: '',
      enabled: false
    }
  });
  const [isLoading, setIsLoading] = useState(true);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        let loadedData;
        if (window.electronAPI) {
          loadedData = await window.electronAPI.getData();
          
          if (loadedData.cloudConfig) {
            if (loadedData.cloudConfig.password) {
              loadedData.cloudConfig.password = await window.electronAPI.decryptString(loadedData.cloudConfig.password);
            }
            if (loadedData.cloudConfig.masterPassword) {
              loadedData.cloudConfig.masterPassword = await window.electronAPI.decryptString(loadedData.cloudConfig.masterPassword);
            }
          }
        } else {
          const response = await fetch('/api/data');
          if (response.ok) loadedData = await response.json();
        }

        if (loadedData) {
          if ('rewards' in loadedData) {
            delete loadedData.rewards;
          }
          setData({
            ...loadedData,
            archivedSubTasks: loadedData.archivedSubTasks || [],
            rewardFolderPath: loadedData.rewardFolderPath || '',
            lotteryPrizes: { ...{ N: [], R: [], SR: [], SSR: [], UR: [] }, ...loadedData.lotteryPrizes },
            lotteryProbability: { ...{ N: 50, R: 25, SR: 15, SSR: 8, UR: 2 }, ...loadedData.lotteryProbability },
            rewardHistory: loadedData.rewardHistory || [],
            archivedGoals: loadedData.archivedGoals || [],
            achievements: loadedData.achievements || [],
            notes: loadedData.notes || (loadedData.diaries ? loadedData.diaries.map(d => ({ ...d, title: d.title || d.date || '無主題' })) : []),
            rules: loadedData.rules || [],
            pomodoroHistory: loadedData.pomodoroHistory || [],
            lotteryTickets: loadedData.lotteryTickets || 0,
            taskHistory: loadedData.taskHistory || [],
            cloudConfig: loadedData.cloudConfig || {
              type: 'webdav',
              url: '',
              username: '',
              password: '',
              masterPassword: '',
              enabled: false
            }
          });
        }
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Save data
  useEffect(() => {
    if (isLoading) return;
    const saveData = async () => {
      try {
        if (window.electronAPI) {
          const dataToSave = JSON.parse(JSON.stringify(data));
          if (dataToSave.cloudConfig) {
            if (dataToSave.cloudConfig.password) {
              dataToSave.cloudConfig.password = await window.electronAPI.encryptString(dataToSave.cloudConfig.password);
            }
            if (dataToSave.cloudConfig.masterPassword) {
              dataToSave.cloudConfig.masterPassword = await window.electronAPI.encryptString(dataToSave.cloudConfig.masterPassword);
            }
          }
          await window.electronAPI.saveData(dataToSave);
        } else {
          await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
        }
      } catch (error) {
        console.error('Failed to save data:', error);
      }
    };
    const timer = setTimeout(saveData, 500);
    return () => clearTimeout(timer);
  }, [data, isLoading]);

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
