import { describe, it, expect } from 'vitest'
import {
  applySortOrders,
  fillPlanSortOrders,
  fillTaskSortOrders,
  legacyPlanSort,
  reorderSortOrders,
  sortBySortOrder,
  sortTasksLikePlanList,
  topSortOrder,
} from '../src/shared/taskOrder.ts'
import { normalizeData } from '../src/shared/defaultData.ts'
import { restorePlan } from '../src/domain/plans.ts'
import type { PlanData } from '../src/domain/plans.ts'
import type { MajorTask, SubTask } from '../src/types/data.ts'

// 測試資料只放排序用得到的欄位
type Plan = Partial<MajorTask>
type Task = Partial<SubTask>

const deepFreeze = <T>(obj: T): T => {
  if (obj && typeof obj === 'object') {
    Object.values(obj).forEach(deepFreeze)
    Object.freeze(obj)
  }
  return obj
}

// 2026-11-22 是星期日
const NOW = new Date(2026, 10, 22, 12, 0, 0)

describe('sortBySortOrder：照使用者排的順序', () => {
  it('由小到大；沒有 sortOrder 的排最前面，彼此維持原本先後', () => {
    const list = [{ id: 'a', sortOrder: 2 }, { id: 'b' }, { id: 'c', sortOrder: -1 }, { id: 'd' }]
    expect(sortBySortOrder(list).map((t) => t.id)).toEqual(['b', 'd', 'c', 'a'])
  })
  it('不改動傳入的陣列，壞資料不會讓它出錯', () => {
    const list = deepFreeze([{ id: 'a', sortOrder: 1 }, { id: 'b', sortOrder: 0 }])
    expect(sortBySortOrder(list).map((t) => t.id)).toEqual(['b', 'a'])
    expect(sortBySortOrder(null)).toEqual([])
  })
})

describe('topSortOrder：新增的放最上面', () => {
  it('比目前最小的還小 1；沒有任何項目時是 0', () => {
    expect(topSortOrder([{ sortOrder: 3 }, { sortOrder: -2 }])).toBe(-3)
    expect(topSortOrder([])).toBe(0)
    expect(topSortOrder([{ id: 'old' }])).toBe(0)
  })
})

describe('舊資料補上 sortOrder：升級後畫面順序不變', () => {
  it('計畫照升級前的自動排序：有優先任務的在前 → 今天還能做的多的在前 → 開始日期早 → 建立早', () => {
    const majorTasks: Plan[] = [
      { id: 'late', startDate: '2026-03-01', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'early', startDate: '2026-01-01', createdAt: '2026-01-02T00:00:00Z' },
      { id: 'busy', startDate: '2026-06-01' },
      { id: 'prio', startDate: '2026-09-01' },
    ]
    const subTasks: Task[] = [
      { id: 's1', majorTaskId: 'busy', type: 'precise', completed: false },
      { id: 's2', majorTaskId: 'busy', type: 'daily' },
      { id: 's3', majorTaskId: 'prio', type: 'precise', isPriority: true, priorityOrder: 1 },
    ]
    expect(legacyPlanSort(majorTasks, subTasks, NOW).map((t) => t.id)).toEqual(['prio', 'busy', 'early', 'late'])
    const filled = fillPlanSortOrders(majorTasks, subTasks, NOW)
    expect(sortBySortOrder(filled).map((t) => t.id)).toEqual(['prio', 'busy', 'early', 'late'])
    expect(filled.map((t) => t.sortOrder)).toEqual([3, 2, 1, 0])
  })

  it('今天已經做完的每日任務、今天不用做的每週任務不算「還能做」', () => {
    const majorTasks: Plan[] = [{ id: 'a', startDate: '2026-01-01' }, { id: 'b', startDate: '2026-02-01' }]
    const subTasks: Task[] = [
      { id: 'd', majorTaskId: 'a', type: 'daily', lastCompletedAt: '2026-11-22T08:00:00.000Z' },
      { id: 'w', majorTaskId: 'a', type: 'weekly', days: [1, 2, 3] },
      { id: 'x', majorTaskId: 'b', type: 'precise', completed: false },
    ]
    expect(legacyPlanSort(majorTasks, subTasks, NOW).map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('任務照陣列裡的先後，每個計畫各自一組', () => {
    const subTasks: Task[] = [
      { id: 'a1', majorTaskId: 'A' },
      { id: 'b1', majorTaskId: 'B' },
      { id: 'a2', majorTaskId: 'A' },
    ]
    const filled = fillTaskSortOrders(subTasks)
    expect(filled.map((t) => t.sortOrder)).toEqual([0, 0, 1])
  })

  it('已經有 sortOrder 的資料原樣回傳同一個陣列', () => {
    const plans = [{ id: 'a', sortOrder: 0 }]
    const subs = [{ id: 's', majorTaskId: 'a', sortOrder: 5 }]
    expect(fillPlanSortOrders(plans, subs, NOW)).toBe(plans)
    expect(fillTaskSortOrders(subs)).toBe(subs)
  })

  it('後來才出現、沒有 sortOrder 的（例如舊版程式新增的）放在最上面', () => {
    const plans = [{ id: 'a', sortOrder: 0 }, { id: 'b', sortOrder: 1 }, { id: 'new' }]
    expect(sortBySortOrder(fillPlanSortOrders(plans, [], NOW)).map((t) => t.id)).toEqual(['new', 'a', 'b'])
    const subs = [{ id: 's1', majorTaskId: 'a', sortOrder: 0 }, { id: 's2', majorTaskId: 'a' }]
    expect(sortBySortOrder(fillTaskSortOrders(subs)).map((t) => t.id)).toEqual(['s2', 's1'])
  })

  it('normalizeData 讀檔時就補好，而且不改動傳入的資料', () => {
    const raw = deepFreeze<{ majorTasks: Plan[]; subTasks: Task[] }>({ majorTasks: [{ id: 'a', startDate: '2026-01-01' }], subTasks: [{ id: 's', majorTaskId: 'a' }] })
    const r = normalizeData(raw)
    expect(r.majorTasks[0].sortOrder).toBe(0)
    expect(r.subTasks[0].sortOrder).toBe(0)
    expect(raw.majorTasks[0].sortOrder).toBeUndefined()
    expect(normalizeData(r)).toEqual(r)
  })
})

describe('reorderSortOrders：拖曳換位置', () => {
  const plans = [
    { id: 'a', sortOrder: 0, dim: 'x' },
    { id: 'b', sortOrder: 1, dim: 'y' },
    { id: 'c', sortOrder: 2, dim: 'x' },
    { id: 'd', sortOrder: 3, dim: 'y' },
  ]
  const ids = <T extends { id: string }>(list: readonly T[]) => sortBySortOrder(list).map((t) => t.id)

  it('往下拖、往上拖', () => {
    expect(ids(applySortOrders(plans, reorderSortOrders(plans, null, 'a', 'c')))).toEqual(['b', 'c', 'a', 'd'])
    expect(ids(applySortOrders(plans, reorderSortOrders(plans, null, 'd', 'a')))).toEqual(['d', 'a', 'b', 'c'])
  })

  it('篩選時只動被拖的那一筆，看不到的項目彼此先後不變', () => {
    const visible = plans.filter((t) => t.dim === 'x').map((t) => t.id)
    // 畫面上只有 a、c；把 c 拖到 a 前面
    const up = reorderSortOrders(plans, visible, 'c', 'a')
    expect([...up.keys()]).toEqual(['c'])
    expect(ids(applySortOrders(plans, up))).toEqual(['c', 'a', 'b', 'd'])
    // 再把 a 拖到 c 後面：a 插在 c 正後方
    expect(ids(applySortOrders(plans, reorderSortOrders(plans, visible, 'a', 'c')))).toEqual(['b', 'c', 'a', 'd'])
    // 看不到的項目不能當目標
    expect(reorderSortOrders(plans, visible, 'c', 'b').size).toBe(0)
  })

  it('沒有移動、找不到項目時不改', () => {
    expect(reorderSortOrders(plans, null, 'a', 'a').size).toBe(0)
    expect(reorderSortOrders(plans, null, 'a', 'zzz').size).toBe(0)
    expect(applySortOrders(plans, new Map())).toBe(plans)
  })

  it('沒變的項目沿用原本的物件', () => {
    const next = applySortOrders(plans, reorderSortOrders(plans, null, 'b', 'a'))
    expect(next[2]).toBe(plans[2])
    expect(next[3]).toBe(plans[3])
  })

  it('只改被拖的那一筆：放到兩筆中間就取中間值，放到頭尾就比旁邊那筆小 1／大 1', () => {
    expect([...reorderSortOrders(plans, null, 'a', 'c')]).toEqual([['a', 2.5]])
    expect([...reorderSortOrders(plans, null, 'd', 'a')]).toEqual([['d', -1]])
    expect([...reorderSortOrders(plans, null, 'a', 'd')]).toEqual([['a', 4]])
  })

  it('前後兩筆的值太接近時，整組重新編號成 0、1、2……', () => {
    const tight = [{ id: 'a', sortOrder: 0 }, { id: 'b', sortOrder: 1e-7 }, { id: 'c', sortOrder: 1 }]
    const orders = reorderSortOrders(tight, null, 'c', 'b')
    expect(ids(applySortOrders(tight, orders))).toEqual(['a', 'c', 'b'])
    expect([...orders.values()]).toEqual([0, 1, 2])
  })

  it('有項目沒有 sortOrder 時，整組重新編號', () => {
    const mixed = [{ id: 'a' }, { id: 'b', sortOrder: 0 }, { id: 'c', sortOrder: 1 }]
    const orders = reorderSortOrders(mixed, null, 'c', 'b')
    expect(ids(applySortOrders(mixed, orders))).toEqual(['a', 'c', 'b'])
    expect(orders.size).toBe(3)
  })

  it('連續拖很多次，順序一直正確', () => {
    let list = plans
    for (let i = 0; i < 60; i++) {
      const [first, second] = ids(list)
      list = applySortOrders(list, reorderSortOrders(list, null, second, first))
    }
    expect(ids(list)).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('sortTasksLikePlanList：番茄鐘的任務順序和計畫清單一致', () => {
  it('先照計畫的順序，再照計畫裡任務的順序；找不到計畫的放最後', () => {
    const majorTasks = [{ id: 'P1', sortOrder: 1 }, { id: 'P2', sortOrder: 0 }]
    const subTasks = [
      { id: 'lost', majorTaskId: 'gone', sortOrder: -5 },
      { id: 'p1b', majorTaskId: 'P1', sortOrder: 1 },
      { id: 'p2a', majorTaskId: 'P2', sortOrder: 3 },
      { id: 'p1a', majorTaskId: 'P1', sortOrder: 0 },
    ]
    expect(sortTasksLikePlanList(subTasks, majorTasks).map((t) => t.id)).toEqual(['p2a', 'p1a', 'p1b', 'lost'])
    expect(subTasks[0].id).toBe('lost')
    expect(sortTasksLikePlanList(null, null)).toEqual([])
  })
})

describe('恢復的計畫放在進行中清單的最上面', () => {
  it('restorePlan 給它比目前最小還小的 sortOrder', () => {
    // 只放排序用得到的欄位（沒有 indicatorId）
    const data = {
      majorTasks: [{ id: 'x', sortOrder: 0 }, { id: 'y', sortOrder: 1 }],
      archivedTasks: [{ id: 'p', sortOrder: 7, completed: true }],
      subTasks: [],
      archivedSubTasks: [],
    } as unknown as PlanData
    const changes = restorePlan(data, 'p')! // 計畫 p 在已完成區，一定恢復得了
    expect(sortBySortOrder(changes.majorTasks).map((t) => t.id)).toEqual(['p', 'x', 'y'])
  })
})
