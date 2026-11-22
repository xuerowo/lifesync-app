import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { getTodayStr, getLocalISOString } from '../utils/index.ts';
import { createDefaultData, normalizeData } from '../shared/defaultData.ts';
import { completionRewardTickets, computeActivePriorityTasks, createRecentGuard, isOneTimeTask, isStoppedTask, priorityAfterCompletion, renumberPriorityTasks, restoreStoppedSubTask as restoreStoppedSubTaskChanges, stopSubTask as stopSubTaskChanges } from '../domain/tasks.ts';
import { localStampedIsoFromUtcIso, parseLocalDate } from '../domain/dates.ts';
import { archivePlan, countIndicatorProgress, restorePlan } from '../domain/plans.ts';
import { saveResultError, toSaveFailure } from '../domain/saveRetry.ts';
import { revertStoppedTaskRecord } from '../domain/taskHistory.ts';
import { withoutReenteredSecret } from '../domain/loadError.ts';
import { AppDataContext } from './useAppData.ts';
import type { LoadErrorInfo } from '../domain/loadError.ts';
import type { SaveFailure } from '../domain/saveRetry.ts';
import type { ArchivedSubTask, LifeSyncData, PomodoroRecord, SubTask, TaskHistoryRecord } from '../types/data.ts';
import type { CloudProgress, LoadFailure, LoadResult, RestoreBackupResult, RestoreInfo, SecretField } from '../types/electronApi.ts';
import type {
  AppDataContextValue, CompleteSubTaskOptions, DataUpdater, LoadBusy, LoadErrorState, RevertTaskCompletionOptions, TicketNotification,
} from './useAppData.ts';

/** 畫面用的讀取結果：成功時帶資料，失敗時帶原因 */
type AppLoadResult =
  | { ok: true; data: LifeSyncData; secretsUnavailable: SecretField[] }
  | { ok: false; code?: string; error?: string; dataFile?: string };

/** server.ts 錯誤回應（JSON）裡的 error、code */
const errorBodyFields = (body: unknown): { error?: string; code?: string } =>
  // 照理是字串；萬一不是，和原本的 JS（body?.error、body?.code）一樣原樣使用，as 只是型別上的說法。
  // 不是物件（null、數字、字串）時原本讀到的也是 undefined，所以換成空物件結果相同
  (body != null && typeof body === 'object' ? body : {}) as { error?: string; code?: string };

/** 丟出來的錯誤的 message（原本的 error?.message） */
const messageOf = (error: unknown): string | undefined =>
  // 照理是字串；萬一不是，和原本的 JS 一樣原樣使用（as 只是型別上的說法）
  (error != null && typeof error === 'object' ? (error as { message?: string }).message : undefined);

// 把主程序回傳的 { status, data, secretsUnavailable, code, error } 轉成畫面用的讀取結果
const toLoadResult = (res: LoadResult | RestoreBackupResult | null | undefined): AppLoadResult => {
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

/** 存檔（Electron 走 IPC；瀏覽器模式走 server.ts）。失敗時丟出帶 code 的錯誤 */
const persistData = async (data: LifeSyncData): Promise<void> => {
  if (window.electronAPI) {
    // 密碼由主程序負責加密
    const error = saveResultError(await window.electronAPI.saveData(data));
    if (error) throw error;
    return;
  }
  let response;
  try {
    response = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (error) {
    throw Object.assign(new Error(messageOf(error) || '連不到資料伺服器'), { code: 'SERVER_UNREACHABLE' });
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    let code = `HTTP_${response.status}`;
    try {
      const body = errorBodyFields(await response.json());
      if (body.error) message = body.error;
      // server.ts 拒絕存檔時會帶 SAVE_BLOCKED
      if (body.code) code = body.code;
    } catch {
      // 回應不是 JSON，沿用 HTTP 狀態碼
    }
    throw Object.assign(new Error(message), { code });
  }
};

/** 讀取資料（Electron 走 IPC；瀏覽器模式走 server.ts）。不丟錯，一律回傳 { ok, ... } */
const fetchAppData = async (): Promise<AppLoadResult> => {
  try {
    if (window.electronAPI) {
      return toLoadResult(await window.electronAPI.getData());
    }
    const response = await fetch('/api/data');
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      let code = `HTTP_${response.status}`;
      try {
        const body = errorBodyFields(await response.json());
        if (body.error) message = body.error;
        // server.ts 會帶上讀檔失敗的原因（例如 PARSE_ERROR），畫面才能說明得具體
        if (body.code) code = body.code;
      } catch {
        // 回應不是 JSON，沿用 HTTP 狀態碼
      }
      return { ok: false, code, error: message };
    }
    // 伺服器回傳的內容還沒檢查過，normalizeData 整理之後才是 LifeSyncData
    const raw: unknown = await response.json();
    return { ok: true, data: normalizeData(raw), secretsUnavailable: [] };
  } catch (error) {
    return { ok: false, code: 'LOAD_FAILED', error: messageOf(error) };
  }
};

export const AppDataProvider = ({ children }: { children?: ReactNode }) => {
  const [ticketNotification, setTicketNotification] = useState<TicketNotification | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<CloudProgress | null>(null); // { current, total, message }

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
    let timer: ReturnType<typeof setTimeout> | undefined;
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
  const [loadError, setLoadError] = useState<LoadErrorState | null>(null);
  // 存檔失敗（H9）：{ code, error, blocked, failures, retryInMs, at }，畫面上方顯示紅色提示並自動重試
  const [saveError, setSaveError] = useState<SaveFailure | null>(null);
  // 改變這個數字就會再存一次（自動重試、「立即重試」按鈕）
  const [saveRetryNonce, setSaveRetryNonce] = useState(0);
  // 失敗狀態下正在重試（只在失敗時才更新，平常存檔不會因此多重繪一次）
  const [isRetryingSave, setIsRetryingSave] = useState(false);
  const saveFailedRef = useRef(false);
  const saveFailCountRef = useRef(0);
  const lastFailedSeqRef = useRef(0);

  // 關窗前存檔用：記住最新資料、最後一次確定存好的資料，以及是否允許存檔
  const latestDataRef = useRef(data);
  const savedDataRef = useRef(data);
  const canSaveRef = useRef(false);
  // 存檔要求的編號，避免較舊的存檔結果蓋掉較新的「已存」狀態
  const saveSeqRef = useRef(0);
  const savedSeqRef = useRef(0);

  const markSaved = (seq: number, savedData: LifeSyncData) => {
    if (seq > savedSeqRef.current) {
      savedSeqRef.current = seq;
      savedDataRef.current = savedData;
    }
  };

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  // 讀檔失敗畫面（H8）的狀態：正在重試或還原、上一次還原失敗的原因
  const [loadBusy, setLoadBusy] = useState<LoadBusy>(null); // 'retry' | 'restore' | null
  const [restoreFailure, setRestoreFailure] = useState<LoadErrorInfo | null>(null);
  // 從備份還原成功後顯示的提示：{ restoredFrom, restoredFromTime, preservedAs }
  const [restoreNotice, setRestoreNotice] = useState<RestoreInfo | null>(null);
  // 這台電腦解不開的雲端密碼欄位（例如資料從另一台電腦搬過來），畫面上提示重新輸入
  const [secretsUnavailable, setSecretsUnavailable] = useState<SecretField[]>([]);

  // 讀取結果的共同處理：成功就換上資料、開放存檔；失敗就記下錯誤，畫面改顯示讀檔失敗畫面
  const finishLoad = useCallback((result: AppLoadResult) => {
    if (!result.ok) {
      const info: LoadErrorState = {
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
    let res: RestoreBackupResult;
    try {
      // 上面已經確認 canRestoreFromBackup（有 window.electronAPI.restoreLatestBackup），所以 ! 是安全的
      res = await window.electronAPI!.restoreLatestBackup();
    } catch (error) {
      res = { status: 'error', code: 'RESTORE_FAILED', error: messageOf(error) || String(error) };
    }
    if (res && (res.status === 'ok' || res.status === 'new')) {
      finishLoad(toLoadResult(res));
      setRestoreNotice({ restoredFrom: res.restoredFrom, restoredFromTime: res.restoredFromTime, preservedAs: res.preservedAs });
    } else {
      console.error('Failed to restore from backup:', res);
      // 不是 ok 也不是 new，就是還原失敗的結果；型別檢查分辨不出「兩個都不是」，所以用 as 說明
      const failure = res as LoadFailure | null | undefined;
      setRestoreFailure({ code: failure?.code, error: failure?.error });
    }
    setLoadBusy(null);
  };

  // Save data
  useEffect(() => {
    if (isLoading || loadError) return;
    // 和最後一次存好的內容相同（例如剛載入完），不必再存；但失敗狀態下仍要往下走，才能清掉紅色提示
    if (data === savedDataRef.current && !saveFailedRef.current) return;
    const clearSaveFailure = () => {
      saveFailedRef.current = false;
      saveFailCountRef.current = 0;
      setSaveError(null);
    };
    const saveData = async () => {
      if (data === savedDataRef.current) {
        // 期間已經存好了（例如關窗前的同步存檔）
        if (saveFailedRef.current) clearSaveFailure();
        return;
      }
      const seq = ++saveSeqRef.current;
      const retrying = saveFailedRef.current;
      if (retrying) setIsRetryingSave(true);
      try {
        await persistData(data);
        markSaved(seq, data);
        // 比最後一次失敗還新的存檔成功了，失敗的修改也已經包含在裡面
        if (seq > lastFailedSeqRef.current && saveFailedRef.current) clearSaveFailure();
      } catch (error) {
        console.error('Failed to save data:', error);
        // 較新的存檔已經成功，這次較舊的失敗不必理會
        if (seq > savedSeqRef.current) {
          lastFailedSeqRef.current = seq;
          saveFailedRef.current = true;
          saveFailCountRef.current += 1;
          setSaveError(toSaveFailure(error, saveFailCountRef.current));
        }
      } finally {
        if (retrying) setIsRetryingSave(false);
      }
    };
    const timer = setTimeout(saveData, 500);
    return () => clearTimeout(timer);
  }, [data, isLoading, loadError, saveRetryNonce]);

  // 存檔失敗後自動重試：2、5、10、30 秒，之後每 60 秒一次。
  // 主程序擋下的存檔（SAVE_BLOCKED，資料沒有成功載入）重試也沒用，不自動重試。
  useEffect(() => {
    if (!saveError || saveError.retryInMs == null) return;
    const timer = setTimeout(() => setSaveRetryNonce((n) => n + 1), saveError.retryInMs);
    return () => clearTimeout(timer);
  }, [saveError]);

  // 紅色提示上的「立即重試」
  const retrySaveNow = () => setSaveRetryNonce((n) => n + 1);

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

  const updateData = (updater: DataUpdater) => setData(prev => {
    const newData = typeof updater === 'function' ? updater(prev) : updater;
    return { ...prev, ...newData };
  });

  // 成就與維度的進度。跟著計畫一起收起來、沒做完的一次性任務不算（Q13，規則見 domain/plans.ts）
  const getIndicatorStats: AppDataContextValue['getIndicatorStats'] = (indicatorId) => countIndicatorProgress(data, indicatorId);

  // 重排優先順序（1..n），規則見 domain/tasks.ts
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
  // 完成整個計畫：還在進行中的任務跟著計畫一起收起來，並記下是跟著哪個計畫（Q13，規則見 domain/plans.ts）
  const toggleMajorTask = (taskId: string) => {
    updateData(prev => {
      const changes = archivePlan(prev, taskId);
      return changes ? { ...prev, ...changes } : prev;
    });
  };

  // 恢復計畫：跟著計畫一起收起來的任務也一起回到進行中，優先順序盡量排回原本的位置
  const restoreMajorTask = (taskId: string) => {
    updateData(prev => {
      const changes = restorePlan(prev, taskId);
      return changes ? { ...prev, ...changes } : prev;
    });
  };

  // 防連點：一次性任務完成後，那一列會播放約 0.3 秒的淡出動畫。動畫期間它還點得到，
  // 而且拿的是完成前的舊資料，連點會被完成兩次（兩筆紀錄、發兩次券、歸檔兩份）。
  // 所以記住剛完成的一次性任務 id，1.5 秒內同一個 id 再呼叫就直接回傳 null。
  // 撤銷完成（revertTaskCompletion、uncompleteSubTask）時要把 id 清掉，否則撤銷後 1.5 秒內重新完成會沒有反應。
  // 選擇在這裡擋而不是在任務清單畫面擋：番茄鐘等所有呼叫入口都會一起受到保護，也不用改畫面。
  const [oneTimeCompletionGuard] = useState(() => createRecentGuard(1500));

  // options.recordId：指定要撤銷哪一筆完成紀錄（番茄鐘用，避免撤銷到同一個任務別的紀錄）；
  // 那筆紀錄已經不在（例如已在任務清單撤銷過）時什麼都不做
  const revertTaskCompletion = (id: string, skipTicketUpdate = false, options: RevertTaskCompletionOptions = {}) => {
    oneTimeCompletionGuard.clear(id);
    applyRevertTaskCompletion(id, skipTicketUpdate, options.recordId);
  };

  const applyRevertTaskCompletion = (id: string, skipTicketUpdate: boolean, recordId: string | undefined) => updateData(prev => {
    const targetArchivedTask = prev.archivedSubTasks.find(t => t.id === id);
    // 跟著計畫一起收起來的任務（計畫已完成）：撤銷不把它單獨拉回進行中，否則恢復計畫時會漏掉它；要改請先恢復計畫
    if (targetArchivedTask?.archivedWithPlanId) return prev;
    // 停止的任務（domain/tasks.ts 的 isStoppedTask）不是「完成」，沒有完成可以撤銷；要拿回來用 restoreStoppedSubTask。
    // 只有番茄鐘指定了某一筆紀錄（recordId）時，刪掉那一筆、完成次數減 1，任務仍維持停止
    if (targetArchivedTask && isStoppedTask(targetArchivedTask) && !prev.subTasks.some(t => t.id === id)) {
      if (!recordId) return prev;
      const reverted = revertStoppedTaskRecord(prev, id, recordId, !skipTicketUpdate);
      if (!reverted) return prev;
      const { ticketsDeducted, ...changes } = reverted;
      if (ticketsDeducted > 0) {
        setTicketNotification({ count: ticketsDeducted, type: 'loss', id: crypto.randomUUID() });
      }
      return { ...prev, ...changes };
    }
    const isRestoringRepetitive = targetArchivedTask && (targetArchivedTask.type === 'daily' || targetArchivedTask.type === 'weekly');
    const historyIndex = isRestoringRepetitive ? -1 : prev.taskHistory.findIndex(h => (recordId ? h.id === recordId : h.taskId === id));
    if (recordId && !isRestoringRepetitive && historyIndex === -1) return prev;
    const newTaskHistory = [...prev.taskHistory];
    let ticketsToRecover = 0;
    
    if (historyIndex !== -1) {
      ticketsToRecover = completionRewardTickets(newTaskHistory[historyIndex]);
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

  const uncompleteSubTask = (id: string) => {
    oneTimeCompletionGuard.clear(id);
    updateData(prev => {
      const task = prev.archivedSubTasks.find(t => t.id === id);
      if (task?.archivedWithPlanId) return prev;
      if (task) return { ...prev, archivedSubTasks: prev.archivedSubTasks.filter(t => t.id !== id), subTasks: [...prev.subTasks, { ...task, completed: false }] };
      return prev;
    });
  };

  const deleteSubTask = (id: string) => updateData(prev => {
    const task = prev.subTasks.find(t => t.id === id) || prev.archivedSubTasks.find(t => t.id === id);
    const relevantHistory = prev.taskHistory.filter(h => h.taskId === id);
    const ticketsToRecover = relevantHistory.reduce((acc, h) => acc + completionRewardTickets(h), 0);
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

  const deleteMajorTask = (id: string) => updateData(prev => {
    // 寫成可以有 undefined：下面拿紀錄的 taskId（補登的紀錄沒有）來比對，undefined 一定比對不到
    const subTaskIdsToDelete: (string | undefined)[] = [
      ...prev.subTasks.filter(s => s.majorTaskId === id).map(s => s.id),
      ...prev.archivedSubTasks.filter(s => s.majorTaskId === id).map(s => s.id)
    ];
    const relevantHistory = prev.taskHistory.filter(h => subTaskIdsToDelete.includes(h.taskId));
    const ticketsToRecover = relevantHistory.reduce((acc, h) => acc + completionRewardTickets(h), 0);
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

  // 停止重複任務：不再出現在清單，完成紀錄、完成次數、抽卡券都保留（規則見 domain/tasks.ts）
  const stopSubTask = (id: string) => updateData(prev => {
    const changes = stopSubTaskChanges(prev, id);
    return changes ? { ...prev, ...changes } : prev;
  });

  // 恢復停止的任務：放回清單，不動完成紀錄、完成次數和抽卡券
  const restoreStoppedSubTask = (id: string) => updateData(prev => {
    const changes = restoreStoppedSubTaskChanges(prev, id);
    return changes ? { ...prev, ...changes } : prev;
  });

  /**
   * 完成一個子任務：寫完成紀錄、更新次數或歸檔。被拒絕（今日已完成、有未完成的優先任務）時回傳 null。
   * 這裡不發券，券由呼叫端發。
   * options.rewardTickets：完成紀錄要記下的實際發券數，不給就用任務設定的張數。番茄鐘傳 0：
   *   券要到結算按「領取」才給，領取時才把紀錄改成任務的張數（見 domain/pomodoro.ts）。
   * options.recordId：完成紀錄要用的 id（番茄鐘先產生好，結算和撤銷時才找得到這一筆）。
   */
  const completeSubTaskData = (id: string, options: CompleteSubTaskOptions = {}): SubTask | null => {
    // 剛完成的一次性任務，在淡出動畫期間連點又被完成一次：直接忽略
    if (oneTimeCompletionGuard.isBlocked(id)) return null;

    const task = data.subTasks.find(t => t.id === id);
    if (!task) return null;

    if (task.type === 'daily' || task.type === 'weekly') {
      const todayStr = getTodayStr();
      if (task.lastCompletedAt && task.lastCompletedAt.startsWith(todayStr)) {
        alert('這個任務今天已經完成了。');
        return null;
      }
    }

    if (task.type !== 'infinite' && activePriorityTasks.length > 0) {
      const topPriority = activePriorityTasks[0];
      if (task.id !== topPriority.id) {
        alert(`還有優先任務沒完成，請先完成「${topPriority.title || '未命名任務'}」。`);
        return null;
      }
    }

    if (isOneTimeTask(task)) oneTimeCompletionGuard.mark(id);

    const majorTask = data.majorTasks.find(m => m.id === task.majorTaskId) ||
                      data.archivedTasks.find(m => m.id === task.majorTaskId);

    updateData(prev => {
      // 每日、每週任務完成後保留優先標記；一次性任務拿掉並重排（規則見 domain/tasks.ts）
      let newSubTasks = priorityAfterCompletion(prev.subTasks, id);
      let newArchivedSubTasks: ArchivedSubTask[] = [...prev.archivedSubTasks];

      const completionRecord: TaskHistoryRecord = {
        id: options.recordId || crypto.randomUUID(),
        taskId: task.id,
        title: task.title,
        majorTaskTitle: majorTask?.title || '獨立任務',
        indicatorId: task.indicatorId,
        completedAt: new Date().toISOString(),
        type: task.type,
        // 不會是負數：舊資料裡的負數券數若照記，之後撤銷或刪除反而會加券
        rewardTickets: completionRewardTickets(task, options)
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

  const addPomodoroRecord = (record: PomodoroRecord) => {
    updateData(prev => ({
      ...prev,
      pomodoroHistory: [record, ...prev.pomodoroHistory]
    }));
  };

  const deletePomodoroRecord = (id: string) => {
    updateData(prev => ({
      ...prev,
      pomodoroHistory: prev.pomodoroHistory.filter(r => r.id !== id)
    }));
  };

  const addLotteryTickets = (amount: number) => {
    updateData(prev => ({
      ...prev,
      lotteryTickets: (prev.lotteryTickets || 0) + amount
    }));
  };

  const consumeLotteryTickets = (amount: number) => {
    if (data.lotteryTickets < amount) return false;
    updateData(prev => ({
      ...prev,
      lotteryTickets: prev.lotteryTickets - amount
    }));
    return true;
  };

  const value: AppDataContextValue = {
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
    // 設定頁重新輸入了解不開的密碼（WebDAV 密碼、確認後的主密碼）時呼叫，提示裡就不再列這個欄位
    markSecretReentered: (field) => setSecretsUnavailable((prev) => withoutReenteredSecret(prev, field)),
    saveError,
    isRetryingSave,
    retrySaveNow,
    getIndicatorStats,
    reorderPriorityTasks,
    activePriorityTasks,
    todayStr,
    toggleMajorTask,
    restoreMajorTask,
    revertTaskCompletion,
    uncompleteSubTask,
    deleteSubTask,
    deleteMajorTask,
    stopSubTask,
    restoreStoppedSubTask,
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
