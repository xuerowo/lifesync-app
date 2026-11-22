// 預設資料的唯一來源。
// 主程序（electron/main.ts、electron/storage.ts）、開發伺服器（server.ts）與畫面端都從這裡取得預設值。
// 這個檔案不可有 JSX、不可 import 瀏覽器或 Electron 專用模組，型別只能用 import type：
// server.ts 是用 Node 直接執行的（Node 會把型別刪掉再跑），不經過打包工具。

import { fillPlanSortOrders, fillTaskSortOrders } from './taskOrder.ts';
import type { CloudConfig, IndicatorId, LifeSyncData, LotteryPrize, MajorTask, Rarity, SubTask } from '../types/data.ts';

export const RARITIES: Rarity[] = ['N', 'R', 'SR', 'SSR', 'UR'];

// 每次呼叫都回傳全新物件，避免不同呼叫端共用同一個陣列而互相污染
export const DEFAULT_LOTTERY_PRIZES = (): Record<Rarity, LotteryPrize[]> => ({ N: [], R: [], SR: [], SSR: [], UR: [] });

export const DEFAULT_LOTTERY_PROBABILITY = (): Record<Rarity, number> => ({ N: 50, R: 25, SR: 15, SSR: 8, UR: 2 });

export const DEFAULT_CLOUD_CONFIG = (): CloudConfig => ({
  type: 'webdav',
  url: '',
  username: '',
  password: '',
  masterPassword: '',
  enabled: false,
});

const GOAL_CATEGORIES: IndicatorId[] = ['growth', 'health', 'happiness'];

// 改過名字的維度代號：舊代號 → 新代號。
// 2026-11-22 起「學習」改名「成長」，代號 learning 改成 growth。
// 每次讀檔、匯入、還原、雲端下載都會經過 normalizeData，舊資料（包括舊備份）一律在這裡換成新代號。
// 只換一次、不會連續換：以後如果 growth 又改名成 X，要寫 growth: 'X'，並把 learning 也直接改成指向 'X'。
export const LEGACY_INDICATOR_IDS: Readonly<Record<string, IndicatorId>> = Object.freeze({ learning: 'growth' });

/** 舊的維度代號換成新的；其他值原樣回傳 */
export function migrateIndicatorId<T>(id: T): T | IndicatorId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_INDICATOR_IDS, id)
    ? LEGACY_INDICATOR_IDS[id]
    : id;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const toArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// 陣列裡每個物件的某個欄位如果是舊代號，換成新代號；沒變的物件沿用原本的參考
function migrateField<T>(list: T[], field: string): T[] {
  return list.map((item) => {
    if (!isPlainObject(item)) return item;
    const next = migrateIndicatorId(item[field]);
    return next === item[field] ? item : { ...item, [field]: next };
  });
}

// 帶有維度代號的欄位：[頂層陣列, 欄位名稱]
const INDICATOR_REF_FIELDS = [
  ['majorTasks', 'indicatorId'],
  ['subTasks', 'indicatorId'],
  ['archivedTasks', 'indicatorId'],
  ['archivedSubTasks', 'indicatorId'],
  ['taskHistory', 'indicatorId'],
  ['archivedGoals', 'indicatorId'],
  ['achievements', 'type'],
] as const;

/** 番茄鐘這一輪的任務清單（也存在 localStorage）裡的舊維度代號換成新的；不是陣列時原樣回傳 */
export function migrateTaskList<T>(tasks: T): T {
  // T 是陣列時 migrateField 回傳同樣元素型別的陣列，所以回傳值仍是 T
  return (Array.isArray(tasks) ? migrateField(tasks, 'indicatorId') : tasks) as T;
}

// 頂層的陣列欄位：讀到不是陣列的值時一律換成 []
const ARRAY_FIELDS = [
  'majorTasks',
  'subTasks',
  'archivedTasks',
  'archivedSubTasks',
  'rewardHistory',
  'archivedGoals',
  'achievements',
  'notes',
  'rules',
  'pomodoroHistory',
  'taskHistory',
] as const;

type ArrayField = (typeof ARRAY_FIELDS)[number];

const hasValidId = (item: Record<string, unknown>): boolean => typeof item.id === 'string' && item.id !== '';

/**
 * 卡池某個稀有度的獎品清單：是物件但沒有 id（或 id 不是非空字串）的，複製一份補上 id。
 * 舊版加的單張圖片獎品沒有 id；沒有 id 時，卡池設定刪除、移動其中一個會連帶影響其他沒有 id 的獎品。
 * - 補上的 id 是固定的「legacy-稀有度-位置」（例如 legacy-UR-0），不是亂數：
 *   補上的 id 要等下一次存檔才會寫進檔案，在那之前每次讀檔、每台電腦（以後的手機）讀到的都要一樣，
 *   同步時才不會把同一個獎品當成兩個。同一個稀有度裡位置不同，所以不會重複；
 *   萬一剛好和已有的 id 相同，就在後面加上 -2、-3……
 * - 已有 id 的獎品沿用原本的參考；沒有要補的時候回傳原本的陣列
 * - 不是物件的項目原樣保留（陣列裡每一筆的內容不逐筆檢查，見 src/types/data.ts 開頭）
 */
function ensurePrizeIds(list: unknown[], rarity: string): unknown[] {
  if (!list.some((item) => isPlainObject(item) && !hasValidId(item))) return list;
  const used = new Set(list.filter((item) => isPlainObject(item) && hasValidId(item)).map((item) => (item as { id: string }).id));
  return list.map((item, index) => {
    if (!isPlainObject(item) || hasValidId(item)) return item;
    const base = `legacy-${rarity}-${index}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return { ...item, id };
  });
}

export function createDefaultData(): LifeSyncData {
  return {
    goals: { growth: [], health: [], happiness: [] },
    majorTasks: [],
    subTasks: [],
    archivedTasks: [],
    archivedSubTasks: [],
    rewardFolderPath: '',
    lotteryPrizes: DEFAULT_LOTTERY_PRIZES(),
    lotteryProbability: DEFAULT_LOTTERY_PROBABILITY(),
    rewardHistory: [],
    archivedGoals: [],
    achievements: [],
    notes: [],
    rules: [],
    pomodoroHistory: [],
    lotteryTickets: 0,
    taskHistory: [],
    cloudConfig: DEFAULT_CLOUD_CONFIG(),
  };
}

/**
 * normalizeData 整理到一半的資料：頂層欄位的值還沒確定格式。
 * 陣列欄位先當成 unknown[]，最後才當成 LifeSyncData 回傳（見函式最後的說明）。
 */
type Draft = Record<string, unknown> & Record<ArrayField, unknown[]>;

// 把任意輸入補成完整、格式正確的資料。
// - 不修改傳入的 raw（只做淺層複製，巢狀的陣列/物件沿用原本的參考）
// - 保留 raw 中未知的額外欄位，避免丟資料
// - 處理舊格式：刪除 rewards；沒有 notes 但有 diaries 時轉成 notes；舊的維度代號換成新的（見 LEGACY_INDICATOR_IDS）
// - 卡池裡沒有 id 的獎品補上固定的 id（見 ensurePrizeIds）
export function normalizeData(raw: unknown): LifeSyncData {
  if (!isPlainObject(raw)) return createDefaultData();

  const defaults = createDefaultData();
  // rewards 是舊版欄位，取出來只是為了不放進 rest
  const { rewards, ...rest } = raw;
  // 陣列欄位下一行就會全部換成 toArray 的結果，這裡先當成已經是陣列
  const result = { ...defaults, ...rest } as Draft;

  for (const field of ARRAY_FIELDS) {
    result[field] = toArray(raw[field]);
  }

  // 舊版的日記（diaries）遷移成筆記（notes）
  if (!Array.isArray(raw.notes) && Array.isArray(raw.diaries)) {
    result.notes = raw.diaries.map((d: unknown) =>
      isPlainObject(d) ? { ...d, title: d.title || d.date || '無標題' } : d
    );
  }

  // 舊的維度代號換成新的
  for (const [field, key] of INDICATOR_REF_FIELDS) {
    result[field] = migrateField(result[field], key);
  }
  result.pomodoroHistory = result.pomodoroHistory.map((session) => {
    if (!isPlainObject(session) || !Array.isArray(session.tasks)) return session;
    const original: unknown[] = session.tasks;
    const tasks = migrateTaskList(original);
    return tasks.every((t, i) => t === original[i]) ? session : { ...session, tasks };
  });

  // 計畫與任務的排列順序：舊資料沒有 sortOrder，照升級前畫面上的順序補上（見 taskOrder.ts）。
  // 陣列裡的每一筆不逐筆檢查（taskOrder 的函式會略過不是物件的項目），這裡當成計畫、任務的陣列傳進去
  result.majorTasks = fillPlanSortOrders(result.majorTasks as MajorTask[], result.subTasks as SubTask[]);
  result.subTasks = fillTaskSortOrders(result.subTasks as SubTask[]);

  const goals: Record<string, unknown> = isPlainObject(raw.goals) ? { ...raw.goals } : {};
  // 目標的分類鍵：舊代號底下的目標併到新代號底下（兩邊都有時，新的在前、舊的接在後面，同一個 id 只留一個）
  for (const [oldId, newId] of Object.entries(LEGACY_INDICATOR_IDS)) {
    if (!Object.prototype.hasOwnProperty.call(goals, oldId)) continue;
    const current = toArray(goals[newId]);
    const ids = new Set(current.map((g) => (isPlainObject(g) ? g.id : undefined)).filter((id) => id !== undefined));
    const extra = toArray(goals[oldId]).filter((g) => !(isPlainObject(g) && g.id !== undefined && ids.has(g.id)));
    goals[newId] = [...current, ...extra];
    delete goals[oldId];
  }
  for (const category of GOAL_CATEGORIES) {
    goals[category] = toArray(goals[category]);
  }
  result.goals = goals;

  result.rewardFolderPath = typeof raw.rewardFolderPath === 'string' ? raw.rewardFolderPath : '';

  const prizes: Record<string, unknown> = isPlainObject(raw.lotteryPrizes) ? { ...raw.lotteryPrizes } : {};
  for (const rarity of RARITIES) {
    prizes[rarity] = ensurePrizeIds(toArray(prizes[rarity]), rarity);
  }
  result.lotteryPrizes = prizes;

  const probability: Record<string, unknown> = isPlainObject(raw.lotteryProbability) ? { ...raw.lotteryProbability } : {};
  const defaultProbability = DEFAULT_LOTTERY_PROBABILITY();
  for (const rarity of RARITIES) {
    const value = probability[rarity];
    const num = typeof value === 'number' ? value : Number(value);
    probability[rarity] = value !== null && value !== '' && Number.isFinite(num) ? num : defaultProbability[rarity];
  }
  result.lotteryProbability = probability;

  result.cloudConfig = isPlainObject(raw.cloudConfig)
    ? { ...DEFAULT_CLOUD_CONFIG(), ...raw.cloudConfig }
    : DEFAULT_CLOUD_CONFIG();

  const tickets = Number(raw.lotteryTickets);
  result.lotteryTickets = raw.lotteryTickets !== null && Number.isFinite(tickets) ? tickets : 0;

  // 到這裡，頂層每個欄位都已經是正確的格式（陣列欄位是陣列、goals／lotteryPrizes／lotteryProbability／cloudConfig
  // 有該有的鍵、rewardFolderPath 是字串、lotteryTickets 是數字、卡池裡是物件的獎品都有 id）。陣列裡每一筆的內容沒有逐筆檢查，
  // 沿用原檔（這是原本的行為），所以讀巢狀欄位時仍要保留防呆，見 src/types/data.ts 開頭的說明。
  return result as unknown as LifeSyncData;
}
