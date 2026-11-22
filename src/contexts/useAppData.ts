// 全 App 共用的資料（AppDataContext）：context 物件、useAppData()，以及它提供的每個值的型別。
// AppDataProvider（實際管理資料、讀檔、存檔的元件）在 AppDataContext.tsx。
// 兩者分成兩個檔案，是因為 React 的快速重新整理（Fast Refresh）要求「元件檔只匯出元件」。

import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AchievementCategory, LifeSyncData, PomodoroRecord, SubTask } from '../types/data.ts';
import type { CloudProgress, RestoreInfo, SecretField } from '../types/electronApi.ts';
import type { LoadErrorInfo } from '../domain/loadError.ts';
import type { SaveFailure } from '../domain/saveRetry.ts';
import type { renumberPriorityTasks } from '../domain/tasks.ts';

/** updateData 的參數：要改的欄位，或「拿目前的資料、回傳要改的欄位」的函式。結果會和目前的資料合併 */
export type DataUpdate = Partial<LifeSyncData>;
export type DataUpdater = DataUpdate | ((prev: LifeSyncData) => DataUpdate);

/** 畫面下方「獲得／扣回 N 張抽卡券」的提示 */
export interface TicketNotification {
  count: number;
  type: 'gain' | 'loss';
  /** 每次都不同，讓動畫重新播放 */
  id: string;
}

/** 讀檔失敗的資訊（此時畫面改顯示讀檔失敗畫面，而且一律不存檔） */
export interface LoadErrorState {
  code: string;
  error: string;
  /** 資料檔的完整路徑（只有 Electron 有） */
  dataFile?: string;
  /** 最後一次讀取的時間（ISO 字串） */
  at: string;
}

/** 讀檔失敗畫面上正在做的動作 */
export type LoadBusy = 'retry' | 'restore' | null;

/** completeSubTaskData 的選項（說明見 AppDataContext.tsx） */
export interface CompleteSubTaskOptions {
  rewardTickets?: number;
  recordId?: string;
}

/** revertTaskCompletion 的選項：recordId 指定要撤銷哪一筆完成紀錄 */
export interface RevertTaskCompletionOptions {
  recordId?: string;
}

/** useAppData() 回傳的內容 */
export interface AppDataContextValue {
  data: LifeSyncData;
  setData: Dispatch<SetStateAction<LifeSyncData>>;
  /** 把 updater 的結果合併進目前的資料（{ ...prev, ...結果 }） */
  updateData: (updater: DataUpdater) => void;
  /** 還沒讀完資料（讀檔失敗時也保持 true） */
  isLoading: boolean;
  loadError: LoadErrorState | null;
  loadBusy: LoadBusy;
  /** 上一次「從備份還原」失敗的原因 */
  restoreFailure: LoadErrorInfo | null;
  retryLoad: () => Promise<void>;
  /** 能不能從自動備份還原（只有 Electron 可以） */
  canRestoreFromBackup: boolean;
  restoreFromBackup: () => Promise<void>;
  /** 從備份還原成功後的提示內容 */
  restoreNotice: RestoreInfo | null;
  dismissRestoreNotice: () => void;
  /** 這台電腦解不開的雲端密碼欄位 */
  secretsUnavailable: SecretField[];
  dismissSecretsNotice: () => void;
  /** 設定頁重新輸入了解不開的密碼時呼叫，提示裡就不再列這個欄位 */
  markSecretReentered: (field: SecretField) => void;
  saveError: SaveFailure | null;
  isRetryingSave: boolean;
  retrySaveNow: () => void;
  /** 成就與維度的進度（'total' 算全部維度） */
  getIndicatorStats: (indicatorId: AchievementCategory) => number;
  reorderPriorityTasks: typeof renumberPriorityTasks;
  /** 目前要先做完的優先任務（依順位排好） */
  activePriorityTasks: SubTask[];
  /** 今天的本地日期 'YYYY-MM-DD'（程式開著跨過午夜時會更新） */
  todayStr: string;
  /** 完成整個計畫 */
  toggleMajorTask: (taskId: string) => void;
  /** 恢復已完成的計畫 */
  restoreMajorTask: (taskId: string) => void;
  revertTaskCompletion: (id: string, skipTicketUpdate?: boolean, options?: RevertTaskCompletionOptions) => void;
  uncompleteSubTask: (id: string) => void;
  deleteSubTask: (id: string) => void;
  deleteMajorTask: (id: string) => void;
  stopSubTask: (id: string) => void;
  restoreStoppedSubTask: (id: string) => void;
  /** 完成一個任務；被拒絕時回傳 null，成功時回傳完成前的任務。這裡不發券 */
  completeSubTaskData: (id: string, options?: CompleteSubTaskOptions) => SubTask | null;
  addPomodoroRecord: (record: PomodoroRecord) => void;
  deletePomodoroRecord: (id: string) => void;
  addLotteryTickets: (amount: number) => void;
  /** 券不夠時回傳 false、不扣 */
  consumeLotteryTickets: (amount: number) => boolean;
  ticketNotification: TicketNotification | null;
  setTicketNotification: Dispatch<SetStateAction<TicketNotification | null>>;
  /** 雲端同步、完整備份進行中（顯示進度面板） */
  isSyncing: boolean;
  setIsSyncing: Dispatch<SetStateAction<boolean>>;
  syncProgress: CloudProgress | null;
  setSyncProgress: Dispatch<SetStateAction<CloudProgress | null>>;
}

export const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

/** 取得全 App 共用的資料與操作。必須在 AppDataProvider 裡面使用，否則丟出錯誤 */
export const useAppData = (): AppDataContextValue => {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
};
