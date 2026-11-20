import { describe, it, expect } from 'vitest'
import { formatTime, formatFlowTime, getDateStr } from '../src/utils/index.js'

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
