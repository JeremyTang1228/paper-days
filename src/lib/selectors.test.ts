import { describe, expect, it } from 'vitest'
import {
  carryoverTasks,
  doneDate,
  focusStatus,
  planDone,
  planTasks,
  plannedTasks,
  previousDatesOf,
  reviewStats,
  taskById,
} from './selectors'
import { emptySnapshot, type DashboardSnapshot, type Task } from './types'

const T = '2026-11-10' // 今天（周二）
const Y = '2026-11-09'
const OLD = '2026-11-03' // 连续多天未打开
const FUT = '2026-11-20'
const STAMP_T = '2026-11-10T09:30:00.000Z'
const STAMP_Y = '2026-11-09T09:30:00.000Z'

function task(id: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    title: `任务 ${id}`,
    originalPlannedDate: Y,
    currentPlannedDate: Y,
    completedAt: null,
    status: 'open',
    nextStep: '',
    createdAt: STAMP_Y,
    updatedAt: STAMP_Y,
    ...patch,
  }
}

function withTasks(tasks: Task[], patch: Partial<DashboardSnapshot> = {}): DashboardSnapshot {
  return { ...emptySnapshot(), tasks, ...patch }
}

const focus = (d: string, taskId: string) => ({ focus: { [d]: taskId } })

describe('P2 · 自动结转', () => {
  it('1. 昨天未完成的任务今天自动结转，且不生成副本', () => {
    const snap = withTasks([task('t1')])
    const car = carryoverTasks(snap, T)
    expect(car.map((t) => t.id)).toEqual(['t1'])
    expect(snap.tasks).toHaveLength(1)
    expect(snap.tasks[0].id).toBe('t1')
  })

  it('2. 连续多天未打开，仍结转且首次计划日期保留', () => {
    const snap = withTasks([task('t1', { originalPlannedDate: OLD, currentPlannedDate: OLD })])
    expect(carryoverTasks(snap, T).map((t) => t.id)).toEqual(['t1'])
    expect(snap.tasks[0].originalPlannedDate).toBe(OLD)
  })

  it('3. 主动改期到未来不提前结转', () => {
    const snap = withTasks([task('t1', { currentPlannedDate: FUT })])
    expect(carryoverTasks(snap, T)).toEqual([])
  })

  it('4. 已完成任务不再结转', () => {
    const snap = withTasks([task('t1', { completedAt: STAMP_Y })])
    expect(carryoverTasks(snap, T)).toEqual([])
  })

  it('5. 搁置与取消的任务不结转', () => {
    const snap = withTasks([
      task('parked', { status: 'parked' }),
      task('cancelled', { status: 'cancelled' }),
    ])
    expect(carryoverTasks(snap, T)).toEqual([])
  })

  it('6/7. 多次改期只留一个 ID、首次计划日期不变，历史安排全部保留', () => {
    const snap = withTasks(
      [task('t1', { originalPlannedDate: OLD, currentPlannedDate: FUT })],
      {
        planHistory: [
          { id: 'h1', taskId: 't1', previousDate: OLD, newDate: Y, changedAt: STAMP_Y },
          { id: 'h2', taskId: 't1', previousDate: Y, newDate: T, changedAt: STAMP_T },
          { id: 'h3', taskId: 't1', previousDate: T, newDate: FUT, changedAt: STAMP_T },
        ],
      },
    )
    expect(snap.tasks).toHaveLength(1)
    expect(snap.tasks[0].originalPlannedDate).toBe(OLD)
    // previousDatesOf 返回 Set，比较前排序；期望值也必须是同一排序顺序
    expect([...previousDatesOf(snap, 't1')].sort()).toEqual([OLD, T, Y].sort())
    expect(planTasks(snap, OLD).map((t) => t.id)).toEqual(['t1'])
    expect(planTasks(snap, Y).map((t) => t.id)).toEqual(['t1'])
    expect(carryoverTasks(snap, T)).toEqual([])
  })

  it('8. 历史首要任务关系不因改期、搁置、取消而丢失', () => {
    const cancelled = task('t1', { status: 'cancelled', currentPlannedDate: FUT })
    const snap = withTasks([cancelled], focus(Y, 't1'))
    expect(taskById(snap, snap.focus[Y])?.id).toBe('t1')
    expect(snap.focus[Y]).toBe('t1')
    expect(focusStatus(snap, Y, T)).toBe('open')
  })

  it('9. 在历史日期查看：今天完成不会冒充历史当天完成', () => {
    const snap = withTasks([task('t1', { completedAt: STAMP_T })], focus(Y, 't1'))
    expect(doneDate(snap.tasks[0])).toBe(T)
    expect(focusStatus(snap, Y, T)).toBe('late')
    expect(planTasks(snap, Y).map((t) => t.id)).toEqual(['t1'])
    expect(planDone(snap, Y)).toEqual([])
  })
})

describe('P3 · 回顾统计口径', () => {
  const days = ['2026-11-09', T, '2026-11-11']

  it('今天已设置但未完成的首要任务计入分母，不计入分子', () => {
    const snap = withTasks(
      [task('t1', { currentPlannedDate: T, originalPlannedDate: T })],
      focus(T, 't1'),
    )
    const s = reviewStats(snap, days, T)
    expect(s.focusSet).toBe(1)
    expect(s.focusDone).toBe(0)
  })

  it('未来日期的首要任务不进入已发生的完成统计', () => {
    const snap = withTasks(
      [task('t1', { currentPlannedDate: '2026-11-11' })],
      focus('2026-11-11', 't1'),
    )
    const s = reviewStats(snap, days, T)
    expect(s.focusSet).toBe(0)
    expect(s.focusDone).toBe(0)
  })

  it('后来完成不冒充当天完成；当天完成才算分子', () => {
    const late = withTasks(
      [task('late', { completedAt: STAMP_T })],
      focus(Y, 'late'),
    )
    expect(reviewStats(late, days, T).focusDone).toBe(0)

    const onTime = withTasks(
      [task('ok', { currentPlannedDate: T, completedAt: STAMP_T })],
      focus(T, 'ok'),
    )
    expect(reviewStats(onTime, days, T).focusDone).toBe(1)
  })

  it('更早完成也不冒充「当天完成」（按真实完成日归属）', () => {
    const early = withTasks(
      [task('early', { completedAt: STAMP_Y })],
      focus(T, 'early'),
    )
    expect(reviewStats(early, days, T).focusDone).toBe(0)
  })

  it('计划任务数与实际完成数分别计算，结转任务不重复计数', () => {
    const snap = withTasks(
      [task('carry', { originalPlannedDate: OLD, currentPlannedDate: Y, completedAt: STAMP_T })],
      {
        planHistory: [
          { id: 'h1', taskId: 'carry', previousDate: OLD, newDate: Y, changedAt: STAMP_Y },
          { id: 'h2', taskId: 'carry', previousDate: Y, newDate: T, changedAt: STAMP_T },
        ],
      },
    )
    const s = reviewStats(snap, days, T)
    expect(s.plannedTotal).toBe(1) // 一个唯一 ID，不因多条历史重复
    expect(s.actuallyCompleted).toBe(1)
    expect(s.plannedCompleted).toBe(1)
  })

  it('取消任务仍保留在历史计划事实中（不抹除）', () => {
    const snap = withTasks([task('t1', { status: 'cancelled' })])
    expect(plannedTasks(snap, Y).map((t) => t.id)).toEqual(['t1'])
  })

  it('感想与活动按原文日期统计', () => {
    const snap = withTasks([], {
      journals: { [Y]: '昨天的感想', [T]: '今天的感想' },
      activities: [
        { id: 'a1', date: Y, content: '活动', createdAt: STAMP_Y, updatedAt: STAMP_Y },
      ],
    })
    const s = reviewStats(snap, days, T)
    expect(s.journalDays).toBe(2)
    expect(s.activityCount).toBe(1)
    expect(s.recordDays).toBeGreaterThanOrEqual(2)
  })
})
