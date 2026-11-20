import { describe, it, expect } from 'vitest'
import { breakSecondsFor, nextPhaseOnTimeout, shouldHandleTimeout } from '../src/domain/pomodoro.js'

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
