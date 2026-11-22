import { describe, it, expect } from 'vitest'
import {
  RANGE_SEP,
  formatDisplayDate,
  formatDisplayDateTime,
  formatDisplayMonth,
  formatDisplayTime,
} from '../src/utils/displayFormat.js'

describe('畫面上的日期時間寫法', () => {
  const d = new Date(2026, 10, 2, 9, 5, 30)

  it('日期 2026/11/02、時間 09:05（24 小時制、不顯示秒）', () => {
    expect(formatDisplayDate(d)).toBe('2026/11/02')
    expect(formatDisplayTime(d)).toBe('09:05')
    expect(formatDisplayDateTime(d)).toBe('2026/11/02 09:05')
    expect(formatDisplayTime(new Date(2026, 0, 1, 21, 30))).toBe('21:30')
  })

  it('月份與範圍符號', () => {
    expect(formatDisplayMonth(d)).toBe('2026 年 11 月')
    expect(RANGE_SEP).toBe('～')
  })

  it('也接受時間字串、數字；看不懂的值回傳空字串', () => {
    expect(formatDisplayDate(d.getTime())).toBe('2026/11/02')
    expect(formatDisplayDate('2026-11-02T09:05:00')).toBe('2026/11/02')
    expect(formatDisplayDate('不是日期')).toBe('')
    expect(formatDisplayTime(null)).toBe('')
    expect(formatDisplayDateTime(undefined)).toBe('')
    expect(formatDisplayDate(new Date('x'))).toBe('')
  })
})
