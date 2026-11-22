import { describe, it, expect } from 'vitest'
import { calculatePomodoroStats } from '../src/utils/index.ts'
import type { PomodoroEvent, PomodoroEventType } from '../src/types/data.ts'

// 以「第幾分鐘」建立時間軸，方便閱讀
const BASE = Date.UTC(2026, 0, 1, 9, 0, 0)
const at = (minute: number) => new Date(BASE + minute * 60 * 1000).toISOString()
const timeline = (...events: [PomodoroEventType, number][]): PomodoroEvent[] => events.map(([type, minute]) => ({ type, time: at(minute) }))

const durations = (tl: PomodoroEvent[]) => {
  const { focusDuration, flowDuration, breakDuration } = calculatePomodoroStats(tl)
  return { focusDuration, flowDuration, breakDuration }
}

describe('calculatePomodoroStats：正常情況（期望值在修改前就已成立）', () => {
  it('沒有暫停：專注 25 → 休息 5 → 專注 25', () => {
    const tl = timeline(['focus_start', 0], ['break_start', 25], ['focus_start', 30], ['end', 55])
    expect(durations(tl)).toEqual({ focusDuration: 3000, flowDuration: 0, breakDuration: 300 })
  })

  it('暫停後恢復：暫停的 5 分鐘不計入', () => {
    const tl = timeline(
      ['focus_start', 0], ['pause_start', 10], ['pause_end', 15],
      ['break_start', 25], ['end', 30],
    )
    expect(durations(tl)).toEqual({ focusDuration: 1200, flowDuration: 0, breakDuration: 300 })
  })

  it('心流中暫停後恢復', () => {
    const tl = timeline(
      ['focus_start', 0], ['flow_start', 25], ['pause_start', 40], ['pause_end', 45],
      ['break_start', 50], ['end', 55],
    )
    expect(durations(tl)).toEqual({ focusDuration: 1500, flowDuration: 1200, breakDuration: 300 })
  })

  it('完成任務的事件不影響計時', () => {
    const tl = timeline(['focus_start', 0], ['task_complete', 10], ['end', 25])
    expect(durations(tl)).toEqual({ focusDuration: 1500, flowDuration: 0, breakDuration: 0 })
  })

  it('暫停後直接結束：暫停那段不計入', () => {
    const tl = timeline(['focus_start', 0], ['pause_start', 10], ['end', 20])
    expect(durations(tl)).toEqual({ focusDuration: 600, flowDuration: 0, breakDuration: 0 })
  })
})

describe('calculatePomodoroStats：暫停中切換階段（Q5）', () => {
  it('專注 10 分 → 暫停 → 跳到休息 5 分 → 專注 25 分（舊資料，沒有補 pause_end）', () => {
    const tl = timeline(
      ['focus_start', 0], ['pause_start', 10],
      ['break_start', 12], ['focus_start', 17], ['end', 42],
    )
    expect(durations(tl)).toEqual({ focusDuration: 2100, flowDuration: 0, breakDuration: 300 })
  })

  it('同樣情境，新版會在切換前補一筆 pause_end', () => {
    const tl = timeline(
      ['focus_start', 0], ['pause_start', 10],
      ['pause_end', 12], ['break_start', 12], ['focus_start', 17], ['end', 42],
    )
    expect(durations(tl)).toEqual({ focusDuration: 2100, flowDuration: 0, breakDuration: 300 })
  })

  it('暫停中進入心流：心流時間照算', () => {
    const tl = timeline(
      ['focus_start', 0], ['pause_start', 10],
      ['flow_start', 12], ['break_start', 32], ['end', 37],
    )
    expect(durations(tl)).toEqual({ focusDuration: 600, flowDuration: 1200, breakDuration: 300 })
  })

  it('暫停中切換的那一段標記為暫停，切換後的段落不是暫停', () => {
    const tl = timeline(['focus_start', 0], ['pause_start', 10], ['break_start', 12], ['end', 17])
    const { segments } = calculatePomodoroStats(tl)
    expect(segments.map(s => [s.mode, s.isPaused])).toEqual([
      ['focus', false], ['focus', true], ['break', false],
    ])
  })
})
