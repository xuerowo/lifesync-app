import { describe, it, expect } from 'vitest'
import { addableSessionTasks, pomodoroCandidateTasks } from '../src/domain/pomodoro.js'

// 2026-11-20 是星期五（getDay() === 5），用本地時間建立
const NOW = new Date(2026, 10, 20, 10, 0, 0)

const task = (id, extra = {}) => ({ id, title: id, indicatorId: 'growth', type: 'precise', completed: false, ...extra })

describe('pomodoroCandidateTasks：番茄鐘可選的目標任務', () => {
  it('只列成長維度、未完成的任務', () => {
    const list = pomodoroCandidateTasks([
      task('a'),
      task('health', { indicatorId: 'health' }),
      task('done', { completed: true }),
      task('inf', { type: 'infinite' }),
    ], NOW)
    expect(list.map(t => t.id)).toEqual(['a', 'inf'])
  })

  it('每日任務今天已完成就不列', () => {
    const list = pomodoroCandidateTasks([
      task('d1', { type: 'daily', lastCompletedAt: '2026-11-20T08:00:00.000Z' }),
      task('d2', { type: 'daily', lastCompletedAt: '2026-11-19T08:00:00.000Z' }),
      task('d3', { type: 'daily' }),
    ], NOW)
    expect(list.map(t => t.id)).toEqual(['d2', 'd3'])
  })

  it('每週任務：今天不是指定星期就不列；沒有 days 欄位也不會出錯', () => {
    const list = pomodoroCandidateTasks([
      task('w-fri', { type: 'weekly', days: [5] }),
      task('w-mon', { type: 'weekly', days: [1] }),
      task('w-broken', { type: 'weekly' }),
    ], NOW)
    expect(list.map(t => t.id)).toEqual(['w-fri'])
  })

  it('不是陣列時回傳空陣列', () => {
    expect(pomodoroCandidateTasks(undefined, NOW)).toEqual([])
  })
})

describe('addableSessionTasks：進行中按「＋」可加入的任務', () => {
  it('排除已經在本次目標裡的任務，順序照任務清單', () => {
    const subTasks = [task('a'), task('b'), task('c')]
    const list = addableSessionTasks(subTasks, [{ id: 'b', title: 'b' }], NOW)
    expect(list.map(t => t.id)).toEqual(['a', 'c'])
  })

  it('全部都在目標裡時是空的', () => {
    const subTasks = [task('a')]
    expect(addableSessionTasks(subTasks, [task('a')], NOW)).toEqual([])
  })

  it('今天已完成的每日任務不能再加入', () => {
    const subTasks = [task('d', { type: 'daily', lastCompletedAt: '2026-11-20T08:00:00.000Z' })]
    expect(addableSessionTasks(subTasks, [], NOW)).toEqual([])
  })
})
