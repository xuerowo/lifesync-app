// 主程序透過 electron/preload 提供給畫面的功能（window.electronAPI）。
// 每個方法對應 electron/main.ts、electron/cloudManager.ts、electron/focusDiagnostics.ts 裡的一個 IPC 處理程序，
// 參數和回傳值的格式照那邊實際的寫法。
//
// 瀏覽器模式（server.ts）沒有 window.electronAPI，所以它是可以沒有的（?）；
// 用之前一律先判斷，例如 `if (window.electronAPI)`、`typeof api?.snapshotData === 'function'`。
//
// 經過 IPC 的值會被複製一份（structured clone）：Node 的 Buffer 到畫面會變成 Uint8Array，函式和 class 不會過來。

import type { CloudConfig, LifeSyncData } from './data.ts';

/** cloudConfig 裡加密存放的欄位：WebDAV 密碼、資料加密主密碼 */
export type SecretField = 'password' | 'masterPassword';

// ---------------------------------------------------------------------------
// 讀檔
// ---------------------------------------------------------------------------

/** 讀檔成功：ok 是讀到既有的資料檔，new 是第一次使用（沒有資料檔也沒有備份） */
export interface LoadSuccess {
  status: 'ok' | 'new';
  /** 已經過 normalizeData，密碼已解密 */
  data: LifeSyncData;
  /** 這台電腦解不開的密碼欄位（例如資料是從另一台電腦搬過來的），設定頁會是空白 */
  secretsUnavailable: SecretField[];
}

/**
 * 讀檔失敗。讀檔失敗後主程序會暫停存檔，避免空白資料蓋掉原檔。
 * code：PARSE_ERROR（內容壞掉）、INVALID_FORMAT（不是物件）、MISSING_WITH_BACKUPS（沒有資料檔但有備份）、
 * RESTORE_NOT_ALLOWED、NO_BACKUP、RESTORE_FAILED，或 Node 的錯誤碼（EBUSY、EPERM、EACCES……）
 */
export interface LoadFailure {
  status: 'error';
  code: string;
  error: string;
  /** 資料檔的完整路徑（讀檔失敗畫面上顯示） */
  dataFile?: string;
  /** 備份資料夾的完整路徑 */
  backupDir?: string;
}

export type LoadResult = LoadSuccess | LoadFailure;

/** 從自動備份還原時多帶的資訊 */
export interface RestoreInfo {
  /** 用了哪一份備份（完整路徑） */
  restoredFrom: string;
  /** 那份備份的修改時間；讀不到時是 null */
  restoredFromTime: string | null;
  /** 原本讀不出來的資料檔改名保留在哪裡；原本就沒有資料檔時是 null */
  preservedAs: string | null;
}

/**
 * 「載入最近一次自動備份」的結果。還原後重新讀檔仍失敗時，是帶著 RestoreInfo 的 LoadFailure；
 * 根本沒還原（沒有備份、不允許）時只有 LoadFailure。
 */
export type RestoreBackupResult = (LoadSuccess & RestoreInfo) | (LoadFailure & Partial<RestoreInfo>);

// ---------------------------------------------------------------------------
// 存檔、快照
// ---------------------------------------------------------------------------

/**
 * save-data 的結果。失敗時不丟錯、回傳 code（丟錯經過 IPC 之後錯誤碼會不見）：
 * SAVE_BLOCKED 表示上次讀檔失敗、存檔被擋下（重試也沒用）。
 * superseded：這次的內容已經被更新的存檔取代，沒有寫入（不算失敗）。
 */
export type SaveResult =
  | { success: true; superseded?: boolean }
  | { success: false; code: string; error: string };

/** save-data-sync（關窗前同步存檔）的結果 */
export type SaveSyncResult = { success: true } | { success: false; error: string };

/** 覆蓋本機資料前拍快照的參數 */
export interface SnapshotPayload {
  /** 原因，會寫進快照檔名，例如 before-cloud-restore（見 src/domain/overwriteGuard.ts 的 SNAPSHOT_REASONS） */
  reason?: string;
  /** 畫面上目前的資料：先存好再拍，快照才不會漏掉最後幾秒的修改 */
  data?: LifeSyncData;
}

/** path 是快照檔的完整路徑；本來就沒有資料檔可拍時是 null。code 例如 EEXIST、ENOSPC、SNAPSHOT_BLOCKED */
export type SnapshotResult =
  | { success: true; path: string | null }
  | { success: false; code: string; error: string };

// ---------------------------------------------------------------------------
// 圖片
// ---------------------------------------------------------------------------

/** 掃描資料夾找到的圖片 */
export interface ScannedImage {
  name: string;
  /** 完整路徑 */
  path: string;
}

export type ScanFolderResult =
  | { success: true; images: ScannedImage[]; count: number }
  | { success: false; error: string };

/** 複製進圖庫的圖片 */
export interface SyncedImage {
  originalPath: string;
  /** 相對於資料資料夾的路徑，例如 'gallery\cat.jpg' */
  path: string;
  name: string;
}

/** 複製失敗的圖片不會出現在 images 裡（只記在主程序的紀錄），所以 count 可能比傳入的張數少 */
export type SyncImagesResult =
  | { success: true; images: SyncedImage[]; count: number }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// 雲端
// ---------------------------------------------------------------------------

/** 失敗時的 error 是給使用者看的完整文字（白話說明＋技術細節，見 src/shared/errorMessages.ts） */
export type CloudTestResult = { success: true } | { success: false; error: string };

export interface CloudUploadPayload {
  config: CloudConfig;
  /** 雲端上的檔名，目前固定是 lifesync_backup_e2ee.dat */
  fileName: string;
  /** encryptData（src/utils/crypto.ts）加密後的內容 */
  encryptedData: ArrayBuffer;
}

export type CloudUploadResult =
  | {
      success: true;
      /** 雲端上原本那份另存成的舊版檔名；雲端上原本沒有檔案時是 null */
      versionedAs: string | null;
      /** 最多保留幾份舊版 */
      keep: number;
      /** 上傳成功但有舊版沒刪掉時的提醒 */
      warning: string | null;
    }
  | {
      success: false;
      error: string;
      /** 已經另存了舊版、但上傳失敗時才有 */
      versionedAs?: string | null;
    };

export interface CloudDownloadPayload {
  config: CloudConfig;
  fileName: string;
}

/** data 是加密的檔案內容（主程序的 Buffer 到畫面會變成 Uint8Array），用 decryptData 解開 */
export type CloudDownloadResult = { success: true; data: Uint8Array } | { success: false; error: string };

export interface CloudGalleryPayload {
  config: CloudConfig;
  masterPassword: string;
}

/** 失敗的圖片（最多記前幾筆，見 electron/galleryFiles.ts 的 pushError） */
export interface GalleryError {
  name: string;
  reason: string;
}

export interface GalleryUploadResults {
  uploaded: number;
  skipped: number;
  failed: number;
  total: number;
  aborted: boolean;
  errors: GalleryError[];
}

export interface GalleryDownloadResults {
  downloaded: number;
  skipped: number;
  failed: number;
  total: number;
  aborted: boolean;
  errors: GalleryError[];
}

export type CloudSyncGalleryResult =
  | { success: true; results: GalleryUploadResults; aborted: boolean }
  | { success: false; error: string };

export type CloudRestoreGalleryResult =
  | { success: true; results: GalleryDownloadResults; aborted: boolean }
  | { success: false; error: string };

/** 雲端同步、完整備份進行中的進度（cloud-progress 事件） */
export interface CloudProgress {
  /** 第幾個、共幾個；畫面端自己顯示的進度（例如「準備匯出……」）只有文字，沒有這兩個 */
  current?: number;
  total?: number;
  message: string;
}

// ---------------------------------------------------------------------------
// 完整備份
// ---------------------------------------------------------------------------

export interface ExportFullBackupPayload {
  /** 使用者選的資料夾；備份會建在它底下的 LifeSync_Backup_日期_時間 */
  targetDir: string;
  /** 要備份的資料（主程序會清掉密碼再寫入） */
  data: LifeSyncData;
}

/**
 * aborted：中途取消，這時 path 是還沒改名的「.partial」資料夾。
 * 失敗時 path 是留下來、不完整的資料夾；沒有留下時是 null。
 */
export type ExportFullBackupResult =
  | { success: true; path: string; aborted: boolean }
  | { success: false; path: string | null; error: string };

/** 還原完整備份時，備份裡的圖片複製回圖庫的結果（electron/backupGallery.ts） */
export interface BackupGalleryRestore {
  /** 備份裡有沒有 gallery 資料夾；沒有時不算錯，其他欄位都是 0 */
  found: boolean;
  /** gallery 資料夾裡有幾張要複製（只算檔案，子資料夾略過） */
  total: number;
  copied: number;
  failed: number;
  /** 失敗的檔名和原文（最多 MAX_ERROR_DETAILS 筆） */
  errors: GalleryError[];
  /** gallery 資料夾在、但整個讀不到時的說明（白話＋技術細節）；這時一張都沒有複製 */
  listError: string | null;
}

/**
 * data 是備份裡的 lifesync-data.json 原樣讀出來的內容（只確認過「看起來是 LifeSync 的資料」），
 * 還沒經過 normalizeData，所以是 unknown；要用 mergeIncomingData 合併進目前的資料。
 * 圖片有幾張複製失敗時仍是 success：資料照樣還原，gallery 寫出哪些圖片沒有複製。
 */
export type ImportFullBackupResult =
  | { success: true; data: unknown; aborted: boolean; gallery: BackupGalleryRestore }
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// 整個介面
// ---------------------------------------------------------------------------

/** 取消監聽用的函式 */
export type Unsubscribe = () => void;

export interface ElectronAPI {
  getData(): Promise<LoadResult>;
  /** 只有上次讀檔失敗時才會真的還原；壞掉的資料檔會改名保留，不會刪除 */
  restoreLatestBackup(): Promise<RestoreBackupResult>;
  saveData(data: LifeSyncData): Promise<SaveResult>;
  /** 關窗或重新整理前用：同步等到寫入完成 */
  saveDataSync(data: LifeSyncData): SaveSyncResult;
  snapshotData(payload: SnapshotPayload): Promise<SnapshotResult>;
  scanFolder(folderPath: string): Promise<ScanFolderResult>;
  /** 把圖片複製進圖庫（同名但內容不同時自動改名） */
  syncImages(imagePaths: string[]): Promise<SyncImagesResult>;
  /** 讀圖片成 data: 網址；不允許讀的路徑或讀不到時是 null */
  readImageBase64(filePath: string): Promise<string | null>;
  cloudTestConnection(config: CloudConfig): Promise<CloudTestResult>;
  cloudUpload(payload: CloudUploadPayload): Promise<CloudUploadResult>;
  cloudDownload(payload: CloudDownloadPayload): Promise<CloudDownloadResult>;
  cloudSyncGallery(payload: CloudGalleryPayload): Promise<CloudSyncGalleryResult>;
  cloudRestoreGallery(payload: CloudGalleryPayload): Promise<CloudRestoreGalleryResult>;
  /** 選資料夾；按取消時是 null */
  selectDirectory(): Promise<string | null>;
  exportFullBackup(payload: ExportFullBackupPayload): Promise<ExportFullBackupResult>;
  importFullBackup(backupDir: string): Promise<ImportFullBackupResult>;
  onCloudProgress(callback: (progress: CloudProgress) => void): Unsubscribe;
  /** 取消雲端圖庫同步、完整備份的匯出與還原 */
  cancelCloudSync(): Promise<{ success: true }>;
  /** 番茄鐘時間到、等使用者按按鈕：true 讓工作列圖示閃爍，false 停止 */
  setAttention(on: boolean): void;
  /** 取代 window.alert：由主程序顯示 Windows 標準訊息框，等使用者按完才回傳 */
  alertSync(message: string): void;
  /** 取代 window.confirm：按「確定」才是 true */
  confirmSync(message: string): boolean;
  /** 點了畫面、頁面卻沒有鍵盤焦點時，請主程序把焦點交回頁面 */
  refocusPage(): void;
  /** 焦點診斷記錄有沒有開 */
  isFocusDiagnosticsEnabled(): Promise<boolean>;
  onFocusDiagnosticsToggle(callback: (enabled: boolean) => void): Unsubscribe;
  /** 主程序要畫面回傳目前的焦點狀態（按 Ctrl+Shift+F12 時） */
  onFocusDiagnosticsRequest(callback: (requestId: number) => void): Unsubscribe;
  /** 回傳焦點狀態；result 會原樣寫進診斷檔 */
  sendFocusDiagnostics(requestId: number, result: unknown): void;
}

declare global {
  interface Window {
    /** 只有在 Electron 裡才有；瀏覽器模式（server.ts）沒有 */
    electronAPI?: ElectronAPI;
  }
}
