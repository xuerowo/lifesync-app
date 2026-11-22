import { describe, it, expect } from 'vitest'
import { formatTime, formatFlowTime, getDateStr, formatTaskTime, formatDateOnly } from '../src/utils/index.ts'

describe('時間格式工具', () => {
  it('formatTime 顯示分:秒', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(125)).toBe('02:05')
  })

  it('formatFlowTime 超過一小時顯示時:分:秒', () => {
    expect(formatFlowTime(59)).toBe('00:59')
    expect(formatFlowTime(3725)).toBe('1:02:05')
  })

  it('getDateStr 回傳本地日期（不是 UTC 日期）', () => {
    // 本地時間 2026-03-05 01:30，在 UTC+8 時區對應 UTC 前一天
    const d = new Date(2026, 2, 5, 1, 30)
    expect(getDateStr(d)).toBe('2026-03-05')
  })
})


describe('formatTaskTime：任務時間的寫法（全形括號、範圍用「～」）', () => {
  it('每日任務', () => {
    expect(formatTaskTime({ type: 'daily', noTime: true })).toBe('每日（不限時間）')
    expect(formatTaskTime({ type: 'daily', noTime: true }, true)).toBe('')
    expect(formatTaskTime({ type: 'daily', startTime: '09:00', endTime: '10:30' })).toBe('每日 09:00～10:30')
    expect(formatTaskTime({ type: 'daily', startTime: '09:00', endTime: '10:30' }, true)).toBe('09:00～10:30')
  })

  it('每週任務：「每週一、三」', () => {
    expect(formatTaskTime({ type: 'weekly', days: [1, 3], noTime: true })).toBe('每週一、三（不限時間）')
    expect(formatTaskTime({ type: 'weekly', days: [1, 3], startTime: '07:00', endTime: '08:00' })).toBe('每週一、三 07:00～08:00')
    expect(formatTaskTime({ type: 'weekly', days: [0], startTime: '07:00', endTime: '08:00' }, true)).toBe('07:00～08:00')
    // 舊資料沒有 days 也不會出錯
    expect(formatTaskTime({ type: 'weekly', noTime: true })).toBe('每週（不限時間）')
  })

  it('一次性任務：日期寫成 2026/11/22，同一天結束只寫時間', () => {
    expect(formatTaskTime({ type: 'precise', noTime: true })).toBe('不限時間')
    expect(formatTaskTime({ type: 'precise', startDateTime: '2026-11-22T14:00', endDateTime: '2026-11-22T15:30' }))
      .toBe('2026/11/22 14:00～15:30')
    expect(formatTaskTime({ type: 'precise', startDateTime: '2026-11-22T23:00', endDateTime: '2026-11-23T01:00' }))
      .toBe('2026/11/22 23:00～2026/11/23 01:00')
    expect(formatTaskTime({ type: 'precise', startDateTime: '2026-11-22T14:00' })).toBe('2026/11/22 14:00')
    // 本地時間字串直接拆，不經過時區換算
    expect(formatTaskTime({ type: 'precise', startDateTime: '2026-11-22T00:05', endDateTime: '' }, true)).toBe('2026/11/22 00:05')
  })

  it('隨時挑戰', () => {
    expect(formatTaskTime({ type: 'infinite' })).toBe('隨時挑戰')
    expect(formatTaskTime({ type: 'infinite' }, true)).toBe('')
  })
})

describe('formatDateOnly：計畫的開始、結束日期', () => {
  it('YYYY-MM-DD → 2026/11/22（照本地日期，不換算時區）', () => {
    expect(formatDateOnly('2026-11-22')).toBe('2026/11/22')
    expect(formatDateOnly('2026-01-01')).toBe('2026/01/01')
  })

  it('空值回傳空字串，看不懂的原樣顯示', () => {
    expect(formatDateOnly('')).toBe('')
    expect(formatDateOnly(undefined)).toBe('')
    expect(formatDateOnly('明天')).toBe('明天')
  })
})
