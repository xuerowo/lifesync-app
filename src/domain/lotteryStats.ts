/**
 * 抽卡紀錄的「機率統計」（純函式，畫面只負責顯示）。
 *
 * 每筆抽卡紀錄存了「這一抽各稀有度的機率」（odds，見 src/types/data.ts 的 RewardHistoryRecord），
 * 所以改過機率設定之後，統計仍然是拿每一抽當時的機率來比，不會用現在的設定去比以前的紀錄。
 * - 應有次數：每筆紀錄 odds[稀有度] / 100 的加總（例如抽了 10 次、每次 UR 2%，應有 0.2 次）
 * - 應有比例：應有次數 ÷ 有 odds 的筆數 × 100（也就是這些抽卡當時機率的平均）
 * 沒有有效 odds 的紀錄（理論上讀檔時都會補上，只有卡池完全沒獎品時算不出來）不算進應有次數和應有比例。
 */

import { RARITIES, isValidOdds } from './lottery.ts';
import type { Rarity } from '../types/data.ts';

/** 實際抽到的次數和應有次數相比（畫面上顯示「比預期高／低」） */
export type LuckComparison = 'higher' | 'lower' | 'same';

/** 一個稀有度的統計 */
export interface RarityStat {
  rarity: Rarity;
  /** 抽到幾次（全部紀錄） */
  count: number;
  /** 實際比例（百分比）：count ÷ 全部紀錄筆數；沒有紀錄時是 0 */
  actualPercent: number;
  /** 應有次數：有 odds 的紀錄，odds[稀有度] / 100 的加總 */
  expectedCount: number;
  /** 應有比例（百分比）：應有次數 ÷ 有 odds 的筆數 × 100；沒有任何紀錄有 odds 時是 null */
  expectedPercent: number | null;
  /**
   * 有 odds 的紀錄裡實際抽到的次數，和應有次數（四捨五入到小數 1 位，和畫面顯示的一樣）比，是高、低還是一樣。
   * 沒有任何紀錄有 odds，或抽到 0 次、應有也是 0 次（不必比）時是 null。
   */
  comparison: LuckComparison | null;
}

/** 整體的統計 */
export interface LotteryStats {
  /** 全部紀錄筆數 */
  total: number;
  /** 有有效 odds 的筆數 */
  withOddsCount: number;
  /** 有效 odds 是推算的筆數（改版前的舊紀錄、補登的紀錄） */
  assumedCount: number;
  /** 沒有有效 odds、不算進應有次數的筆數 */
  withoutOddsCount: number;
  /** 依 RARITIES 的順序（UR 到 N） */
  rarities: RarityStat[];
}

/** 四捨五入到小數 1 位（畫面上應有次數顯示到小數 1 位） */
const roundTo1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * 算出機率統計。
 * @param history 抽卡紀錄。陣列裡每一筆沒有逐筆檢查過（見 src/types/data.ts 開頭），所以當成 unknown 處理，不是物件的只算進總筆數
 */
export function computeLotteryStats(history: readonly unknown[]): LotteryStats {
  const total = history.length;
  const counts: Record<Rarity, number> = { UR: 0, SSR: 0, SR: 0, R: 0, N: 0 };
  const countsWithOdds: Record<Rarity, number> = { UR: 0, SSR: 0, SR: 0, R: 0, N: 0 };
  const expected: Record<Rarity, number> = { UR: 0, SSR: 0, SR: 0, R: 0, N: 0 };
  let withOddsCount = 0;
  let assumedCount = 0;

  for (const item of history) {
    if (item === null || typeof item !== 'object') continue;
    // 上一行確認過是物件，欄位都當成 unknown 讀
    const record = item as Record<string, unknown>;
    const rarity = RARITIES.find(r => r === record.rarity);
    if (rarity) counts[rarity]++;

    const odds = record.odds;
    if (!isValidOdds(odds)) continue;
    withOddsCount++;
    if (record.oddsAssumed === true) assumedCount++;
    if (rarity) countsWithOdds[rarity]++;
    for (const r of RARITIES) expected[r] += odds[r] / 100;
  }

  const rarities = RARITIES.map((rarity): RarityStat => {
    const count = counts[rarity];
    const expectedCount = expected[rarity];
    let comparison: LuckComparison | null = null;
    if (withOddsCount > 0) {
      const shownExpected = roundTo1(expectedCount);
      const actual = countsWithOdds[rarity];
      if (actual > shownExpected) comparison = 'higher';
      else if (actual < shownExpected) comparison = 'lower';
      else if (actual > 0) comparison = 'same';
    }
    return {
      rarity,
      count,
      actualPercent: total > 0 ? (count / total) * 100 : 0,
      expectedCount,
      expectedPercent: withOddsCount > 0 ? (expectedCount / withOddsCount) * 100 : null,
      comparison,
    };
  });

  return { total, withOddsCount, assumedCount, withoutOddsCount: total - withOddsCount, rarities };
}
