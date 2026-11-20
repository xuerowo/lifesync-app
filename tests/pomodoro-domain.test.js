import { describe, it, expect } from 'vitest'
import {
  breakSecondsFor,
  isLongBreak,
  nextBreakInfo,
  nextPhaseOnTimeout,
  normalizePomodoroSettings,
  phaseStartEvents,
  shouldHandleTimeout,
} from '../src/domain/pomodoro.js'

const settings = { focus: 25, break: 5 }

describe('nextPhaseOnTimeout：倒數歸零後的下一階段', () => {
  it('專注時間到：番茄數只 +1、重置本輪工作時長、進入休息', () => {
    const next = nextPhaseOnTimeout({ status: 'focus', cycles: 0, settings })
    expect(next).toEqual({
      status: 'break',
      timeLeft: 5 * 60,
      cyclesIncrement: 1,
      resetCycleWorkDuration: true,
      timelineEvent: 'break_start',
    })
  })

  // 以下三個是「舊設定（沒有長休息欄位）」的換算：休息 <= 10 分鐘才有長休息、每 4 個番茄 20 分鐘
  it('第 4 輪專注結束、休息設定 <= 10 分鐘：改成 20 分鐘長休息', () => {
    const next = nextPhaseOnTimeout({ status: 'focus', cycles: 3, settings })
    expect(next.timeLeft).toBe(20 * 60)
    expect(next.cyclesIncrement).toBe(1)
  })

  it('第 8 輪也是長休息；第 5 輪不是', () => {
    expect(nextPhaseOnTimeout({ status: 'focus', cycles: 7, settings }).timeLeft).toBe(20 * 60)
    expect(nextPhaseOnTimeout({ status: 'focus', cycles: 4, settings }).timeLeft).toBe(5 * 60)
  })

  it('休息設定超過 10 分鐘時，第 4 輪照設定休息，不改成 20 分鐘', () => {
    const next = nextPhaseOnTimeout({ status: 'focus', cycles: 3, settings: { focus: 25, break: 15 } })
    expect(next.timeLeft).toBe(15 * 60)
  })

  it('休息設定剛好 10 分鐘時仍套用長休息', () => {
    const next = nextPhaseOnTimeout({ status: 'focus', cycles: 3, settings: { focus: 25, break: 10 } })
    expect(next.timeLeft).toBe(20 * 60)
  })

  it('休息時間到：回到專注，番茄數不變，倒數為專注設定', () => {
    const next = nextPhaseOnTimeout({ status: 'break', cycles: 2, settings })
    expect(next).toEqual({
      status: 'focus',
      timeLeft: 25 * 60,
      cyclesIncrement: 0,
      resetCycleWorkDuration: false,
      timelineEvent: 'focus_start',
    })
  })

  it('待機與心流沒有「時間到」', () => {
    expect(nextPhaseOnTimeout({ status: 'idle', cycles: 0, settings })).toBeNull()
    expect(nextPhaseOnTimeout({ status: 'flow', cycles: 0, settings })).toBeNull()
  })
})

describe('phaseStartEvents：進入新階段時寫入的事件', () => {
  const time = '2026-01-01T09:10:00.000Z'

  it('沒有暫停時只寫階段開始', () => {
    expect(phaseStartEvents('break_start', { isPaused: false, time })).toEqual([
      { type: 'break_start', time },
    ])
  })

  it('暫停中切換時先補 pause_end，時間與新階段相同', () => {
    expect(phaseStartEvents('flow_start', { isPaused: true, time })).toEqual([
      { type: 'pause_end', time },
      { type: 'flow_start', time },
    ])
  })
})

describe('breakSecondsFor：休息長度', () => {
  it('還沒完成任何番茄時不算長休息', () => {
    expect(breakSecondsFor(0, settings)).toBe(5 * 60)
  })
})

describe('shouldHandleTimeout：何時處理「時間到」', () => {
  const base = { timeLeft: 0, status: 'focus', isPaused: false, showSettlement: false, showSummary: false }

  it('專注或休息倒數到 0 且未暫停、未結算時處理', () => {
    expect(shouldHandleTimeout(base)).toBe(true)
    expect(shouldHandleTimeout({ ...base, status: 'break' })).toBe(true)
  })

  it('還有剩餘時間時不處理', () => {
    expect(shouldHandleTimeout({ ...base, timeLeft: 1 })).toBe(false)
  })

  it('待機、心流、暫停、結算畫面、總結畫面時不處理', () => {
    expect(shouldHandleTimeout({ ...base, status: 'idle' })).toBe(false)
    expect(shouldHandleTimeout({ ...base, status: 'flow' })).toBe(false)
    expect(shouldHandleTimeout({ ...base, isPaused: true })).toBe(false)
    expect(shouldHandleTimeout({ ...base, showSettlement: true })).toBe(false)
    expect(shouldHandleTimeout({ ...base, showSummary: true })).toBe(false)
  })
})

describe('長休息設定（P2）', () => {
  it('舊設定沒有長休息欄位：休息 <= 10 分鐘就開啟，20 分鐘、每 4 個番茄', () => {
    expect(normalizePomodoroSettings({ focus: 25, break: 5 })).toEqual({
      focus: 25, break: 5, longBreakEnabled: true, longBreakMinutes: 20, longBreakEvery: 4,
    })
    expect(normalizePomodoroSettings({ focus: 25, break: 10 }).longBreakEnabled).toBe(true)
    expect(normalizePomodoroSettings({ focus: 25, break: 15 }).longBreakEnabled).toBe(false)
  })

  it('欄位存在後就照設定，不再看休息是不是 <= 10 分鐘', () => {
    const s = { focus: 25, break: 15, longBreakEnabled: true, longBreakMinutes: 30, longBreakEvery: 3 }
    expect(breakSecondsFor(3, s)).toBe(30 * 60)
    expect(breakSecondsFor(4, s)).toBe(15 * 60)
    expect(breakSecondsFor(6, s)).toBe(30 * 60)
    const off = { focus: 25, break: 5, longBreakEnabled: false, longBreakMinutes: 20, longBreakEvery: 4 }
    expect(breakSecondsFor(4, off)).toBe(5 * 60)
    expect(isLongBreak(4, off)).toBe(false)
  })

  it('沒有設定、或什麼都不是：用預設值', () => {
    expect(normalizePomodoroSettings(null)).toEqual({
      focus: 25, break: 5, longBreakEnabled: true, longBreakMinutes: 20, longBreakEvery: 4,
    })
    expect(normalizePomodoroSettings([1, 2]).focus).toBe(25)
  })

  it('長休息的值一律是範圍內的整數：分鐘 1–30、每 2–10 個', () => {
    const s = normalizePomodoroSettings({ focus: 25, break: 5, longBreakEnabled: true, longBreakMinutes: 12.6, longBreakEvery: 1 })
    expect(s.longBreakMinutes).toBe(13)
    expect(s.longBreakEvery).toBe(2)
    const big = normalizePomodoroSettings({ focus: 25, break: 5, longBreakEnabled: false, longBreakMinutes: 999, longBreakEvery: 50 })
    expect(big.longBreakMinutes).toBe(30)
    expect(big.longBreakEvery).toBe(10)
    const bad = normalizePomodoroSettings({ focus: 25, break: 5, longBreakEnabled: 'yes', longBreakMinutes: 'abc', longBreakEvery: null })
    expect(bad.longBreakEnabled).toBe(true)
    expect(bad.longBreakMinutes).toBe(20)
    expect(bad.longBreakEvery).toBe(4)
  })

  it('不會動到專注和休息時間，其他欄位也保留', () => {
    const s = normalizePomodoroSettings({ focus: 50, break: 3, extra: 'x' })
    expect(s.focus).toBe(50)
    expect(s.break).toBe(3)
    expect(s.extra).toBe('x')
  })

  it('長休息和一般休息一樣長時，等待畫面仍然寫「長休息」', () => {
    const s = { focus: 25, break: 20, longBreakEnabled: true, longBreakMinutes: 20, longBreakEvery: 2 }
    expect(nextBreakInfo(2, s)).toEqual({ seconds: 1200, isLong: true })
    expect(nextBreakInfo(1, s)).toEqual({ seconds: 1200, isLong: false })
  })
})
