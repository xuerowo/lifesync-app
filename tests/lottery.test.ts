import { describe, it, expect } from 'vitest';
import {
  RARITIES,
  pickRarity,
  drawPrize,
  drawFromRarity,
  findAvailableRarity,
  hasAnyUsablePrize,
  isUsablePrize,
  getPrizeSortName,
  findPrizeIndex,
  updatePoolPrize,
  removePoolPrize,
  movePoolPrize,
  prizeKeys,
} from '../src/domain/lottery.ts';
import type { FullPrizePools, PrizePools } from '../src/domain/lottery.ts';
import type { ImagePoolPrize, ImagePrize, LotteryPrize, Rarity, TextPrize } from '../src/types/data.ts';

/** 五個稀有度都有清單（可以是空的） */
type FullPools = Record<Rarity, LotteryPrize[]>;

/** 沒有 id 的測試用獎品：被測的函式只看 type 和 content，不看 id，所以當成一般獎品傳進去是安全的 */
type PrizeWithoutId = Omit<TextPrize, 'id'> | Omit<ImagePrize, 'id'> | Omit<ImagePoolPrize, 'id'>;
const withoutId = (prize: PrizeWithoutId) => prize as LotteryPrize;

// ---- 舊版 useLottery.performLottery 的原樣複製（只把 Math.random 換成可注入的 rand）----
function legacyPerformLottery(
  data: { lotteryPrizes: Record<string, LotteryPrize[]>; lotteryProbability: Record<string, number> },
  rand: () => number,
) {
  const { lotteryPrizes, lotteryProbability } = data;
  const hasAnyPrize = ['UR', 'SSR', 'SR', 'R', 'N'].some(r => lotteryPrizes[r] && lotteryPrizes[r].length > 0);
  if (!hasAnyPrize) return null;

  const r = rand() * 100;
  let rarity;
  if (r < lotteryProbability.UR) rarity = 'UR';
  else if (r < lotteryProbability.UR + lotteryProbability.SSR) rarity = 'SSR';
  else if (r < lotteryProbability.UR + lotteryProbability.SSR + lotteryProbability.SR) rarity = 'SR';
  else if (r < lotteryProbability.UR + lotteryProbability.SSR + lotteryProbability.SR + lotteryProbability.R) rarity = 'R';
  else rarity = 'N';

  let prizes = lotteryPrizes[rarity];
  if (!prizes || prizes.length === 0) {
    const rarities = ['UR', 'SSR', 'SR', 'R', 'N'];
    const currentIdx = rarities.indexOf(rarity);
    for (let i = currentIdx + 1; i < rarities.length; i++) {
      if (lotteryPrizes[rarities[i]].length > 0) {
        rarity = rarities[i];
        prizes = lotteryPrizes[rarity];
        break;
      }
    }
    if (!prizes || prizes.length === 0) return null;
  }

  const selectedPrize = prizes[Math.floor(rand() * prizes.length)];
  if (selectedPrize.type === 'image-pool' && selectedPrize.content.length > 0) {
    const randomImagePath = selectedPrize.content[Math.floor(rand() * selectedPrize.content.length)];
    return { rarity, prize: { type: 'image', content: randomImagePath } };
  }
  return { rarity, prize: selectedPrize };
}

function legacyPickRarity(lotteryProbability: Record<Rarity, number>, r100: number) {
  if (r100 < lotteryProbability.UR) return 'UR';
  if (r100 < lotteryProbability.UR + lotteryProbability.SSR) return 'SSR';
  if (r100 < lotteryProbability.UR + lotteryProbability.SSR + lotteryProbability.SR) return 'SR';
  if (r100 < lotteryProbability.UR + lotteryProbability.SSR + lotteryProbability.SR + lotteryProbability.R) return 'R';
  return 'N';
}

// 可重現的亂數產生器（mulberry32）
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fixed = (...values: number[]) => {
  let i = 0;
  return () => values[i++];
};

const PROBABILITY_CASES: Record<Rarity, number>[] = [
  { UR: 1, SSR: 4, SR: 15, R: 30, N: 50 },
  { UR: 0.1, SSR: 0.2, SR: 0.3, R: 0.4, N: 99 },
  { UR: 0, SSR: 0, SR: 0, R: 0, N: 100 },
  { UR: 100, SSR: 0, SR: 0, R: 0, N: 0 },
  { UR: 3.3, SSR: 6.7, SR: 20, R: 33.3, N: 36.7 },
  { UR: 20, SSR: 20, SR: 20, R: 20, N: 20 },
];

const fullPrizes = (): FullPools => ({
  UR: [{ id: 'ur1', type: 'text', content: 'UR 獎' }],
  SSR: [
    { id: 'ssr1', type: 'text', content: 'SSR 獎 1' },
    { id: 'ssr2', type: 'image-pool', content: ['gallery\\a.png', 'gallery\\b.png', 'gallery\\c.png'] },
  ],
  SR: [{ id: 'sr1', type: 'text', content: 'SR 獎' }, { id: 'sr2', type: 'text', content: 'SR 獎 2' }],
  R: [{ id: 'r1', type: 'image-pool', content: ['gallery\\r1.png', 'gallery\\r2.png'] }, { id: 'r2', type: 'text', content: 'R 獎' }],
  N: [{ id: 'n1', type: 'text', content: 'N 獎' }, { id: 'n2', type: 'text', content: '' }],
});

describe('pickRarity 與舊版演算法一致', () => {
  it('固定亂數序列（含每個門檻的邊界值）結果完全相同', () => {
    for (const p of PROBABILITY_CASES) {
      const thresholds = [p.UR, p.UR + p.SSR, p.UR + p.SSR + p.SR, p.UR + p.SSR + p.SR + p.R];
      const values = [0, 0.5, 0.999999999, 1 - Number.EPSILON];
      for (const t of thresholds) {
        values.push(t / 100, (t - 1e-9) / 100, (t + 1e-9) / 100);
      }
      for (const v of values.filter(x => x >= 0 && x < 1)) {
        expect(pickRarity(p, () => v)).toBe(legacyPickRarity(p, v * 100));
      }
    }
  });

  it('大量可重現亂數下結果完全相同', () => {
    for (const p of PROBABILITY_CASES) {
      const rand = seeded(12345);
      for (let i = 0; i < 20000; i++) {
        const v = rand();
        expect(pickRarity(p, () => v)).toBe(legacyPickRarity(p, v * 100));
      }
    }
  });

  it('每次只呼叫一次亂數', () => {
    let calls = 0;
    pickRarity(PROBABILITY_CASES[0], () => { calls++; return 0.3; });
    expect(calls).toBe(1);
  });
});

describe('drawPrize：正常情況（五個稀有度都有獎品）與舊版完全相同', () => {
  it('同一組亂數序列，抽出的稀有度與獎品逐次相同', () => {
    for (const p of PROBABILITY_CASES) {
      const data = { lotteryPrizes: fullPrizes(), lotteryProbability: p };
      const randNew = seeded(987);
      const randOld = seeded(987);
      for (let i = 0; i < 5000; i++) {
        const a = drawPrize(data.lotteryPrizes, p, randNew);
        const b = legacyPerformLottery(data, randOld);
        expect(a).toEqual(b);
      }
    }
  });

  it('舊版也能處理的情況（只缺高稀有度、往低找得到）結果相同', () => {
    const prizes = fullPrizes();
    prizes.UR = [];
    prizes.SSR = [];
    const p = PROBABILITY_CASES[4];
    const randNew = seeded(42);
    const randOld = seeded(42);
    for (let i = 0; i < 3000; i++) {
      expect(drawPrize(prizes, p, randNew)).toEqual(legacyPerformLottery({ lotteryPrizes: prizes, lotteryProbability: p }, randOld));
    }
  });

  it('圖庫獎品回傳其中一張圖', () => {
    const prizes = fullPrizes();
    // 0.03 → SSR（1 ≤ 3 < 5）；0.9 → 第 2 個獎品（圖庫）；0.5 → 第 2 張圖
    const result = drawPrize(prizes, PROBABILITY_CASES[0], fixed(0.03, 0.9, 0.5));
    expect(result).toEqual({ rarity: 'SSR', prize: { type: 'image', content: 'gallery\\b.png' } });
  });
});

describe('drawPrize：沒有獎品的情況', () => {
  const p = { UR: 1, SSR: 4, SR: 15, R: 30, N: 50 };

  it('抽中的稀有度沒有獎品時，先往低找', () => {
    const prizes: FullPools = { UR: [], SSR: [], SR: [{ id: 'sr', type: 'text', content: 'SR' }], R: [], N: [{ id: 'n', type: 'text', content: 'N' }] };
    // 0.02 → SSR，往低找到 SR（有獎品，一定抽得到）
    expect(drawPrize(prizes, p, fixed(0.02, 0))!.rarity).toBe('SR');
  });

  it('往低找不到時，再往高找（由近到遠）', () => {
    const prizes: FullPools = { UR: [{ id: 'ur', type: 'text', content: 'UR' }], SSR: [{ id: 'ssr', type: 'text', content: 'SSR' }], SR: [], R: [], N: [] };
    // 0.9 → N，往低沒有，往高先找到 SSR（有獎品，一定抽得到）
    expect(drawPrize(prizes, p, fixed(0.9, 0))!.rarity).toBe('SSR');
  });

  it('只有 SSR 有獎品時，每一抽都抽得到', () => {
    const prizes: FullPools = { UR: [], SSR: [{ id: 'ssr', type: 'text', content: 'SSR' }], SR: [], R: [], N: [] };
    const rand = seeded(7);
    for (let i = 0; i < 1000; i++) {
      expect(drawPrize(prizes, p, rand)).toEqual({ rarity: 'SSR', prize: prizes.SSR[0] });
    }
  });

  it('空的圖庫獎品視為沒有獎品', () => {
    const prizes: FullPools = {
      UR: [], SSR: [], SR: [],
      R: [{ id: 'empty', type: 'image-pool', content: [] }],
      N: [{ id: 'n', type: 'text', content: 'N' }],
    };
    // 0.3 → R（20 ≤ 30 < 50），R 只有空圖庫 → 往低找到 N
    expect(drawPrize(prizes, p, fixed(0.3, 0))).toEqual({ rarity: 'N', prize: prizes.N[0] });
  });

  it('同一稀有度裡跳過空的圖庫，只從可用獎品中抽', () => {
    const prizes: FullPools = {
      UR: [], SSR: [], SR: [], N: [],
      R: [{ id: 'empty', type: 'image-pool', content: [] }, { id: 'r', type: 'text', content: 'R' }],
    };
    for (const v of [0, 0.5, 0.99]) {
      expect(drawPrize(prizes, p, fixed(0.3, v))).toEqual({ rarity: 'R', prize: prizes.R[1] });
    }
  });

  it('全部都沒有可用獎品時回傳 null', () => {
    expect(drawPrize({ UR: [], SSR: [], SR: [], R: [], N: [] }, p, () => 0.5)).toBeNull();
    expect(drawPrize({ UR: [], SSR: [], SR: [], R: [{ id: 'e', type: 'image-pool', content: [] }], N: [] }, p, () => 0.5)).toBeNull();
    expect(drawPrize({}, p, () => 0.5)).toBeNull();
    expect(drawPrize(undefined, p, () => 0.5)).toBeNull();
  });

  it('稀有度清單缺欄位也不會丟錯', () => {
    const prizes: PrizePools = { SSR: [{ id: 'ssr', type: 'text', content: 'SSR' }] };
    expect(drawPrize(prizes, p, fixed(0.9, 0))!.rarity).toBe('SSR'); // SSR 有獎品，一定抽得到
  });
});

describe('其他輔助函式', () => {
  it('findAvailableRarity 的搜尋順序', () => {
    const only = (r: Rarity): PrizePools =>
      Object.fromEntries(RARITIES.map(x => [x, x === r ? [withoutId({ type: 'text', content: x })] : []]));
    expect(findAvailableRarity(only('UR'), 'N')).toBe('UR');
    expect(findAvailableRarity(only('N'), 'UR')).toBe('N');
    expect(findAvailableRarity(only('SR'), 'SR')).toBe('SR');
    // @ts-expect-error 故意傳不存在的稀有度
    expect(findAvailableRarity(only('SR'), 'XX')).toBeNull();
    expect(findAvailableRarity({}, 'R')).toBeNull();
  });

  it('isUsablePrize / hasAnyUsablePrize', () => {
    expect(isUsablePrize(withoutId({ type: 'text', content: '' }))).toBe(true);
    expect(isUsablePrize(withoutId({ type: 'image-pool', content: [] }))).toBe(false);
    expect(isUsablePrize(withoutId({ type: 'image-pool', content: ['a'] }))).toBe(true);
    expect(isUsablePrize(null)).toBe(false);
    expect(hasAnyUsablePrize({ R: [withoutId({ type: 'image-pool', content: [] })] })).toBe(false);
  });

  it('drawFromRarity 只從指定稀有度抽', () => {
    const prizes = fullPrizes();
    expect(drawFromRarity(prizes, 'UR', () => 0)).toEqual({ rarity: 'UR', prize: prizes.UR[0] });
    expect(drawFromRarity({ UR: [] }, 'UR', () => 0)).toBeNull();
  });

  it('getPrizeSortName 遇到非字串不丟錯', () => {
    expect(getPrizeSortName({ type: 'image', content: 'gallery\\x.png' })).toBe('x.png');
    expect(getPrizeSortName({ type: 'text', content: 'abc' })).toBe('abc');
    expect(getPrizeSortName({ type: 'image-pool', content: [] })).toBe('');
    expect(getPrizeSortName({ type: 'image-pool', content: ['a', 'b'] })).toBe('a,b');
    expect(getPrizeSortName({ type: 'text', content: 5 })).toBe('5');
    expect(getPrizeSortName({ type: 'text' })).toBe('');
    expect(getPrizeSortName(undefined)).toBe('');
    const names = [{ type: 'text', content: ['x'] }, { type: 'text', content: 'b' }, { type: 'image', content: 'g\\a.png' }]
      .map(getPrizeSortName);
    expect(() => names.sort((a, b) => a.localeCompare(b))).not.toThrow();
  });
});

describe('卡池設定：編輯、刪除、移動獎品只動到點的那一個', () => {
  const text = (id: string, content: string): LotteryPrize => ({ id, type: 'text', content });
  // 資料壞掉時才會有的情況：兩個獎品 id 相同（例如手動改檔）
  const pools = (): FullPrizePools => ({
    N: [text('a', '甲'), text('dup', '乙'), text('dup', '丙')],
    R: [text('r', 'R1')],
    SR: [], SSR: [], UR: [],
  });

  it('findPrizeIndex：同 id 也只找到畫面上那一個', () => {
    const p = pools();
    expect(findPrizeIndex(p.N, p.N[2], 2)).toBe(2);
    expect(findPrizeIndex(p.N, p.N[1], 1)).toBe(1);
    // 位置對不上（上面的獎品剛被刪掉）時，照同一個物件找
    expect(findPrizeIndex(p.N.slice(1), p.N[2], 2)).toBe(1);
    // 物件換過（文字剛改過）時，位置上的 id 相同就用那個位置
    expect(findPrizeIndex([p.N[0], p.N[1], text('dup', '丙改')], p.N[2], 2)).toBe(2);
    // 都對不上就找第一個同 id 的
    expect(findPrizeIndex([text('x', ''), text('a', '甲改')], p.N[0], 5)).toBe(1);
    expect(findPrizeIndex(p.N, text('none', ''), 0)).toBe(-1);
  });

  it('removePoolPrize 只刪一個，其他稀有度不變', () => {
    const p = pools();
    const next = removePoolPrize(p, 'N', p.N[2], 2);
    expect(next.N).toEqual([text('a', '甲'), text('dup', '乙')]);
    expect(next.R).toBe(p.R);
    expect(p.N).toHaveLength(3); // 不修改傳入的資料
    expect(removePoolPrize(p, 'N', text('none', ''), 0)).toBe(p);
  });

  it('movePoolPrize 從舊稀有度拿掉一個、在新稀有度接上同一個', () => {
    const p = pools();
    const next = movePoolPrize(p, 'N', 'R', p.N[1], 1);
    expect(next.N).toEqual([text('a', '甲'), text('dup', '丙')]);
    expect(next.R).toEqual([text('r', 'R1'), text('dup', '乙')]);
    expect(next.N.length + next.R.length).toBe(p.N.length + p.R.length);
    expect(movePoolPrize(p, 'N', 'N', p.N[0], 0)).toBe(p);
    expect(movePoolPrize(p, 'N', 'R', text('none', ''), 0)).toBe(p);
  });

  it('movePoolPrize 搬的是卡池裡現在的那一筆', () => {
    const p = pools();
    const stale = p.N[0];
    const edited = { ...p, N: [text('a', '甲改'), ...p.N.slice(1)] };
    expect(movePoolPrize(edited, 'N', 'UR', stale, 0).UR).toEqual([text('a', '甲改')]);
  });

  it('updatePoolPrize 只改一個', () => {
    const p = pools();
    const next = updatePoolPrize(p, 'N', p.N[1], 1, (x) => (x.type === 'text' ? { ...x, content: '改' } : x));
    expect(next.N.map((x) => x.content)).toEqual(['甲', '改', '丙']);
    expect(p.N[1].content).toBe('乙');
  });

  it('prizeKeys 不重複，平常就是 id', () => {
    expect(prizeKeys([text('a', ''), text('b', '')])).toEqual(['a', 'b']);
    const keys = prizeKeys([text('dup', ''), text('dup', ''), withoutId({ type: 'text', content: '' }), text('dup#1', '')]);
    expect(keys[0]).toBe('dup');
    expect(new Set(keys).size).toBe(4);
  });
});
