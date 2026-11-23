import { describe, it, expect } from 'vitest';
import { computeLotteryStats } from '../src/domain/lotteryStats.ts';
import type { Rarity } from '../src/types/data.ts';

const ODDS_A: Record<Rarity, number> = { UR: 2, SSR: 8, SR: 15, R: 25, N: 50 };
const ODDS_B: Record<Rarity, number> = { UR: 10, SSR: 10, SR: 20, R: 20, N: 40 };

/** 測試用的抽卡紀錄：只放統計會看的欄位 */
const rec = (rarity: Rarity, odds?: unknown, oddsAssumed?: boolean) => ({
  id: Math.random().toString(36),
  rarity,
  ...(odds === undefined ? {} : { odds }),
  ...(oddsAssumed === undefined ? {} : { oddsAssumed }),
});

const byRarity = (stats: ReturnType<typeof computeLotteryStats>, rarity: Rarity) =>
  stats.rarities.find(s => s.rarity === rarity)!; // rarities 一定有五個稀有度

describe('computeLotteryStats', () => {
  it('沒有紀錄時都是 0，應有比例是 null，不比較', () => {
    const stats = computeLotteryStats([]);
    expect(stats.total).toBe(0);
    expect(stats.withOddsCount).toBe(0);
    expect(stats.rarities.map(s => s.rarity)).toEqual(['UR', 'SSR', 'SR', 'R', 'N']);
    for (const s of stats.rarities) {
      expect(s).toMatchObject({ count: 0, actualPercent: 0, expectedCount: 0, expectedPercent: null, comparison: null });
    }
  });

  it('應有次數是每筆 odds 的加總，應有比例是平均：改過機率設定，用的是每一抽當時的機率', () => {
    // 前 2 筆用 ODDS_A 抽、後 2 筆改了機率後用 ODDS_B 抽
    const history = [rec('UR', ODDS_A), rec('N', ODDS_A), rec('UR', ODDS_B), rec('SR', ODDS_B)];
    const stats = computeLotteryStats(history);
    expect(stats.total).toBe(4);
    expect(stats.withOddsCount).toBe(4);
    const ur = byRarity(stats, 'UR');
    expect(ur.count).toBe(2);
    expect(ur.actualPercent).toBeCloseTo(50);
    expect(ur.expectedCount).toBeCloseTo(0.02 * 2 + 0.1 * 2); // 0.24
    expect(ur.expectedPercent).toBeCloseTo(6); // (2+2+10+10)/4
    expect(ur.comparison).toBe('higher');
    const n = byRarity(stats, 'N');
    expect(n.expectedCount).toBeCloseTo(0.5 * 2 + 0.4 * 2); // 1.8
    expect(n.count).toBe(1);
    expect(n.comparison).toBe('lower');
    // 五個稀有度的應有次數加起來等於有 odds 的筆數
    expect(stats.rarities.reduce((t, s) => t + s.expectedCount, 0)).toBeCloseTo(4);
  });

  it('抽到次數和應有次數（顯示到小數 1 位）一樣時是 same；兩個都是 0 時不比較', () => {
    const history = Array.from({ length: 10 }, (_, i) => rec(i < 5 ? 'N' : 'R', { UR: 0, SSR: 0, SR: 0, R: 50, N: 50 }));
    const stats = computeLotteryStats(history);
    expect(byRarity(stats, 'N').comparison).toBe('same');
    expect(byRarity(stats, 'R').comparison).toBe('same');
    expect(byRarity(stats, 'UR').comparison).toBeNull();
    // 應有 0.04 次、顯示成 0.0，沒抽到：也不比較
    const tiny = computeLotteryStats([rec('N', { UR: 4, SSR: 0, SR: 0, R: 0, N: 96 })]);
    expect(byRarity(tiny, 'UR').comparison).toBeNull();
  });

  it('沒有有效 odds 的紀錄只算進抽到次數和實際比例，不算進應有次數和應有比例', () => {
    const history = [
      rec('UR', ODDS_A),
      rec('UR'),
      rec('UR', { UR: 1, SSR: 1 }),
      rec('N', { UR: NaN, SSR: 0, SR: 0, R: 0, N: 100 }),
    ];
    const stats = computeLotteryStats(history);
    expect(stats.total).toBe(4);
    expect(stats.withOddsCount).toBe(1);
    expect(stats.withoutOddsCount).toBe(3);
    const ur = byRarity(stats, 'UR');
    expect(ur.count).toBe(3);
    expect(ur.actualPercent).toBeCloseTo(75);
    expect(ur.expectedCount).toBeCloseTo(0.02);
    expect(ur.expectedPercent).toBeCloseTo(2);
    // 比較只看有 odds 的紀錄：1 次 > 0.0
    expect(ur.comparison).toBe('higher');
  });

  it('全部紀錄都沒有 odds 時，應有比例是 null、不比較', () => {
    const stats = computeLotteryStats([rec('UR'), rec('N')]);
    expect(stats.withOddsCount).toBe(0);
    for (const s of stats.rarities) {
      expect(s.expectedPercent).toBeNull();
      expect(s.comparison).toBeNull();
    }
    expect(byRarity(stats, 'UR').actualPercent).toBeCloseTo(50);
  });

  it('算出推算的筆數（oddsAssumed 為 true，而且 odds 有效）', () => {
    const history = [rec('UR', ODDS_A, true), rec('N', ODDS_A, true), rec('N', ODDS_A), rec('N', undefined, true)];
    const stats = computeLotteryStats(history);
    expect(stats.assumedCount).toBe(2);
    expect(stats.withOddsCount).toBe(3);
  });

  it('壞掉的紀錄（不是物件、稀有度不認得）不會丟錯，只算進總筆數', () => {
    const history: unknown[] = [null, 'x', 3, rec('UR', ODDS_A), { rarity: 'XYZ', odds: ODDS_A }];
    const stats = computeLotteryStats(history);
    expect(stats.total).toBe(5);
    expect(stats.withOddsCount).toBe(2);
    expect(stats.rarities.reduce((t, s) => t + s.count, 0)).toBe(1);
    expect(byRarity(stats, 'UR').expectedCount).toBeCloseTo(0.04);
  });
});
