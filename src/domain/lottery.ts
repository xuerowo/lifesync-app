/**
 * 抽卡核心邏輯（純函式，不碰畫面與存檔）
 *
 * 亂數來源可以注入（rand 是回傳 0 以上、未滿 1 的函式），方便測試；
 * 預設用 Math.random。呼叫 rand 的次數與順序和舊版 useLottery 完全相同：
 * 先抽稀有度，再抽獎品，圖庫獎品再抽一張圖。
 */

import type { DrawnPrize, LotteryPrize, Rarity } from '../types/data.ts';

/** 稀有度由高到低 */
export const RARITIES: Rarity[] = ['UR', 'SSR', 'SR', 'R', 'N'];

/** 各稀有度的卡池（可以缺稀有度，缺的當作沒有獎品） */
export type PrizePools = Partial<Record<Rarity, readonly LotteryPrize[]>>;

/** 抽一次的結果 */
export interface DrawResult {
  rarity: Rarity;
  prize: DrawnPrize;
}

/**
 * 依機率抽出稀有度。
 * 演算法與舊版相同：rand*100 依序和 UR、UR+SSR、UR+SSR+SR、UR+SSR+SR+R 比較，
 * 都沒有落在範圍內就是 N。累加的順序也相同，所以浮點數結果一模一樣。
 *
 * @param probability 各稀有度的機率（百分比）。缺稀有度時那一項算出 NaN、等於機率 0（和原本的 JS 一樣）
 */
export function pickRarity(probability: Partial<Record<Rarity, number>> | null | undefined, rand: () => number = Math.random): Rarity {
  const p: Partial<Record<Rarity, number>> = probability || {};
  const roll = rand() * 100;
  // 缺欄位時是 undefined，加起來變成 NaN，比較永遠是 false（原本的行為）
  let threshold = p[RARITIES[0]] as number;
  for (let i = 0; i < RARITIES.length - 1; i++) {
    if (i > 0) threshold = threshold + (p[RARITIES[i]] as number);
    if (roll < threshold) return RARITIES[i];
  }
  return RARITIES[RARITIES.length - 1];
}

/**
 * 這個獎品抽得出東西嗎？圖庫獎品（image-pool）至少要有一張圖才算。
 */
export function isUsablePrize(prize: LotteryPrize | null | undefined): boolean {
  if (!prize || typeof prize !== 'object') return false;
  if (prize.type === 'image-pool') {
    return Array.isArray(prize.content) && prize.content.length > 0;
  }
  return true;
}

/** 某個稀有度裡抽得出東西的獎品 */
export function getUsablePrizes(lotteryPrizes: PrizePools | null | undefined, rarity: Rarity): LotteryPrize[] {
  const list = lotteryPrizes?.[rarity];
  return Array.isArray(list) ? list.filter(isUsablePrize) : [];
}

/** 卡池裡是否至少有一個抽得出東西的獎品 */
export function hasAnyUsablePrize(lotteryPrizes: PrizePools | null | undefined): boolean {
  return RARITIES.some(r => getUsablePrizes(lotteryPrizes, r).length > 0);
}

/**
 * 抽中的稀有度沒有可用獎品時，改用哪個稀有度：
 * 先往更低的稀有度找（由近到遠），找不到再往更高的稀有度找（由近到遠）。
 * 全部都沒有就回傳 null。
 */
export function findAvailableRarity(lotteryPrizes: PrizePools | null | undefined, rarity: Rarity): Rarity | null {
  const idx = RARITIES.indexOf(rarity);
  if (idx === -1) return null;
  const order = [
    rarity,
    ...RARITIES.slice(idx + 1),
    ...RARITIES.slice(0, idx).reverse(),
  ];
  return order.find(r => getUsablePrizes(lotteryPrizes, r).length > 0) || null;
}

/**
 * 從指定稀有度抽一個獎品；圖庫獎品會再抽出其中一張圖。
 * 該稀有度沒有可用獎品時回傳 null。
 */
export function drawFromRarity(
  lotteryPrizes: PrizePools | null | undefined,
  rarity: Rarity,
  rand: () => number = Math.random,
): DrawResult | null {
  const prizes = getUsablePrizes(lotteryPrizes, rarity);
  if (prizes.length === 0) return null;

  const selectedPrize = prizes[Math.floor(rand() * prizes.length)];
  if (selectedPrize.type === 'image-pool') {
    const randomImagePath = selectedPrize.content[Math.floor(rand() * selectedPrize.content.length)];
    return { rarity, prize: { type: 'image', content: randomImagePath } };
  }
  return { rarity, prize: selectedPrize };
}

/**
 * 抽一次：依機率抽稀有度，該稀有度沒有獎品時往低、再往高找。
 * 整個卡池都沒有可用獎品時回傳 null（呼叫端不應扣券）。
 *
 */
export function drawPrize(
  lotteryPrizes: PrizePools | null | undefined,
  probability: Partial<Record<Rarity, number>> | null | undefined,
  rand: () => number = Math.random,
): DrawResult | null {
  if (!hasAnyUsablePrize(lotteryPrizes)) return null;
  const picked = pickRarity(probability, rand);
  const rarity = findAvailableRarity(lotteryPrizes, picked);
  if (!rarity) return null;
  return drawFromRarity(lotteryPrizes, rarity, rand);
}

/**
 * 待領取頁排序用的名稱：圖片取檔名，文字取內容。
 * 內容不是字串（例如舊版錯誤存進去的陣列）時轉成字串，不會丟錯。
 */
export function getPrizeSortName(prize: { type?: string; content?: unknown } | null | undefined): string {
  const content = prize?.content;
  if (typeof content !== 'string') return content == null ? '' : String(content);
  // split 至少回傳一個元素，pop() 一定拿得到字串
  return prize?.type === 'image' ? (content.split('\\').pop() as string) : content;
}

// ---------------------------------------------------------------------------
// 卡池設定：編輯、刪除、移動獎品
// ---------------------------------------------------------------------------

/** 各稀有度的卡池（完整五個稀有度，和 LifeSyncData.lotteryPrizes 相同） */
export type FullPrizePools = Record<Rarity, LotteryPrize[]>;

/**
 * 找出畫面上這張獎品卡片在卡池清單裡是哪一筆，只會找到一筆（找不到回傳 -1）。
 * 讀檔時 normalizeData 會幫每個獎品補上 id，平常靠 id 就分得出來；
 * 這裡另外用「同一個物件」和畫面上的位置確認，就算資料壞掉、有兩個獎品 id 相同，也只會動到使用者點的那一個。
 *
 * 依序比對：
 * 1. 畫面上的位置（indexHint）放的就是同一個物件
 * 2. 清單裡別的位置放著同一個物件（例如上面的獎品剛被刪掉，位置往前移了）
 * 3. 畫面上的位置放的是同一個 id（物件換過了，例如文字剛改過、畫面還沒更新）
 * 4. 第一個同 id 的獎品
 *
 * @param indexHint 畫面上顯示這張卡片時，它在清單裡的位置
 */
export function findPrizeIndex(list: readonly LotteryPrize[], prize: LotteryPrize, indexHint: number): number {
  if (list[indexHint] === prize) return indexHint;
  const sameObject = list.indexOf(prize);
  if (sameObject !== -1) return sameObject;
  if (!prize.id) return -1;
  if (list[indexHint]?.id === prize.id) return indexHint;
  return list.findIndex(p => p?.id === prize.id);
}

/** 改掉卡池裡的一個獎品；找不到時回傳原本的 pools */
export function updatePoolPrize(
  pools: FullPrizePools,
  rarity: Rarity,
  prize: LotteryPrize,
  indexHint: number,
  update: (current: LotteryPrize) => LotteryPrize,
): FullPrizePools {
  const list = pools[rarity];
  const index = findPrizeIndex(list, prize, indexHint);
  if (index === -1) return pools;
  return { ...pools, [rarity]: list.map((p, i) => (i === index ? update(p) : p)) };
}

/** 從卡池刪掉一個獎品；找不到時回傳原本的 pools */
export function removePoolPrize(pools: FullPrizePools, rarity: Rarity, prize: LotteryPrize, indexHint: number): FullPrizePools {
  const list = pools[rarity];
  const index = findPrizeIndex(list, prize, indexHint);
  if (index === -1) return pools;
  return { ...pools, [rarity]: list.filter((_, i) => i !== index) };
}

/**
 * 把一個獎品從 from 移到 to（接在最後面）。搬過去的是卡池裡現在的那一筆，不是畫面上可能較舊的複本。
 * 找不到、或 from 和 to 相同時回傳原本的 pools。
 */
export function movePoolPrize(
  pools: FullPrizePools,
  from: Rarity,
  to: Rarity,
  prize: LotteryPrize,
  indexHint: number,
): FullPrizePools {
  if (from === to) return pools;
  const list = pools[from];
  const index = findPrizeIndex(list, prize, indexHint);
  if (index === -1) return pools;
  return { ...pools, [from]: list.filter((_, i) => i !== index), [to]: [...pools[to], list[index]] };
}

/**
 * 卡池清單裡每個獎品的 React key，保證不重複。
 * 平常就是獎品的 id；資料壞掉、id 重複或沒有 id 時，後面那幾個加上位置區分。
 */
export function prizeKeys(list: readonly LotteryPrize[]): string[] {
  const seen = new Set<string>();
  return list.map((prize, i) => {
    const id = prize?.id;
    let key = typeof id === 'string' && id !== '' ? id : `${String(id ?? '')}#${i}`;
    if (seen.has(key)) key = `${key}#${i}`;
    while (seen.has(key)) key += '#';
    seen.add(key);
    return key;
  });
}
