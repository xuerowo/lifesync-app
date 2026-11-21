// 預設資料的唯一來源。
// 主程序（electron/main.js、electron/storage.js）、開發伺服器（server.js）與畫面端都從這裡取得預設值。
// 這個檔案必須維持純 JS（不可有 JSX、不可 import 瀏覽器或 Electron 專用模組），才能被 Node 直接 import。

export const RARITIES = ['N', 'R', 'SR', 'SSR', 'UR'];

// 每次呼叫都回傳全新物件，避免不同呼叫端共用同一個陣列而互相污染
export const DEFAULT_LOTTERY_PRIZES = () => ({ N: [], R: [], SR: [], SSR: [], UR: [] });

export const DEFAULT_LOTTERY_PROBABILITY = () => ({ N: 50, R: 25, SR: 15, SSR: 8, UR: 2 });

export const DEFAULT_CLOUD_CONFIG = () => ({
  type: 'webdav',
  url: '',
  username: '',
  password: '',
  masterPassword: '',
  enabled: false,
});

const GOAL_CATEGORIES = ['growth', 'health', 'happiness'];

// 改過名字的維度代號：舊代號 → 新代號。
// 2026-11-22 起「學習」改名「成長」，代號 learning 改成 growth。
// 每次讀檔、匯入、還原、雲端下載都會經過 normalizeData，舊資料（包括舊備份）一律在這裡換成新代號。
// 只換一次、不會連續換：以後如果 growth 又改名成 X，要寫 growth: 'X'，並把 learning 也直接改成指向 'X'。
export const LEGACY_INDICATOR_IDS = Object.freeze({ learning: 'growth' });

/** 舊的維度代號換成新的；其他值原樣回傳 */
export function migrateIndicatorId(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(LEGACY_INDICATOR_IDS, id)
    ? LEGACY_INDICATOR_IDS[id]
    : id;
}

// 陣列裡每個物件的某個欄位如果是舊代號，換成新代號；沒變的物件沿用原本的參考
function migrateField(list, field) {
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
];

/** 番茄鐘這一輪的任務清單（也存在 localStorage）裡的舊維度代號換成新的 */
export function migrateTaskList(tasks) {
  return Array.isArray(tasks) ? migrateField(tasks, 'indicatorId') : tasks;
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
];

export function createDefaultData() {
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

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const toArray = (v) => (Array.isArray(v) ? v : []);

// 把任意輸入補成完整、格式正確的資料。
// - 不修改傳入的 raw（只做淺層複製，巢狀的陣列/物件沿用原本的參考）
// - 保留 raw 中未知的額外欄位，避免丟資料
// - 處理舊格式：刪除 rewards；沒有 notes 但有 diaries 時轉成 notes；舊的維度代號換成新的（見 LEGACY_INDICATOR_IDS）
export function normalizeData(raw) {
  if (!isPlainObject(raw)) return createDefaultData();

  const defaults = createDefaultData();
  // eslint-disable-next-line no-unused-vars
  const { rewards, ...rest } = raw;
  const result = { ...defaults, ...rest };

  for (const field of ARRAY_FIELDS) {
    result[field] = toArray(raw[field]);
  }

  // 舊版的日記（diaries）遷移成筆記（notes）
  if (!Array.isArray(raw.notes) && Array.isArray(raw.diaries)) {
    result.notes = raw.diaries.map((d) =>
      isPlainObject(d) ? { ...d, title: d.title || d.date || '無主題' } : d
    );
  }

  // 舊的維度代號換成新的
  for (const [field, key] of INDICATOR_REF_FIELDS) {
    result[field] = migrateField(result[field], key);
  }
  result.pomodoroHistory = result.pomodoroHistory.map((session) => {
    if (!isPlainObject(session) || !Array.isArray(session.tasks)) return session;
    const tasks = migrateTaskList(session.tasks);
    return tasks.every((t, i) => t === session.tasks[i]) ? session : { ...session, tasks };
  });

  const goals = isPlainObject(raw.goals) ? { ...raw.goals } : {};
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

  const prizes = isPlainObject(raw.lotteryPrizes) ? { ...raw.lotteryPrizes } : {};
  for (const rarity of RARITIES) {
    prizes[rarity] = toArray(prizes[rarity]);
  }
  result.lotteryPrizes = prizes;

  const probability = isPlainObject(raw.lotteryProbability) ? { ...raw.lotteryProbability } : {};
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

  return result;
}
