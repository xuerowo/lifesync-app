// App 管理、傳給各畫面的編輯狀態（不是資料檔的格式；資料檔見 data.ts）。
// 由各畫面呼叫 App 傳下去的 setEditingTask、setRewardToShow…… 設定，App 再傳給對應的編輯視窗。

import type { MajorTask, Note, RewardHistoryRecord, SubTask, TaskHistoryRecord } from './data.ts';

/** 正在編輯的計畫或任務（TaskEditor）。新增時 item 是還沒存進資料的新物件 */
export type EditingTask = { type: 'major'; item: MajorTask } | { type: 'sub'; item: SubTask };

/** 正在編輯的抽卡紀錄（HistoryEditor）。補登新紀錄時還沒有 id */
export type EditingRewardHistory = Omit<RewardHistoryRecord, 'id'> & { id?: string };

/** 正在編輯的任務完成紀錄（TaskHistoryEditor）。補登新紀錄時還沒有 id */
export type EditingTaskHistory = Omit<TaskHistoryRecord, 'id'> & { id?: string };

/** 正在編輯的筆記（NoteEditor）。新增時是還沒存進資料的新筆記 */
export type EditingNote = Note;

/**
 * 抽卡結果畫面要顯示的內容（RewardsView 設定）：
 * - 十連抽：isMulti 為 true，results 是這次抽到的紀錄
 * - 單抽、或在獎勵庫點開一疊相同的獎勵：一筆抽卡紀錄；點開一疊時另外帶 groupIds（這疊每一筆的 id）與 totalInStack（張數）
 */
export type RewardToShow =
  | { isMulti: true; results: RewardHistoryRecord[] }
  | (RewardHistoryRecord & { isMulti?: undefined; groupIds?: string[]; totalInStack?: number });

/** 單抽畫面的階段：卡包、開包動畫、翻開；十連抽是 multi-pack */
export type RewardStage = 'pack' | 'opening' | 'revealed' | 'multi-pack';
