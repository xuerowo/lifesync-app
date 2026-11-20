import { describe, it, expect } from 'vitest'
import {
  insertChronologically,
  isPausedByAppClose,
  lastEventMs,
  loadPomodoroState,
  planPhaseEnd,
  awaitingOf,
  pomodoroClock,
  RELOAD_GRACE_MS,
} from '../src/domain/pomodoroClock.js'
import { calculatePomodoroStats, pomodoroWorkSeconds } from '../src/utils/index.js'
import { focusTicketsFor, nextBreakInfo, shouldHandleTimeout } from '../src/domain/pomodoro.js'

const BASE = Date.UTC(2026, 10, 20, 9, 0, 0)
const MIN = 60 * 1000
const ms = (minute) => BASE + minute * MIN
const at = (minute) => new Date(ms(minute)).toISOString()
const tl = (...events) => events.map(([type, minute, extra]) => ({ type, time: at(minute), ...extra }))
const settings = { focus: 25, break: 5 }

const fakeStorage = (values) => ({
  getItem: (key) => (key in values ? String(values[key]) : null),
})

describe('pomodoroClock：從時間軸算出目前的計時', () => {
  it('剛開始專注：倒數是完整長度', () => {
    const c = pomodoroClock({ timeline: tl(['focus_start', 0]), phaseLength: 1500, nowMs: ms(0) })
    expect(c.timeLeft).toBe(1500)
    expect(c.workSeconds).toBe(0)
  })

  it('專注 10 分鐘：剩 15 分鐘，總專注 10 分鐘', () => {
    const c = pomodoroClock({ timeline: tl(['focus_start', 0]), phaseLength: 1500, nowMs: ms(10) })
    expect(c.timeLeft).toBe(900)
    expect(c.workSeconds).toBe(600)
    expect(c.phaseElapsed).toBe(600)
  })

  it('暫停的時間不算', () => {
    const c = pomodoroClock({
      timeline: tl(['focus_start', 0], ['pause_start', 5], ['pause_end', 15]),
      phaseLength: 1500,
      nowMs: ms(20),
    })
    expect(c.workSeconds).toBe(600)
    expect(c.timeLeft).toBe(900)
  })

  it('暫停中：時間停在暫停那一刻', () => {
    const timeline = tl(['focus_start', 0], ['pause_start', 5])
    const c = pomodoroClock({ timeline, phaseLength: 1500, nowMs: ms(60) })
    expect(c.isPaused).toBe(true)
    expect(c.timeLeft).toBe(1200)
  })

  it('對話框開著或休眠 10 分鐘（期間沒有任何事件）：醒來後照實際經過的時間算', () => {
    const c = pomodoroClock({ timeline: tl(['focus_start', 0]), phaseLength: 1500, nowMs: ms(10) })
    expect(c.workSeconds).toBe(600)
  })

  it('超過倒數長度：剩 0 秒，並算出倒數歸零的時間點（扣掉中間的暫停）', () => {
    const c = pomodoroClock({
      timeline: tl(['focus_start', 0], ['pause_start', 10], ['pause_end', 20]),
      phaseLength: 1500,
      nowMs: ms(120),
    })
    expect(c.timeLeft).toBe(0)
    expect(c.phaseEndMs).toBe(ms(35))
  })

  it('剩餘秒數無條件進位（還剩 0.4 秒時顯示 1 秒）', () => {
    const c = pomodoroClock({ timeline: tl(['focus_start', 0]), phaseLength: 60, nowMs: ms(0) + 59600 })
    expect(c.timeLeft).toBe(1)
  })

  it('本輪工作時長：專注 + 心流，進入休息時歸零', () => {
    const timeline = tl(['focus_start', 0], ['flow_start', 25], ['break_start', 40], ['focus_start', 45])
    expect(pomodoroClock({ timeline, nowMs: ms(39) }).cycleWork).toBe(39 * 60)
    expect(pomodoroClock({ timeline, nowMs: ms(50) }).cycleWork).toBe(5 * 60)
  })

  it('心流沒有倒數；目前階段經過時間從 flow_start 算起', () => {
    const c = pomodoroClock({ timeline: tl(['focus_start', 0], ['flow_start', 25]), phaseLength: null, nowMs: ms(40) })
    expect(c.timeLeft).toBe(0)
    expect(c.phaseElapsed).toBe(15 * 60)
    expect(c.flowSeconds).toBe(15 * 60)
  })

  it('遇到 end 事件就停止，不再往後算', () => {
    const c = pomodoroClock({ timeline: tl(['focus_start', 0], ['end', 10]), nowMs: ms(100) })
    expect(c.workSeconds).toBe(600)
  })

  it('時間壞掉的事件會被略過，不會讓結果變成 NaN', () => {
    const timeline = [{ type: 'focus_start', time: at(0) }, { type: 'pause_start', time: 'oops' }]
    expect(pomodoroClock({ timeline, nowMs: ms(10) }).workSeconds).toBe(600)
  })

  const samples = {
    '一般': tl(['focus_start', 0], ['break_start', 25], ['focus_start', 30], ['end', 55]),
    '暫停後恢復': tl(['focus_start', 0], ['pause_start', 10], ['pause_end', 15], ['break_start', 25], ['end', 30]),
    '心流': tl(['focus_start', 0], ['flow_start', 25], ['pause_start', 40], ['pause_end', 45], ['break_start', 60], ['end', 70]),
    '暫停中跳到休息（舊紀錄沒有 pause_end）': tl(['focus_start', 0], ['pause_start', 10], ['break_start', 12], ['focus_start', 17], ['end', 42]),
    '任務完成事件': tl(['focus_start', 0], ['task_complete', 3], ['pause_start', 5], ['task_complete', 6], ['pause_end', 8], ['end', 20]),
    '時間到後等待再開始休息': tl(['focus_start', 0], ['await_start', 25, { next: 'break' }], ['break_start', 40], ['await_start', 45, { next: 'focus' }], ['focus_start', 50], ['end', 60]),
    '程式關閉的暫停': [...tl(['focus_start', 0]), { type: 'pause_start', time: at(10), reason: 'app_closed' }, ...tl(['pause_end', 600], ['end', 615])],
  }

  for (const [name, timeline] of Object.entries(samples)) {
    it(`和總結、歷史用的 calculatePomodoroStats 結果完全相同：${name}`, () => {
      const stats = calculatePomodoroStats(timeline)
      const c = pomodoroClock({ timeline, nowMs: lastEventMs(timeline) })
      expect(c.focusSeconds).toBeCloseTo(stats.focusDuration, 6)
      expect(c.flowSeconds).toBeCloseTo(stats.flowDuration, 6)
      expect(c.breakSeconds).toBeCloseTo(stats.breakDuration, 6)
    })
  }

  it('抽卡券和總結用同一個數字：pomodoroWorkSeconds', () => {
    const timeline = tl(['focus_start', 0], ['flow_start', 25], ['break_start', 100], ['end', 105])
    expect(pomodoroWorkSeconds(timeline)).toBe(100 * 60)
    expect(focusTicketsFor(pomodoroWorkSeconds(timeline))).toBe(3)
  })
})

describe('planPhaseEnd：倒數歸零後停下來，等使用者按「開始休息／開始專注」', () => {
  const plan = (status, timeline, phaseLength, nowMinute, cycles = 0, s = settings) => {
    const nowMs = ms(nowMinute)
    const clock = pomodoroClock({ timeline, phaseLength, nowMs })
    return { result: planPhaseEnd({ status, cycles, settings: s, clock, nowMs }), nowMs }
  }

  it('專注時間到：在原定時間點寫一筆 await_start，番茄數 +1，不自動開始休息', () => {
    const timeline = tl(['focus_start', 0])
    const { result } = plan('focus', timeline, 1500, 25 + 0.2 / 60)
    expect(result.next).toBe('break')
    expect(result.cyclesIncrement).toBe(1)
    expect(result.events).toEqual([{ type: 'await_start', time: at(25), next: 'break' }])
  })

  it('休息時間到：等著開始專注，番茄數不變', () => {
    const timeline = tl(['focus_start', 0], ['await_start', 25, { next: 'break' }], ['break_start', 26])
    const { result } = plan('break', timeline, 300, 31, 1)
    expect(result.next).toBe('focus')
    expect(result.cyclesIncrement).toBe(0)
    expect(result.events).toEqual([{ type: 'await_start', time: at(31), next: 'focus' }])
  })

  it('等待的時間不算專注也不算休息；按下「開始休息」那一刻休息才開始', () => {
    const timeline = tl(['focus_start', 0])
    const { result } = plan('focus', timeline, 1500, 25)
    const waiting = insertChronologically(timeline, result.events)
    const during = pomodoroClock({ timeline: waiting, phaseLength: 1500, nowMs: ms(40) })
    expect(during.isAwaiting).toBe(true)
    expect(during.timeLeft).toBe(0)
    expect(during.workSeconds).toBe(1500)
    expect(during.breakSeconds).toBe(0)
    // 等了 15 分鐘才按「開始休息」
    const resumed = [...waiting, ...tl(['break_start', 40])]
    const c = pomodoroClock({ timeline: resumed, phaseLength: 300, nowMs: ms(42) })
    expect(c.isAwaiting).toBe(false)
    expect(c.timeLeft).toBe(180)
    expect(c.breakSeconds).toBe(120)
    expect(c.workSeconds).toBe(1500)
  })

  it('專注中休眠 2 小時才醒：專注只算 25 分鐘，醒來後停在等待，睡著的時間不算任何一種', () => {
    const timeline = tl(['focus_start', 0])
    const { result, nowMs } = plan('focus', timeline, 1500, 145)
    expect(result.events).toEqual([{ type: 'await_start', time: at(25), next: 'break' }])
    const next = insertChronologically(timeline, result.events)
    const c = pomodoroClock({ timeline: next, phaseLength: 1500, nowMs })
    expect(c.workSeconds).toBe(1500)
    expect(c.breakSeconds).toBe(0)
    expect(c.isAwaiting).toBe(true)
  })

  it('休息中休眠一整晚：休息只算設定的 5 分鐘，醒來後等著開始專注', () => {
    const timeline = tl(['focus_start', 0], ['await_start', 25, { next: 'break' }], ['break_start', 25])
    const { result, nowMs } = plan('break', timeline, 300, 600, 1)
    expect(result.events).toEqual([{ type: 'await_start', time: at(30), next: 'focus' }])
    const c = pomodoroClock({ timeline: insertChronologically(timeline, result.events), phaseLength: 300, nowMs })
    expect(c.breakSeconds).toBe(300)
    expect(c.workSeconds).toBe(1500)
  })

  it('等待後改進入心流：本輪工作時長從心流開始重新算（剛完成的番茄不會被算兩次）', () => {
    const timeline = tl(['focus_start', 0], ['await_start', 25, { next: 'break' }], ['flow_start', 27])
    const c = pomodoroClock({ timeline, nowMs: ms(37) })
    expect(c.cycleWork).toBe(600)
    expect(c.workSeconds).toBe(1500 + 600)
  })

  it('心流沒有時間到', () => {
    const { result } = plan('flow', tl(['flow_start', 0]), null, 30)
    expect(result).toBeNull()
  })

  it('awaitingOf：最後一個階段事件是 await_start 才算在等待', () => {
    expect(awaitingOf(tl(['focus_start', 0], ['await_start', 25, { next: 'break' }], ['task_complete', 26])))
      .toEqual({ next: 'break', since: at(25) })
    expect(awaitingOf(tl(['focus_start', 0], ['await_start', 25, { next: 'break' }], ['break_start', 26]))).toBeNull()
    expect(awaitingOf(tl(['focus_start', 0]))).toBeNull()
    expect(awaitingOf(null)).toBeNull()
  })

  it('等待中不會再觸發一次「時間到」', () => {
    const base = { timeLeft: 0, status: 'focus', isPaused: false, showSettlement: false, showSummary: false }
    expect(shouldHandleTimeout(base)).toBe(true)
    expect(shouldHandleTimeout({ ...base, awaiting: { next: 'break' } })).toBe(false)
  })

  it('等待畫面的按鈕：第 4 個番茄後是長休息 20 分鐘，其他是一般休息', () => {
    expect(nextBreakInfo(1, settings)).toEqual({ seconds: 300, isLong: false })
    expect(nextBreakInfo(4, settings)).toEqual({ seconds: 1200, isLong: true })
  })
})

describe('insertChronologically：依時間插入事件', () => {
  it('補記在過去的事件放到正確位置；同時間排在既有事件之後', () => {
    const timeline = tl(['focus_start', 0], ['task_complete', 30])
    const result = insertChronologically(timeline, tl(['break_start', 25], ['pause_start', 30]))
    expect(result.map(e => e.type)).toEqual(['focus_start', 'break_start', 'task_complete', 'pause_start'])
  })
})

describe('loadPomodoroState：開啟程式時讀回番茄鐘狀態', () => {
  const running = (extra = {}) => ({
    pomodoroStatus: 'focus',
    pomodoroSettings: JSON.stringify(settings),
    pomodoroIsPaused: 'false',
    pomodoroTimeline: JSON.stringify(tl(['focus_start', 0])),
    pomodoroSessionStartTime: at(0),
    pomodoroPhaseLength: '1500',
    ...extra,
  })

  it('沒有存過任何東西：待機、預設設定', () => {
    const s = loadPomodoroState(fakeStorage({}), ms(0))
    expect(s.status).toBe('idle')
    expect(s.settings).toEqual({ focus: 25, break: 5, longBreakEnabled: true, longBreakMinutes: 20, longBreakEvery: 4 })
    expect(s.timeline).toEqual([])
    expect(s.phaseLength).toBeNull()
  })

  it('專注 10 分鐘時關閉程式，1 小時後再開：關閉期間視同暫停，停在剩 15 分鐘', () => {
    const s = loadPomodoroState(fakeStorage(running({ lastPomodoroTick: ms(10) })), ms(70))
    expect(s.isPaused).toBe(true)
    expect(s.timeline.at(-1)).toEqual({ type: 'pause_start', time: at(10), reason: 'app_closed' })
    expect(s.closedGap).toEqual({ fromMs: ms(10), toMs: ms(70) })
    const c = pomodoroClock({ timeline: s.timeline, phaseLength: s.phaseLength, nowMs: ms(70) })
    expect(c.timeLeft).toBe(900)
    expect(c.workSeconds).toBe(600)
    expect(isPausedByAppClose(s.timeline, s.isPaused)).toBe(true)
  })

  it('重新整理（幾秒內就重開）：不暫停，照常計時', () => {
    const s = loadPomodoroState(fakeStorage(running({ lastPomodoroTick: ms(10) })), ms(10) + RELOAD_GRACE_MS - 1000)
    expect(s.isPaused).toBe(false)
    expect(s.closedGap).toBeNull()
    expect(s.timeline).toHaveLength(1)
  })

  it('本來就暫停中：不再多補暫停', () => {
    const s = loadPomodoroState(fakeStorage(running({
      pomodoroIsPaused: 'true',
      pomodoroTimeline: JSON.stringify(tl(['focus_start', 0], ['pause_start', 5])),
      lastPomodoroTick: ms(5),
    })), ms(500))
    expect(s.timeline).toHaveLength(2)
    expect(isPausedByAppClose(s.timeline, s.isPaused)).toBe(false)
  })

  it('總結或結算畫面開著時關閉：不補暫停', () => {
    const s = loadPomodoroState(fakeStorage(running({ pomodoroShowSummary: 'true', lastPomodoroTick: ms(10) })), ms(500))
    expect(s.timeline).toHaveLength(1)
    expect(s.closedGap).toBeNull()
  })

  it('舊版存的狀態（沒有 pomodoroPhaseLength）：用「剩幾秒」換算，剩餘時間和關閉時一樣', () => {
    const s = loadPomodoroState(fakeStorage({
      pomodoroStatus: 'focus',
      pomodoroSettings: JSON.stringify(settings),
      pomodoroIsPaused: 'false',
      pomodoroTimeline: JSON.stringify(tl(['focus_start', 0])),
      pomodoroTimeLeft: '600',
      pomodoroTotalAccumulated: '900',
      lastPomodoroTick: ms(15),
    }), ms(100))
    expect(s.phaseLength).toBe(1500)
    expect(s.isPaused).toBe(true)
    const c = pomodoroClock({ timeline: s.timeline, phaseLength: s.phaseLength, nowMs: ms(100) })
    expect(c.timeLeft).toBe(600)
  })

  it('舊版在休眠中少數了秒數：剩餘時間仍和關閉時看到的一樣，總專注改用時間軸（和總結一致）', () => {
    const s = loadPomodoroState(fakeStorage({
      pomodoroStatus: 'focus',
      pomodoroTimeline: JSON.stringify(tl(['focus_start', 0])),
      pomodoroTimeLeft: '900',
      lastPomodoroTick: ms(20),
    }), ms(20) + 2000)
    expect(s.phaseLength).toBe(900 + 1200)
    const c = pomodoroClock({ timeline: s.timeline, phaseLength: s.phaseLength, nowMs: ms(20) })
    expect(c.timeLeft).toBe(900)
    expect(c.workSeconds).toBe(1200)
  })

  it('舊版心流：沒有倒數長度', () => {
    const s = loadPomodoroState(fakeStorage({
      pomodoroStatus: 'flow',
      pomodoroTimeline: JSON.stringify(tl(['focus_start', 0], ['flow_start', 25])),
      lastPomodoroTick: ms(30),
    }), ms(30) + 1000)
    expect(s.phaseLength).toBeNull()
    expect(s.status).toBe('flow')
  })

  it('壞掉的值不會讓程式當掉', () => {
    const s = loadPomodoroState(fakeStorage({
      pomodoroStatus: 'break',
      pomodoroSettings: '{oops',
      pomodoroTimeline: 'not json',
      pomodoroSelectedTaskIds: '{"a":1}',
      pomodoroSessionStats: '[[',
      pomodoroCycles: 'abc',
      lastPomodoroTick: 'xyz',
    }), ms(0))
    expect(s.status).toBe('break')
    expect(s.settings).toEqual({ focus: 25, break: 5, longBreakEnabled: true, longBreakMinutes: 20, longBreakEvery: 4 })
    expect(s.selectedTaskIds).toEqual([])
    expect(s.sessionStats).toBeNull()
    expect(s.cycles).toBe(0)
    expect(s.timeline.some(e => e.type === 'break_start')).toBe(true)
    expect(s.phaseLength).toBe(300)
    expect(Number.isFinite(pomodoroClock({ timeline: s.timeline, phaseLength: s.phaseLength, nowMs: ms(1) }).timeLeft)).toBe(true)
  })

  it('時間到、等待中關閉程式再開：照樣停在等待，不補暫停，關閉的時間不算', () => {
    const s = loadPomodoroState(fakeStorage(running({
      pomodoroTimeline: JSON.stringify(tl(['focus_start', 0], ['await_start', 25, { next: 'break' }])),
      pomodoroCycles: '1',
      lastPomodoroTick: ms(25),
      pomodoroAlarmMuted: 'true',
    })), ms(300))
    expect(s.isPaused).toBe(false)
    expect(s.closedGap).toBeNull()
    expect(s.timeline).toHaveLength(2)
    expect(s.cycles).toBe(1)
    expect(s.alarmMuted).toBe(true)
    expect(awaitingOf(s.timeline)).toEqual({ next: 'break', since: at(25) })
    const c = pomodoroClock({ timeline: s.timeline, phaseLength: s.phaseLength, nowMs: ms(300) })
    expect(c.workSeconds).toBe(1500)
    expect(c.breakSeconds).toBe(0)
  })

  it('不在等待時，舊的「已關掉鈴聲」不會帶到下一次', () => {
    const s = loadPomodoroState(fakeStorage(running({ pomodoroAlarmMuted: 'true', lastPomodoroTick: ms(1) })), ms(1) + 1000)
    expect(s.alarmMuted).toBe(false)
  })

  it('舊的設定（休息 15 分鐘、沒有長休息欄位）：讀進來時換算成「長休息關閉」，之後以存下的設定為準', () => {
    const s = loadPomodoroState(fakeStorage({ pomodoroSettings: JSON.stringify({ focus: 30, break: 15 }) }), ms(0))
    expect(s.settings).toEqual({ focus: 30, break: 15, longBreakEnabled: false, longBreakMinutes: 20, longBreakEvery: 4 })
    const later = loadPomodoroState(fakeStorage({ pomodoroSettings: JSON.stringify({ focus: 30, break: 5, longBreakEnabled: false, longBreakMinutes: 20, longBreakEvery: 4 }) }), ms(0))
    expect(later.settings.longBreakEnabled).toBe(false)
  })

  it('看不懂的狀態當成待機', () => {
    expect(loadPomodoroState(fakeStorage({ pomodoroStatus: 'weird' }), ms(0)).status).toBe('idle')
  })

  it('讀 localStorage 本身出錯（例如被瀏覽器封鎖）也不會當掉', () => {
    const throwing = { getItem: () => { throw new Error('blocked') } }
    expect(loadPomodoroState(throwing, ms(0)).status).toBe('idle')
  })
})

describe('loadPomodoroState：存檔壞掉時不會把開始時間算成 1970 年', () => {
  it('進行中但沒有開始事件、也沒有開始時間：從現在開始算，不會一開就時間到', () => {
    const s = loadPomodoroState(fakeStorage({
      pomodoroStatus: 'focus',
      pomodoroSettings: JSON.stringify(settings),
      pomodoroIsPaused: 'false',
      pomodoroTimeline: JSON.stringify([{ type: 'pause_start', time: null }]),
      pomodoroSessionStartTime: '',
      pomodoroPhaseLength: '1500',
    }), ms(0))
    expect(s.timeline.every((e) => e.time != null)).toBe(true)
    const start = s.timeline.find((e) => e.type === 'focus_start')
    expect(new Date(start.time).getTime()).toBe(ms(0))
    const c = pomodoroClock({ timeline: s.timeline, phaseLength: s.phaseLength, nowMs: ms(0) })
    expect(c.timeLeft).toBe(1500)
  })
})
