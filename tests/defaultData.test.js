import { describe, it, expect } from 'vitest'
import {
  createDefaultData,
  normalizeData,
  DEFAULT_LOTTERY_PRIZES,
  DEFAULT_LOTTERY_PROBABILITY,
  DEFAULT_CLOUD_CONFIG,
  migrateIndicatorId,
  migrateTaskList,
} from '../src/shared/defaultData.js'

const deepFreeze = (obj) => {
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
    a.majorTasks.push({ id: 1 })
    a.goals.growth.push('x')
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
    expect(result.majorTasks).toEqual([{ id: 'a' }])
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
    expect(result.subTasks).toEqual([{ id: 's1' }])
    expect(result.rewardFolderPath).toBe('C:\\pics')
    expect(result.lotteryTickets).toBe(7)
    expect(result.futureField).toEqual({ nested: true })
    expect(result.anotherOne).toBe('keep me')
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
    expect(result.notes.map((n) => n.title)).toEqual(['有標題', '2026-01-02', '無主題'])
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
    expect(result.lotteryPrizes).toEqual({ N: [{ name: 'a' }], R: [], SR: [], SSR: [], UR: [] })
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
    expect(result.subTasks).toEqual([{ id: 'keep' }])
    expect(result.majorTasks).toEqual([{ id: 'm' }])
    expect(result.lotteryTickets).toBe(4)
    expect(result.lotteryPrizes.N).toEqual([])
    expect(result.lotteryPrizes.UR).toEqual([{ name: 'u' }])
  })
})

describe('維度代號改名：學習 learning → 成長 growth（2026-11-22）', () => {
  const old = () => ({
    goals: { learning: [{ id: 'g1' }], health: [{ id: 'h1' }] },
    majorTasks: [{ id: 'm1', indicatorId: 'learning' }, { id: 'm2', indicatorId: 'health' }],
    subTasks: [{ id: 's1', indicatorId: 'learning' }],
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
