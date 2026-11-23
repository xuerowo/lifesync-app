import { describe, it, expect } from 'vitest'
import {
  createDefaultData,
  normalizeData,
  DEFAULT_LOTTERY_PRIZES,
  DEFAULT_LOTTERY_PROBABILITY,
  DEFAULT_CLOUD_CONFIG,
  migrateIndicatorId,
  migrateTaskList,
} from '../src/shared/defaultData.ts'
import type { LifeSyncData } from '../src/types/data.ts'

/** 型別上沒有寫、但 normalizeData 會原樣保留的欄位 */
type Loose = LifeSyncData & Record<string, unknown>

const deepFreeze = <T>(obj: T): T => {
  if (obj && typeof obj === 'object') {
    Object.values(obj).forEach(deepFreeze)
    Object.freeze(obj)
  }
  return obj
}

describe('createDefaultData', () => {
  it('包含所有欄位', () => {
    const d = createDefaultData()
    expect(Object.keys(d).sort()).toEqual([
      'achievements', 'archivedGoals', 'archivedSubTasks', 'archivedTasks', 'cloudConfig',
      'goals', 'lotteryPrizes', 'lotteryProbability', 'lotteryTickets', 'majorTasks', 'notes',
      'pomodoroHistory', 'rewardFolderPath', 'rewardHistory', 'rules', 'subTasks', 'taskHistory',
    ])
    expect(d.lotteryProbability).toEqual({ N: 50, R: 25, SR: 15, SSR: 8, UR: 2 })
    expect(d.cloudConfig).toEqual({
      type: 'webdav', url: '', username: '', password: '', masterPassword: '', enabled: false,
    })
    expect(d.lotteryTickets).toBe(0)
  })

  it('每次回傳全新物件，不會互相污染', () => {
    const a = createDefaultData()
    const b = createDefaultData()
    // 下面三行只是往 a 裡塞東西，看 b 會不會跟著變，內容不必是正確的格式
    // @ts-expect-error 故意傳壞資料：id 是數字、沒有 indicatorId
    a.majorTasks.push({ id: 1 })
    // @ts-expect-error 故意傳壞資料：目標應該是物件
    a.goals.growth.push('x')
    // @ts-expect-error 故意傳壞資料：獎品應該是物件
    a.lotteryPrizes.N.push('p')
    a.cloudConfig.url = 'changed'
    expect(b.majorTasks).toEqual([])
    expect(b.goals.growth).toEqual([])
    expect(b.lotteryPrizes.N).toEqual([])
    expect(b.cloudConfig.url).toBe('')
    expect(createDefaultData().lotteryPrizes.N).toEqual([])
  })

  it('預設常數函式每次回傳新物件', () => {
    expect(DEFAULT_LOTTERY_PRIZES()).not.toBe(DEFAULT_LOTTERY_PRIZES())
    expect(DEFAULT_LOTTERY_PRIZES().N).not.toBe(DEFAULT_LOTTERY_PRIZES().N)
    expect(DEFAULT_LOTTERY_PROBABILITY()).not.toBe(DEFAULT_LOTTERY_PROBABILITY())
    expect(DEFAULT_CLOUD_CONFIG()).not.toBe(DEFAULT_CLOUD_CONFIG())
  })
})

describe('normalizeData', () => {
  it('非物件輸入回傳預設資料', () => {
    for (const bad of [null, undefined, 'abc', 42, [], [1, 2], true]) {
      expect(normalizeData(bad)).toEqual(createDefaultData())
    }
  })

  it('補齊缺少的欄位', () => {
    const result = normalizeData({ majorTasks: [{ id: 'a' }] })
    expect(result.majorTasks).toEqual([{ id: 'a', sortOrder: 0 }])
    expect(result.subTasks).toEqual([])
    expect(result.taskHistory).toEqual([])
    expect(result.goals).toEqual({ growth: [], health: [], happiness: [] })
    expect(result.lotteryPrizes).toEqual({ N: [], R: [], SR: [], SSR: [], UR: [] })
    expect(result.lotteryProbability).toEqual({ N: 50, R: 25, SR: 15, SSR: 8, UR: 2 })
    expect(result.cloudConfig).toEqual(DEFAULT_CLOUD_CONFIG())
    expect(result.lotteryTickets).toBe(0)
    expect(result.rewardFolderPath).toBe('')
  })

  it('保留既有值與未知的額外欄位', () => {
    const raw = {
      subTasks: [{ id: 's1' }],
      rewardFolderPath: 'C:\\pics',
      lotteryTickets: 7,
      futureField: { nested: true },
      anotherOne: 'keep me',
    }
    const result = normalizeData(raw)
    expect(result.subTasks).toEqual([{ id: 's1', sortOrder: 0 }])
    expect(result.rewardFolderPath).toBe('C:\\pics')
    expect(result.lotteryTickets).toBe(7)
    // normalizeData 會原樣保留不認得的欄位，只是 LifeSyncData 沒有寫出這些欄位
    expect((result as Loose).futureField).toEqual({ nested: true })
    expect((result as Loose).anotherOne).toBe('keep me')
  })

  it('不修改傳入的資料', () => {
    const raw = deepFreeze({
      rewards: [1],
      goals: { learning: ['a'] },
      lotteryPrizes: { N: ['n'] },
      lotteryProbability: { UR: 5 },
      cloudConfig: { url: 'https://x' },
      diaries: [{ date: '2026-01-01' }],
      lotteryTickets: '3',
    })
    const snapshot = JSON.stringify(raw)
    // 凍結的物件若被修改，嚴格模式下會丟錯
    expect(() => normalizeData(raw)).not.toThrow()
    expect(JSON.stringify(raw)).toBe(snapshot)
    expect(normalizeData(raw)).not.toBe(raw)
  })

  it('刪除舊版的 rewards 欄位', () => {
    const result = normalizeData({ rewards: [{ id: 1 }] })
    expect('rewards' in result).toBe(false)
  })

  it('沒有 notes 但有 diaries 時轉成 notes', () => {
    const result = normalizeData({
      diaries: [
        { id: 1, title: '有標題', date: '2026-01-01' },
        { id: 2, date: '2026-01-02' },
        { id: 3 },
      ],
    })
    expect(result.notes.map((n) => n.title)).toEqual(['有標題', '2026-01-02', '無標題'])
    expect(result.notes[0].id).toBe(1)
  })

  it('已有 notes 時不會用 diaries 覆蓋', () => {
    const result = normalizeData({ notes: [{ id: 'n' }], diaries: [{ id: 'd' }] })
    expect(result.notes).toEqual([{ id: 'n' }])
  })

  it('陣列欄位不是陣列時換成空陣列', () => {
    const result = normalizeData({
      majorTasks: 'oops',
      subTasks: { a: 1 },
      notes: null,
      taskHistory: 5,
      archivedSubTasks: undefined,
    })
    expect(result.majorTasks).toEqual([])
    expect(result.subTasks).toEqual([])
    expect(result.notes).toEqual([])
    expect(result.taskHistory).toEqual([])
    expect(result.archivedSubTasks).toEqual([])
  })

  it('goals 補齊三個分類，並保留額外分類', () => {
    expect(normalizeData({ goals: 'bad' }).goals).toEqual({ growth: [], health: [], happiness: [] })
    const result = normalizeData({ goals: { growth: [{ id: 'g' }], health: 'x', custom: [1] } })
    expect(result.goals).toEqual({ growth: [{ id: 'g' }], health: [], happiness: [], custom: [1] })
  })

  it('lotteryPrizes 缺稀有度或不是陣列時補成陣列', () => {
    const result = normalizeData({ lotteryPrizes: { N: [{ name: 'a' }], SR: 'bad' } })
    // 沒有 id 的獎品會補上 id，見下面「卡池獎品補上 id」
    expect(result.lotteryPrizes).toEqual({ N: [{ name: 'a', id: expect.any(String) }], R: [], SR: [], SSR: [], UR: [] })
    expect(normalizeData({ lotteryPrizes: null }).lotteryPrizes).toEqual(DEFAULT_LOTTERY_PRIZES())
  })

  it('lotteryProbability 逐稀有度合併', () => {
    const result = normalizeData({ lotteryProbability: { UR: 10, N: 'abc', SR: null } })
    expect(result.lotteryProbability).toEqual({ N: 50, R: 25, SR: 15, SSR: 8, UR: 10 })
    expect(normalizeData({ lotteryProbability: [] }).lotteryProbability).toEqual(DEFAULT_LOTTERY_PROBABILITY())
    expect(normalizeData({ lotteryProbability: { R: 0 } }).lotteryProbability.R).toBe(0)
  })

  it('cloudConfig 與預設合併', () => {
    const result = normalizeData({ cloudConfig: { url: 'https://dav', enabled: true } })
    expect(result.cloudConfig).toEqual({
      type: 'webdav', url: 'https://dav', username: '', password: '', masterPassword: '', enabled: true,
    })
    expect(normalizeData({ cloudConfig: 'bad' }).cloudConfig).toEqual(DEFAULT_CLOUD_CONFIG())
  })

  it('lotteryTickets 轉成數字，無效時為 0', () => {
    expect(normalizeData({ lotteryTickets: '12' }).lotteryTickets).toBe(12)
    expect(normalizeData({ lotteryTickets: 'abc' }).lotteryTickets).toBe(0)
    expect(normalizeData({ lotteryTickets: null }).lotteryTickets).toBe(0)
    expect(normalizeData({ lotteryTickets: Infinity }).lotteryTickets).toBe(0)
  })

  it('疊在現有資料上的用法：缺欄位的匯入不會弄壞資料', () => {
    const prev = normalizeData({ subTasks: [{ id: 'keep' }], lotteryTickets: 4 })
    const imported = { majorTasks: [{ id: 'm' }], lotteryPrizes: { UR: [{ name: 'u' }] } }
    const result = normalizeData({ ...prev, ...imported })
    expect(result.subTasks).toEqual([{ id: 'keep', sortOrder: 0 }])
    expect(result.majorTasks).toEqual([{ id: 'm', sortOrder: 0 }])
    expect(result.lotteryTickets).toBe(4)
    expect(result.lotteryPrizes.N).toEqual([])
    expect(result.lotteryPrizes.UR).toEqual([{ name: 'u', id: expect.any(String) }])
  })
})

describe('normalizeData：卡池獎品補上 id', () => {

  it('只幫沒有 id 的獎品補上不重複的 id，其他欄位不變', () => {
    const raw = {
      lotteryPrizes: {
        // 舊版的單張圖片獎品沒有 id，同一個稀有度可能有好幾個
        R: [
          { type: 'image', content: 'old/a.png' },
          { type: 'image', content: 'old/b.png' },
          { id: 'keep', type: 'text', content: '有 id' },
        ],
        SR: [{ type: 'text', content: '沒有 id 的文字' }],
      },
    }
    const prizes = normalizeData(raw).lotteryPrizes
    const [a, b, kept] = prizes.R
    expect(a).toEqual({ type: 'image', content: 'old/a.png', id: 'legacy-R-0' })
    expect(b).toEqual({ type: 'image', content: 'old/b.png', id: 'legacy-R-1' })
    expect(a.id).not.toBe(b.id)
    expect(prizes.SR[0]).toEqual({ type: 'text', content: '沒有 id 的文字', id: 'legacy-SR-0' })
    // 已有 id 的獎品原封不動（同一個物件）
    expect(kept).toBe(raw.lotteryPrizes.R[2])
  })

  it('id 是空字串、null 或不是字串時換成新的 id', () => {
    const prizes = normalizeData({
      lotteryPrizes: { N: [{ id: '', type: 'text', content: 'a' }, { id: null, type: 'text', content: 'b' }, { id: 7, type: 'text', content: 'c' }] },
    }).lotteryPrizes.N
    expect(prizes.map((p) => p.id)).toEqual(['legacy-N-0', 'legacy-N-1', 'legacy-N-2'])
  })

  it('補上的 id 是固定的：每次讀檔、每台裝置讀到的都一樣；和已有的 id 撞到時加上 -2', () => {
    const raw = { lotteryPrizes: { UR: [{ type: 'text', content: 'x' }, { id: 'legacy-UR-1', type: 'text', content: 'y' }, { type: 'text', content: 'z' }] } }
    const first = normalizeData(raw).lotteryPrizes.UR.map((p) => p.id)
    const second = normalizeData(raw).lotteryPrizes.UR.map((p) => p.id)
    expect(first).toEqual(['legacy-UR-0', 'legacy-UR-1', 'legacy-UR-2'])
    expect(second).toEqual(first)
    const clash = normalizeData({ lotteryPrizes: { N: [{ id: 'legacy-N-1', type: 'text', content: 'a' }, { type: 'text', content: 'b' }] } }).lotteryPrizes.N
    expect(clash.map((p) => p.id)).toEqual(['legacy-N-1', 'legacy-N-1-2'])
  })

  it('不是物件的項目原樣保留', () => {
    const prizes = normalizeData({ lotteryPrizes: { N: ['x', null, 3, [1]] } }).lotteryPrizes.N as unknown[]
    expect(prizes).toEqual(['x', null, 3, [1]])
  })

  it('不修改傳入的資料', () => {
    const raw = deepFreeze({ lotteryPrizes: { R: [{ type: 'image', content: 'a.png' }] } })
    const snapshot = JSON.stringify(raw)
    expect(() => normalizeData(raw)).not.toThrow()
    expect(JSON.stringify(raw)).toBe(snapshot)
    expect('id' in raw.lotteryPrizes.R[0]).toBe(false)
  })

  it('已經整理過的資料再整理一次不會變（id 不會重新產生）', () => {
    const once = normalizeData({ lotteryPrizes: { R: [{ type: 'image', content: 'a.png' }], UR: [{ id: 'u', type: 'text', content: 'u' }] } })
    const twice = normalizeData(once)
    expect(twice).toEqual(once)
    // 每個獎品都已經有 id，陣列也沿用原本的
    expect(twice.lotteryPrizes.R).toBe(once.lotteryPrizes.R)
    expect(twice.lotteryPrizes.UR).toBe(once.lotteryPrizes.UR)
  })
})

describe('維度代號改名：學習 learning → 成長 growth（2026-11-22）', () => {
  const old = () => ({
    goals: { learning: [{ id: 'g1' }], health: [{ id: 'h1' }] },
    majorTasks: [{ id: 'm1', indicatorId: 'learning', sortOrder: 0 }, { id: 'm2', indicatorId: 'health', sortOrder: 1 }],
    subTasks: [{ id: 's1', indicatorId: 'learning', sortOrder: 0 }],
    archivedTasks: [{ id: 'a1', indicatorId: 'learning' }],
    archivedSubTasks: [{ id: 'as1', indicatorId: 'learning' }],
    taskHistory: [{ id: 'th1', indicatorId: 'learning' }, { id: 'th2', indicatorId: 'happiness' }],
    archivedGoals: [{ id: 'ag1', indicatorId: 'learning' }],
    achievements: [{ id: 'ac1', type: 'learning' }, { id: 'ac2', type: 'total' }],
    pomodoroHistory: [
      { id: 'p1', tasks: [{ id: 's1', indicatorId: 'learning' }] },
      { id: 'p2', tasks: [{ id: 's9', indicatorId: 'health' }] },
      { id: 'p3' },
    ],
  })

  it('舊資料的每一處都換成新代號，其他維度不動', () => {
    const r = normalizeData(old())
    expect(r.goals).toEqual({ growth: [{ id: 'g1' }], health: [{ id: 'h1' }], happiness: [] })
    expect(r.majorTasks.map((t) => t.indicatorId)).toEqual(['growth', 'health'])
    expect(r.subTasks[0].indicatorId).toBe('growth')
    expect(r.archivedTasks[0].indicatorId).toBe('growth')
    expect(r.archivedSubTasks[0].indicatorId).toBe('growth')
    expect(r.taskHistory.map((t) => t.indicatorId)).toEqual(['growth', 'happiness'])
    expect(r.archivedGoals[0].indicatorId).toBe('growth')
    expect(r.achievements.map((a) => a.type)).toEqual(['growth', 'total'])
    expect(r.pomodoroHistory[0].tasks[0].indicatorId).toBe('growth')
    expect(r.pomodoroHistory[1].tasks[0].indicatorId).toBe('health')
    expect(r.pomodoroHistory[2]).toEqual({ id: 'p3' })
    expect(JSON.stringify(r)).not.toContain('learning')
  })

  it('不修改傳入的舊資料，沒變的項目沿用原本的物件', () => {
    const raw = deepFreeze(old())
    const r = normalizeData(raw)
    expect(raw.subTasks[0].indicatorId).toBe('learning')
    expect(r.majorTasks[1]).toBe(raw.majorTasks[1])
    expect(r.pomodoroHistory[1]).toBe(raw.pomodoroHistory[1])
  })

  it('再跑一次結果一樣（已經是新代號的資料不會再變）', () => {
    const once = normalizeData(old())
    expect(normalizeData(once)).toEqual(once)
  })

  it('新舊兩個目標分類都有時合併，新的在前', () => {
    const r = normalizeData({ goals: { growth: [{ id: 'new' }], learning: [{ id: 'old' }] } })
    expect(r.goals.growth).toEqual([{ id: 'new' }, { id: 'old' }])
    expect('learning' in r.goals).toBe(false)
  })

  it('合併時同一個目標（同 id）只留一個', () => {
    const r = normalizeData({ goals: { growth: [{ id: 'a', title: '新' }], learning: [{ id: 'a', title: '舊' }, { id: 'b' }] } })
    expect(r.goals.growth).toEqual([{ id: 'a', title: '新' }, { id: 'b' }])
  })

  it('migrateIndicatorId 只換舊代號', () => {
    expect(migrateIndicatorId('learning')).toBe('growth')
    expect(migrateIndicatorId('health')).toBe('health')
    expect(migrateIndicatorId(undefined)).toBe(undefined)
    expect(migrateIndicatorId('toString')).toBe('toString')
  })

  it('番茄鐘這一輪的任務清單也會換', () => {
    expect(migrateTaskList([{ id: 'a', indicatorId: 'learning' }, null])).toEqual([{ id: 'a', indicatorId: 'growth' }, null])
    expect(migrateTaskList('bad')).toBe('bad')
  })
})

describe('normalizeData：舊抽卡紀錄補上推算的機率（odds）', () => {
  const prizes = {
    UR: [{ id: 'u', type: 'text', content: 'UR' }],
    SSR: [{ id: 's', type: 'text', content: 'SSR' }],
    SR: [{ id: 'sr', type: 'text', content: 'SR' }],
    R: [{ id: 'r', type: 'text', content: 'R' }],
    N: [{ id: 'n', type: 'text', content: 'N' }],
  }
  const probability = { UR: 2, SSR: 8, SR: 15, R: 25, N: 50 }
  const recorded = { UR: 10, SSR: 10, SR: 20, R: 20, N: 40 }

  it('沒有 odds 的紀錄用目前的卡池和機率推算，標記 oddsAssumed；已有有效 odds 的不動', () => {
    const kept = { id: 'b', rarity: 'UR', odds: recorded }
    const raw = { lotteryPrizes: prizes, lotteryProbability: probability, rewardHistory: [{ id: 'a', rarity: 'N', claimed: true }, kept] }
    const history = normalizeData(raw).rewardHistory
    expect(history[0]).toEqual({ id: 'a', rarity: 'N', claimed: true, odds: probability, oddsAssumed: true })
    // 已有有效 odds 的紀錄原封不動（同一個物件），不會被目前的機率蓋掉
    expect(history[1]).toBe(kept)
    expect('oddsAssumed' in history[1]).toBe(false)
  })

  it('推算時考慮空卡池改抽：沒有獎品的稀有度，機率移到實際會抽到的稀有度', () => {
    const raw = {
      lotteryPrizes: { N: [{ id: 'n', type: 'text', content: 'N' }], SR: [{ id: 'sr', type: 'text', content: 'SR' }] },
      lotteryProbability: probability,
      rewardHistory: [{ id: 'a', rarity: 'N' }],
    }
    expect(normalizeData(raw).rewardHistory[0].odds).toEqual({ UR: 0, SSR: 0, SR: 25, R: 0, N: 75 })
  })

  it('odds 無效（不是物件、缺稀有度、不是有限數字）時換成推算值', () => {
    const bad = [null, 'x', [1, 2, 3, 4, 5], { UR: 1, SSR: 1, SR: 1, R: 1 }, { UR: NaN, SSR: 0, SR: 0, R: 0, N: 100 }, { UR: '2', SSR: 8, SR: 15, R: 25, N: 50 }]
    const raw = { lotteryPrizes: prizes, lotteryProbability: probability, rewardHistory: bad.map((odds, i) => ({ id: String(i), odds, oddsAssumed: false })) }
    for (const record of normalizeData(raw).rewardHistory) {
      expect(record.odds).toEqual(probability)
      expect(record.oddsAssumed).toBe(true)
    }
  })

  it('機率設定缺欄位時，先補上預設值再推算（加起來超過 100 時 N 拿剩下的）', () => {
    const raw = { lotteryPrizes: prizes, lotteryProbability: { UR: 5 }, rewardHistory: [{ id: 'a' }] }
    // 預設 N 50、R 25、SR 15、SSR 8，UR 改成 5 → 前四個佔 53%，N 剩 47%
    expect(normalizeData(raw).rewardHistory[0].odds).toEqual({ ...DEFAULT_LOTTERY_PROBABILITY(), UR: 5, N: 47 })
  })

  it('卡池全空、算不出來時不補，原樣保留', () => {
    const record = { id: 'a', rarity: 'N' }
    const raw = { lotteryProbability: probability, rewardHistory: [record] }
    const result = normalizeData(raw)
    expect(result.rewardHistory[0]).toBe(record)
    expect(result.rewardHistory).toBe(raw.rewardHistory)
  })

  it('不是物件的項目原樣保留', () => {
    const history = normalizeData({ lotteryPrizes: prizes, rewardHistory: ['x', null, 3, [1]] }).rewardHistory as unknown[]
    expect(history).toEqual(['x', null, 3, [1]])
  })

  it('不修改傳入的資料', () => {
    const raw = deepFreeze({ lotteryPrizes: prizes, lotteryProbability: probability, rewardHistory: [{ id: 'a', rarity: 'N' }] })
    const snapshot = JSON.stringify(raw)
    expect(() => normalizeData(raw)).not.toThrow()
    expect(JSON.stringify(raw)).toBe(snapshot)
  })

  it('補過一次就固定：之後改了機率設定再整理，舊紀錄的 odds 不會變；全部都有 odds 時沿用原本的陣列', () => {
    const once = normalizeData({ lotteryPrizes: prizes, lotteryProbability: probability, rewardHistory: [{ id: 'a', rarity: 'N' }] })
    const changed = normalizeData({ ...once, lotteryProbability: recorded })
    expect(changed.rewardHistory[0].odds).toEqual(probability)
    expect(changed.rewardHistory[0].oddsAssumed).toBe(true)
    expect(changed.rewardHistory).toBe(once.rewardHistory)
  })

  it('每筆紀錄的 odds 是各自的物件', () => {
    const history = normalizeData({ lotteryPrizes: prizes, rewardHistory: [{ id: 'a' }, { id: 'b' }] }).rewardHistory
    expect(history[0].odds).toEqual(history[1].odds)
    expect(history[0].odds).not.toBe(history[1].odds)
  })
})
