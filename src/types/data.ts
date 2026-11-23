// 資料檔（lifesync-data.json）的格式：LifeSyncData 和裡面每一種紀錄。
//
// 怎麼讀這份檔案：
// - 這裡描述的是「程式寫出來的樣子」。舊版程式存的檔案、手動改過的檔案可能缺欄位，
//   程式碼裡有防呆（例如 `task.title || '未命名'`）的欄位，這裡都標成可以沒有（?）。
// - normalizeData（src/shared/defaultData.ts）只保證「頂層」格式正確：每個陣列欄位一定是陣列、
//   goals／lotteryPrizes／lotteryProbability／cloudConfig 一定有該有的鍵。陣列裡每一筆的內容不逐筆檢查，
//   沿用原檔（這是原本的行為）。所以讀巢狀欄位時，仍要照原本的寫法保留防呆。
//   例外：卡池（lotteryPrizes）裡的獎品是物件但沒有 id 時，會補上新的 id；
//   抽卡紀錄（rewardHistory）是物件但沒有有效的 odds 時，會補上推算的 odds（見 RewardHistoryRecord.odds）。
// - normalizeData 也會保留看不懂的頂層欄位（例如舊版的 diaries、以後的 _sync），這裡沒有列出。
//
// 時間欄位有四種格式，換算方式不同，詳見 src/domain/dates.ts 開頭：
// - UtcIsoString：真正的 UTC 時間，例如 2026-03-04T17:30:00.000Z
// - LocalStampedIsoString：本地時間，但結尾也標了 Z（getLocalISOString 產生），前 10 個字就是本地日期
// - LocalDateTimeString：本地時間、沒有 Z，例如 2026-03-05T09:00
// - DateOnlyString：只有日期，例如 2026-03-05
// 這四種在型別上都是 string，取別名只是讓欄位說明更清楚，不會互相擋。

/** 真正的 UTC 時間（new Date().toISOString()） */
export type UtcIsoString = string;
/** 本地時間、結尾標了 Z（getLocalISOString 產生）；前 10 個字是本地日期 */
export type LocalStampedIsoString = string;
/** 本地時間、沒有時區，'YYYY-MM-DDTHH:mm'（日期時間輸入框的值） */
export type LocalDateTimeString = string;
/** 只有日期 'YYYY-MM-DD' */
export type DateOnlyString = string;
/** 只有時間 'HH:mm'（每日／每週任務的開始、結束時間） */
export type TimeOfDayString = string;

// ---------------------------------------------------------------------------
// 維度與目標
// ---------------------------------------------------------------------------

/**
 * 維度（畫面上的「成長、健康、幸福」）的代號。
 * 2026-11-22 以前「成長」叫「學習」，代號是 learning；讀檔時 normalizeData 會換成 growth。
 */
export type IndicatorId = 'growth' | 'health' | 'happiness';

/** 成就的類別：某個維度，或 total（全部維度加起來） */
export type AchievementCategory = IndicatorId | 'total';

/** 目標（維度頁上每個維度底下的一條） */
export interface Goal {
  id: string;
  title: string;
  /** 建立時的序號（從 1 開始）；目前畫面用陣列先後排，這個值沒有拿來排序 */
  order?: number;
}

/** 已達成的目標（從 goals 移到 archivedGoals） */
export interface ArchivedGoal extends Goal {
  /** 原本在哪個維度底下（恢復時放回去） */
  indicatorId: IndicatorId;
  /** 按「達成」的時間 */
  completedAt: UtcIsoString;
}

// ---------------------------------------------------------------------------
// 計畫與任務
// ---------------------------------------------------------------------------

/**
 * 任務類型：
 * - precise：一次性任務（完成一次就收進「已結束」）
 * - daily：每日任務
 * - weekly：每週任務（只在 days 指定的星期出現）
 * - infinite：隨時挑戰（不限次數、不能設成優先、不顯示在日曆）
 * 每日、每週、隨時挑戰合稱「重複任務」，有完成次數（completionCount）。
 */
export type TaskType = 'precise' | 'daily' | 'weekly' | 'infinite';

/** 計畫（程式裡叫 majorTask）。進行中的在 majorTasks，完成的在 archivedTasks */
export interface MajorTask {
  id: string;
  indicatorId: IndicatorId;
  /** 屬於哪個目標；目標被刪掉後這個 id 會找不到，畫面就不顯示目標名稱 */
  goalId?: string;
  title?: string;
  startDate?: DateOnlyString;
  endDate?: DateOnlyString;
  completed?: boolean;
  /** 完成整個計畫的時間（只有 archivedTasks 裡的有） */
  completedAt?: UtcIsoString;
  createdAt?: UtcIsoString;
  /**
   * 使用者自己排的順序，由小到大顯示（見 src/shared/taskOrder.ts）。
   * 舊資料沒有，讀檔時補上；已完成的計畫不一定有。
   */
  sortOrder?: number;
}

/** 計畫裡的任務（程式裡叫 subTask）。進行中的在 subTasks */
export interface SubTask {
  id: string;
  /** 屬於哪個計畫 */
  majorTaskId?: string;
  /** 跟著計畫的維度（建立時複製過來） */
  indicatorId?: IndicatorId;
  goalId?: string;
  title?: string;
  type: TaskType;
  /** 每日／每週任務的時間（noTime 為 true 時不用） */
  startTime?: TimeOfDayString;
  endTime?: TimeOfDayString;
  /** 每週任務在星期幾出現（0 = 星期日）；新任務預設週一到週五 */
  days?: number[];
  /** 一次性任務的開始、結束時間（noTime 為 true 時不用） */
  startDateTime?: LocalDateTimeString;
  endDateTime?: LocalDateTimeString;
  /** 不限時間 */
  noTime?: boolean;
  /**
   * 一次性任務：真的完成了。
   * 重複任務在進行中時一律是 false；停止（見 ArchivedSubTask.stoppedAt）時存成 true，
   * 這是沿用改版前「終止並歸檔」的格式，不代表真的完成。
   */
  completed?: boolean;
  /** 收進 archivedSubTasks 的時間（完成、停止，或跟著計畫收起來） */
  completedAt?: UtcIsoString;
  /** 優先任務：要照 priorityOrder 的順序先做完，其他任務（隨時挑戰除外）才解鎖 */
  isPriority?: boolean;
  /** 優先順位，1 是第一個；不是優先任務時是 0 */
  priorityOrder?: number;
  /** 完成一次給幾張抽卡券；沒有這個欄位時當作 1 張 */
  rewardTickets?: number;
  createdAt?: UtcIsoString;
  /** 重複任務完成了幾次（成就和維度進度用它算）；一次性任務沒有 */
  completionCount?: number;
  /** 重複任務最近一次完成的時間；撤銷到沒有紀錄時是 null */
  lastCompletedAt?: LocalStampedIsoString | null;
  /** 在同一個計畫裡的順序，由小到大顯示（見 src/shared/taskOrder.ts） */
  sortOrder?: number;
}

/**
 * 「已結束」區的任務（archivedSubTasks）。有三種來源，靠欄位組合分辨（見 src/domain/tasks.ts 的 isStoppedTask）：
 * - 完成的一次性任務：completed 為 true，沒有 archivedWithPlanId
 * - 停止的重複任務：類型是每日／每週／隨時挑戰，沒有 archivedWithPlanId（新資料另有 stoppedAt）
 * - 跟著計畫一起收起來、沒做完的任務：有 archivedWithPlanId，completed 為 false
 */
export interface ArchivedSubTask extends SubTask {
  /**
   * 「完成整個計畫」時還在進行中、跟著一起收起來的任務，記下是哪個計畫。
   * 恢復計畫時，有這個標記的任務會一起回到進行中。舊資料沒有這個欄位。
   */
  archivedWithPlanId?: string;
  /** 跟著計畫收起來前的優先順位（原本不是優先任務就沒有），恢復計畫時排回去 */
  priorityOrderBeforeArchive?: number;
  /** 按「停止這個任務」的時間；改版前停止的舊資料沒有 */
  stoppedAt?: UtcIsoString;
}

/** 任務完成紀錄（taskHistory，新的在前） */
export interface TaskHistoryRecord {
  id: string;
  /** 對應的任務；補登時沒選任務就沒有 */
  taskId?: string;
  /** 完成當下的任務名稱（任務改名後紀錄不跟著改） */
  title?: string;
  /** 完成當下的計畫名稱；沒有計畫時是「獨立任務」 */
  majorTaskTitle?: string;
  indicatorId?: IndicatorId;
  /** 完成的時間；很舊的紀錄可能沒有，畫面改看 createdAt */
  completedAt?: UtcIsoString;
  /** 很舊的版本記的時間欄位（只在沒有 completedAt 時拿來顯示） */
  createdAt?: UtcIsoString;
  type?: TaskType;
  /**
   * 這次完成實際給了幾張券（撤銷或刪除時扣回這麼多）。
   * 舊紀錄沒有這個欄位時當作 1 張；番茄鐘裡完成的先記 0 張，結算領取時才改成任務的張數。
   */
  rewardTickets?: number;
}

// ---------------------------------------------------------------------------
// 抽卡
// ---------------------------------------------------------------------------

/** 稀有度，由低到高：N 普通、R 稀有、SR 超稀有、SSR 傳說、UR 神話 */
export type Rarity = 'N' | 'R' | 'SR' | 'SSR' | 'UR';

/**
 * 文字獎品（抽卡紀錄裡的樣子）。
 * 抽卡紀錄裡補登的、或把圖片改成文字的沒有 id；卡池裡的一定有，見 PoolTextPrize。
 */
export interface TextPrize {
  id?: string;
  type: 'text';
  content: string;
}

/**
 * 單張圖片獎品（抽卡紀錄裡的樣子）。卡池裡只有舊資料會有（現在加圖片一律是圖庫）；
 * 抽中圖庫時，抽卡紀錄裡記的也是這種（抽出其中一張，沒有 id）。
 * content 是圖片路徑，圖庫圖片是相對於資料資料夾的 'gallery\檔名'。
 */
export interface ImagePrize {
  id?: string;
  type: 'image';
  content: string;
}

/** 圖庫獎品：一個資料夾的圖片，抽中時再隨機抽一張 */
export interface ImagePoolPrize {
  id: string;
  type: 'image-pool';
  /** 圖片路徑（複製進圖庫後是 'gallery\檔名'） */
  content: string[];
  /** 當初從哪個資料夾加入的（只用來顯示名稱） */
  folderPath?: string;
}

/**
 * 卡池裡的文字、單張圖片獎品：一定有 id。
 * 舊資料裡沒有 id 的，讀檔時 normalizeData 會補上（src/shared/defaultData.ts 的 ensurePrizeIds）。
 */
export type PoolTextPrize = TextPrize & { id: string };
export type PoolImagePrize = ImagePrize & { id: string };

/** 卡池裡的獎品（一定有 id） */
export type LotteryPrize = PoolTextPrize | PoolImagePrize | ImagePoolPrize;

/** 抽出來的獎品（圖庫會換成抽中的那一張圖） */
export type DrawnPrize = TextPrize | ImagePrize;

/** 抽卡紀錄（rewardHistory，新的在前）。claimed 為 false 的就是「待領取」 */
export interface RewardHistoryRecord {
  id: string;
  rarity: Rarity;
  prize: DrawnPrize;
  /** 抽到的時間 */
  timestamp: UtcIsoString;
  claimed: boolean;
  /** 領取的時間；改回待領取時是 null */
  claimedAt?: UtcIsoString | null;
  /** 補登紀錄時的備註欄位 */
  taskTitle?: string;
  /**
   * 這一抽各稀有度實際抽得到的機率（百分比，五個加起來是 100）。
   * 是「已經考慮空卡池改抽別的稀有度」之後的機率（src/domain/lottery.ts 的 effectiveOdds），
   * 不一定等於設定的 lotteryProbability。和這筆抽到哪個稀有度無關，編輯紀錄改稀有度時保留原值。
   * 抽卡時記下；改版前的舊紀錄讀檔時由 normalizeData 補上推算值（見 oddsAssumed）。
   * 卡池完全沒有獎品、算不出來時沒有這個欄位。
   */
  odds?: Record<Rarity, number>;
  /**
   * true：odds 是推算的，不是抽的當下記下的。
   * 改版前的舊紀錄（用讀檔當時的卡池和機率設定推算）和補登的紀錄（用補登當時的設定）會是 true；
   * 抽卡時記下的紀錄沒有這個欄位。
   */
  oddsAssumed?: boolean;
}

/** 成就：某個類別的完成次數達到 condition 就可以領取 */
export interface Achievement {
  id: string;
  type: AchievementCategory;
  title?: string;
  /** 需要完成幾次任務 */
  condition: number;
  /** 獎勵內容（使用者自己寫的文字） */
  rewardText?: string;
  claimed?: boolean;
  claimedAt?: UtcIsoString | null;
  createdAt?: UtcIsoString;
}

// ---------------------------------------------------------------------------
// 筆記、行動準則
// ---------------------------------------------------------------------------

export interface Note {
  id: string;
  title?: string;
  content?: string;
  createdAt?: UtcIsoString;
  updatedAt?: UtcIsoString;
  /** 舊版日記（diaries）轉過來的才有：日記的日期 */
  date?: string;
}

/** 行動準則（規則頁的一條） */
export interface Rule {
  id: string;
  content?: string;
  createdAt?: UtcIsoString;
}

// ---------------------------------------------------------------------------
// 番茄鐘
// ---------------------------------------------------------------------------

/**
 * 番茄鐘時間軸上的事件種類（所有時間都從時間軸算，見 src/domain/pomodoroClock.ts）：
 * - focus_start／flow_start／break_start：進入專注、心流（不倒數）、休息
 * - pause_start／pause_end：暫停、繼續
 * - await_start：倒數歸零，等使用者按「開始休息／開始專注」（等待的時間不算）
 * - task_complete：在番茄鐘裡完成了一個任務
 * - end：結束這一輪
 */
export type PomodoroEventType =
  | 'focus_start'
  | 'flow_start'
  | 'break_start'
  | 'pause_start'
  | 'pause_end'
  | 'await_start'
  | 'task_complete'
  | 'end';

/** 番茄鐘時間軸上的一個事件 */
export interface PomodoroEvent {
  type: PomodoroEventType;
  /** 發生的時間 */
  time: UtcIsoString;
  /** pause_start：'app_closed' 表示是程式關閉而自動補上的暫停 */
  reason?: 'app_closed';
  /** await_start：時間到之後下一個階段是休息還是專注 */
  next?: 'break' | 'focus';
  /** task_complete：完成的任務 */
  taskId?: string;
  taskTitle?: string;
  /** task_complete：對應的完成紀錄 id（舊版沒有） */
  recordId?: string;
  /** task_complete：完成當下任務設定的張數，結算領取時照這個給（舊版沒有） */
  rewardTickets?: number;
}

/** 一輪番茄鐘的目標任務（任務的複本，加上這一輪的完成情況） */
export interface PomodoroSessionTask extends SubTask {
  /** 這一輪裡有沒有完成 */
  isCompleted?: boolean;
  /** 這一輪裡完成了幾次（隨時挑戰可以完成很多次） */
  sessionCount?: number;
}

/** 一輪番茄鐘的紀錄（pomodoroHistory，新的在前）。秒數都是浮點數 */
export interface PomodoroRecord {
  id: string;
  startTime: UtcIsoString;
  endTime: UtcIsoString;
  /** 從開始到結束的總秒數（含暫停、休息） */
  totalDuration: number;
  focusDuration: number;
  flowDuration: number;
  breakDuration: number;
  /** 完成了幾個番茄 */
  completedCycles: number;
  timeline: PomodoroEvent[];
  tasks: PomodoroSessionTask[];
}

// ---------------------------------------------------------------------------
// 雲端
// ---------------------------------------------------------------------------

/**
 * 雲端（WebDAV）設定。password、masterPassword 在資料檔裡是加密過的字串（主程序存檔時加密、讀檔時解密），
 * 匯出備份和上傳雲端時會清空（見 src/shared/cloudSecrets.ts）。
 */
export interface CloudConfig {
  type: 'webdav';
  /** WebDAV 伺服器網址 */
  url: string;
  username: string;
  /** WebDAV 的應用程式密碼 */
  password: string;
  /** 資料加密主密碼：上傳前用它加密，下載後用它解密 */
  masterPassword: string;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// 整份資料
// ---------------------------------------------------------------------------

/** 整份資料檔。欄位順序和 createDefaultData 相同 */
export interface LifeSyncData {
  /** 每個維度底下的目標 */
  goals: Record<IndicatorId, Goal[]>;
  /** 進行中的計畫 */
  majorTasks: MajorTask[];
  /** 進行中的任務 */
  subTasks: SubTask[];
  /** 已完成的計畫 */
  archivedTasks: MajorTask[];
  /** 「已結束」區的任務（完成、停止、跟著計畫收起來） */
  archivedSubTasks: ArchivedSubTask[];
  /** 上一次「從資料夾加入圖片」用的資料夾 */
  rewardFolderPath: string;
  /** 各稀有度的卡池 */
  lotteryPrizes: Record<Rarity, LotteryPrize[]>;
  /** 各稀有度的機率（百分比，加起來應該是 100，但程式不強制） */
  lotteryProbability: Record<Rarity, number>;
  /** 抽卡紀錄 */
  rewardHistory: RewardHistoryRecord[];
  /** 已達成的目標 */
  archivedGoals: ArchivedGoal[];
  achievements: Achievement[];
  notes: Note[];
  /** 行動準則 */
  rules: Rule[];
  /** 番茄鐘紀錄 */
  pomodoroHistory: PomodoroRecord[];
  /** 目前持有的抽卡券 */
  lotteryTickets: number;
  /** 任務完成紀錄 */
  taskHistory: TaskHistoryRecord[];
  cloudConfig: CloudConfig;
}
