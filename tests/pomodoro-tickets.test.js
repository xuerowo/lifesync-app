import { describe, it, expect } from 'vitest'
import {
  focusTicketsFor,
  pomodoroTaskTicketGrants,
  pomodoroSettlementTickets,
  settlePomodoroTickets,
} from '../src/domain/pomodoro.js'

const T0 = Date.UTC(2026, 10, 20, 9, 0, 0)
const at = (sec) => new Date(T0 + sec * 1000).toISOString()

// 新版番茄鐘完成任務時寫的事件與紀錄（紀錄先記 0 張）
const completion = (recordId, taskId, sec, rewardTickets) => ({
  event: { type: 'task_complete', taskId, taskTitle: taskId, recordId, rewardTickets, time: at(sec) },
  record: { id: recordId, taskId, completedAt: at(sec), rewardTickets: 0 },
})

describe('focusTicketsFor：專注時間給券（規則和以前相同）', () => {
  it('未滿 50 分鐘不給；滿 50 給 1；滿 100 給 1+2；滿 150 給 1+2+3', () => {
    expect(focusTicketsFor(0)).toBe(0)
    expect(focusTicketsFor(50 * 60 - 1)).toBe(0)
    expect(focusTicketsFor(50 * 60)).toBe(1)
    expect(focusTicketsFor(100 * 60)).toBe(3)
    expect(focusTicketsFor(150 * 60)).toBe(6)
  })

  it('最多算到 300 分鐘（21 張）', () => {
    expect(focusTicketsFor(300 * 60)).toBe(21)
    expect(focusTicketsFor(1000 * 60)).toBe(21)
  })

  it('負數、非數字當 0', () => {
    expect(focusTicketsFor(-5)).toBe(0)
    expect(focusTicketsFor(undefined)).toBe(0)
    expect(focusTicketsFor(NaN)).toBe(0)
  })
})

describe('pomodoroTaskTicketGrants：任務的券照任務設定的張數', () => {
  it('每個完成事件照事件記下的任務張數給', () => {
    const a = completion('r1', 'A', 60, 10)
    const b = completion('r2', 'B', 120, 3)
    const grants = pomodoroTaskTicketGrants(
      [{ type: 'focus_start', time: at(0) }, a.event, b.event],
      [b.record, a.record],
    )
    expect(grants).toEqual([
      { recordId: 'r1', taskId: 'A', tickets: 10 },
      { recordId: 'r2', taskId: 'B', tickets: 3 },
    ])
  })

  it('隨時挑戰完成 3 次就給 3 次', () => {
    const c1 = completion('r1', 'X', 10, 2)
    const c2 = completion('r2', 'X', 20, 2)
    const c3 = completion('r3', 'X', 30, 2)
    const grants = pomodoroTaskTicketGrants([c1.event, c2.event, c3.event], [c3.record, c2.record, c1.record])
    expect(grants.map(g => g.tickets)).toEqual([2, 2, 2])
  })

  it('紀錄已經不在（期間在任務清單撤銷或刪掉了）就不給', () => {
    const a = completion('r1', 'A', 60, 10)
    expect(pomodoroTaskTicketGrants([a.event], [])).toEqual([])
  })

  it('任務設 0 張就是 0 張；壞掉的張數當 0', () => {
    const a = completion('r1', 'A', 60, 0)
    const b = completion('r2', 'B', 70, 'abc')
    const grants = pomodoroTaskTicketGrants([a.event, b.event], [a.record, b.record])
    expect(grants.map(g => g.tickets)).toEqual([0, 0])
  })

  it('舊版事件（沒有 recordId）：用任務 id 與時間找回紀錄，照舊版規則給 1 張', () => {
    const legacyEvent = { type: 'task_complete', taskId: 'A', taskTitle: 'A', time: at(60) }
    const record = { id: 'old', taskId: 'A', completedAt: at(60.05), rewardTickets: 1 }
    const olderRecord = { id: 'older', taskId: 'A', completedAt: at(-3600), rewardTickets: 5 }
    expect(pomodoroTaskTicketGrants([legacyEvent], [record, olderRecord])).toEqual([
      { recordId: 'old', taskId: 'A', tickets: 1 },
    ])
  })

  it('舊版事件找不到時間相近的紀錄就不給（不會誤用以前的紀錄）', () => {
    const legacyEvent = { type: 'task_complete', taskId: 'A', time: at(60) }
    const olderRecord = { id: 'older', taskId: 'A', completedAt: at(-3600), rewardTickets: 5 }
    expect(pomodoroTaskTicketGrants([legacyEvent], [olderRecord])).toEqual([])
  })

  it('同一筆紀錄不會被兩個事件重複使用', () => {
    const e1 = { type: 'task_complete', taskId: 'A', time: at(60) }
    const e2 = { type: 'task_complete', taskId: 'A', time: at(61) }
    const record = { id: 'only', taskId: 'A', completedAt: at(60), rewardTickets: 1 }
    expect(pomodoroTaskTicketGrants([e1, e2], [record])).toHaveLength(1)
  })

  it('沒有時間軸或紀錄時回傳空陣列', () => {
    expect(pomodoroTaskTicketGrants(undefined, undefined)).toEqual([])
  })
})

describe('pomodoroSettlementTickets：結算畫面的券數', () => {
  it('時間的券 + 任務的券', () => {
    const a = completion('r1', 'A', 60, 10)
    const result = pomodoroSettlementTickets({
      workSeconds: 100 * 60,
      timeline: [a.event],
      taskHistory: [a.record],
    })
    expect(result.timeTickets).toBe(3)
    expect(result.taskTickets).toBe(10)
    expect(result.total).toBe(13)
  })
})

describe('settlePomodoroTickets：領取與結束', () => {
  const setup = () => {
    const a = completion('r1', 'A', 60, 10)
    const b = completion('r2', 'B', 70, 2)
    const other = { id: 'x', taskId: 'Z', completedAt: at(-100), rewardTickets: 4 }
    const data = { lotteryTickets: 5, taskHistory: [b.record, a.record, other] }
    const grants = pomodoroTaskTicketGrants([a.event, b.event], data.taskHistory)
    return { data, grants }
  }

  it('領取：加上時間 + 任務的券，紀錄改成實際給的張數，其他紀錄不動', () => {
    const { data, grants } = setup()
    const next = settlePomodoroTickets(data, { grants, timeTickets: 3, claim: true })
    expect(next.lotteryTickets).toBe(5 + 3 + 10 + 2)
    expect(next.taskHistory.find(h => h.id === 'r1').rewardTickets).toBe(10)
    expect(next.taskHistory.find(h => h.id === 'r2').rewardTickets).toBe(2)
    expect(next.taskHistory.find(h => h.id === 'x')).toBe(data.taskHistory[2])
    // 不改動傳入的資料
    expect(data.taskHistory[1].rewardTickets).toBe(0)
  })

  it('結束不領：不加券，紀錄一律記 0 張（之後撤銷不會扣到沒拿到的券）', () => {
    const { data, grants } = setup()
    const next = settlePomodoroTickets(data, { grants, timeTickets: 3, claim: false })
    expect(next.lotteryTickets).toBe(5)
    expect(next.taskHistory.find(h => h.id === 'r1').rewardTickets).toBe(0)
    expect(next.taskHistory.find(h => h.id === 'r2').rewardTickets).toBe(0)
  })

  it('結束不領：舊版紀錄（記 1 張）也改成 0 張', () => {
    const legacyEvent = { type: 'task_complete', taskId: 'A', time: at(60) }
    const record = { id: 'old', taskId: 'A', completedAt: at(60), rewardTickets: 1 }
    const data = { lotteryTickets: 0, taskHistory: [record] }
    const grants = pomodoroTaskTicketGrants([legacyEvent], data.taskHistory)
    const next = settlePomodoroTickets(data, { grants, claim: false })
    expect(next.taskHistory[0].rewardTickets).toBe(0)
  })

  it('領取時紀錄已經不在（例如剛被撤銷），那一筆不加券', () => {
    const { data, grants } = setup()
    const withoutA = { ...data, taskHistory: data.taskHistory.filter(h => h.id !== 'r1') }
    const next = settlePomodoroTickets(withoutA, { grants, timeTickets: 0, claim: true })
    expect(next.lotteryTickets).toBe(5 + 2)
  })

  it('完整流程：番茄鐘裡完成 → 領取 → 之後在任務清單撤銷，扣回的正好是給的張數', () => {
    const { data, grants } = setup()
    const claimed = settlePomodoroTickets(data, { grants, timeTickets: 0, claim: true })
    const given = claimed.lotteryTickets - data.lotteryTickets
    const recorded = claimed.taskHistory.filter(h => h.id === 'r1' || h.id === 'r2').reduce((s, h) => s + h.rewardTickets, 0)
    expect(recorded).toBe(given)
  })
})
