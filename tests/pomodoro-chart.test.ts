import { describe, it, expect } from 'vitest'
import { segmentWidthPercent, taskMarkerPercent, timelinePercent } from '../src/domain/pomodoroChart.ts'

const START = '2026-11-22T01:00:00.000Z'
const at = (seconds: number) => new Date(Date.parse(START) + seconds * 1000).toISOString()

describe('segmentWidthPercent：長條寬度', () => {
  it('照佔全程的比例', () => {
    expect(segmentWidthPercent(30, 120)).toBe(25)
    expect(segmentWidthPercent(120, 120)).toBe(100)
  })

  it('全程時間是 0、缺少或不是正常數字時是 0，不會變成無限大或 NaN', () => {
    expect(segmentWidthPercent(30, 0)).toBe(0)
    expect(segmentWidthPercent(0, 0)).toBe(0)
    expect(segmentWidthPercent(30, undefined)).toBe(0)
    expect(segmentWidthPercent(30, NaN)).toBe(0)
    expect(segmentWidthPercent(30, -10)).toBe(0)
  })

  it('這一段的秒數不正常時是 0', () => {
    expect(segmentWidthPercent(NaN, 120)).toBe(0)
    expect(segmentWidthPercent(-5, 120)).toBe(0)
  })
})

describe('timelinePercent：時間點在時間軸上的位置', () => {
  it('從開始算起佔全程的百分比，不限制範圍', () => {
    expect(timelinePercent(at(60), START, 120)).toBe(50)
    expect(timelinePercent(at(180), START, 120)).toBe(150)
    expect(timelinePercent(at(-60), START, 120)).toBe(-50)
  })

  it('全程時間是 0、或時間讀不出來時是 null', () => {
    expect(timelinePercent(at(60), START, 0)).toBeNull()
    expect(timelinePercent(START, START, 0)).toBeNull()
    expect(timelinePercent('not a date', START, 120)).toBeNull()
    expect(timelinePercent(at(60), undefined, 120)).toBeNull()
    expect(timelinePercent(undefined, START, 120)).toBeNull()
  })
})

describe('taskMarkerPercent：任務完成標記的位置', () => {
  it('限制在 0～100% 之間', () => {
    expect(taskMarkerPercent(at(60), START, 120)).toBe(50)
    expect(taskMarkerPercent(at(121), START, 120)).toBe(100)
    expect(taskMarkerPercent(at(-1), START, 120)).toBe(0)
  })

  it('算不出位置時是 null（不畫）', () => {
    expect(taskMarkerPercent(at(60), START, 0)).toBeNull()
    expect(taskMarkerPercent('not a date', START, 120)).toBeNull()
  })
})
