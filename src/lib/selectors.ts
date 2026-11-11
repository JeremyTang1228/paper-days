import { dayKeyFromTimestamp, monthKey } from './dates'
import type { DashboardSnapshot, ISODate, Task } from './types'

export const isDone = (t: Task): boolean => t.completedAt !== null
export const doneDate = (t: Task): ISODate | null =>
  t.completedAt ? dayKeyFromTimestamp(t.completedAt) : null

export const taskById = (snap: DashboardSnapshot, id: string | undefined): Task | undefined =>
  id ? snap.tasks.find((t) => t.id === id) : undefined

/** 未完成、未搁置、未取消，且当前计划日期早于今天 → 自动结转（不生成副本） */
export const carryoverTasks = (snap: DashboardSnapshot, today: ISODate): Task[] =>
  snap.tasks.filter(
    (t) => t.status === 'open' && !isDone(t) && t.currentPlannedDate < today,
  )

export const dayTasks = (snap: DashboardSnapshot, d: ISODate): Task[] =>
  snap.tasks.filter(
    (t) => t.status === 'open' && (t.currentPlannedDate === d || doneDate(t) === d),
  )

/** 曾计划过的旧日期（来自 TaskPlanHistory.previousDate） */
export const previousDatesOf = (snap: DashboardSnapshot, taskId: string): Set<ISODate> =>
  new Set(
    snap.planHistory.filter((h) => h.taskId === taskId).map((h) => h.previousDate),
  )

/** 当日计划（历史事实口径：取消的任务仍保留曾计划过的事实，不抹除） */
export const planTasks = (snap: DashboardSnapshot, d: ISODate): Task[] =>
  snap.tasks.filter(
    (t) => t.currentPlannedDate === d || previousDatesOf(snap, t.id).has(d),
  )

/** 当日计划、且截至当日已完成 */
export const planDone = (snap: DashboardSnapshot, d: ISODate): Task[] =>
  planTasks(snap, d).filter((t) => {
    const dd = doneDate(t)
    return dd !== null && dd <= d
  })

/** 当天出现在计划/历史计划/完成记录中的任务（含已取消，历史事实不抹除） */
export const plannedTasks = (snap: DashboardSnapshot, d: ISODate): Task[] =>
  snap.tasks.filter(
    (t) =>
      t.currentPlannedDate === d ||
      previousDatesOf(snap, t.id).has(d) ||
      doneDate(t) === d,
  )

/** 当天实际完成（按真实完成时刻所在的日历日） */
export const doneOn = (snap: DashboardSnapshot, d: ISODate): Task[] =>
  snap.tasks.filter((t) => doneDate(t) === d)

export const activitiesOn = (snap: DashboardSnapshot, d: ISODate) =>
  snap.activities
    .filter((a) => a.date === d)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))

export const hasNote = (snap: DashboardSnapshot, d: ISODate): boolean =>
  Boolean((snap.journals[d] || '').trim())

export const hasRecord = (snap: DashboardSnapshot, d: ISODate): boolean =>
  plannedTasks(snap, d).length > 0 ||
  snap.activities.some((a) => a.date === d) ||
  hasNote(snap, d)

export type FocusStatus = 'done' | 'late' | 'open' | 'now' | 'none'

/** 历史首要任务关系保留：先取 focus 关系，再看任务当前真实状态 */
export const focusStatus = (
  snap: DashboardSnapshot,
  d: ISODate,
  today: ISODate,
): FocusStatus => {
  const t = taskById(snap, snap.focus[d])
  if (!t) return 'none'
  const dd = doneDate(t)
  if (dd !== null && dd <= d) return 'done'
  if (dd !== null) return 'late'
  return d >= today ? 'now' : 'open'
}

const STATUS_LABEL: Record<FocusStatus, string> = {
  done: '已完成',
  late: '后来完成',
  open: '未完成',
  now: '进行中',
  none: '未设置',
}

export const focusLabel = (
  snap: DashboardSnapshot,
  d: ISODate,
  today: ISODate,
): string => {
  const s = focusStatus(snap, d, today)
  if (s === 'now') return d > today ? '计划中' : '进行中'
  return STATUS_LABEL[s]
}

/** 回顾页统计：三种口径严格分开，不混合计算完成率 */
export const reviewStats = (
  snap: DashboardSnapshot,
  days: ISODate[],
  today: ISODate,
) => {
  const focusDays = days.filter((d) => Boolean(taskById(snap, snap.focus[d])))
  const denominator = focusDays.filter((d) => d <= today)
  // 分子只认「真实完成日 === 该日」：提前完成、后来完成都不冒充当天完成。
  const numerator = denominator.filter((d) => {
    const t = taskById(snap, snap.focus[d])
    return Boolean(t) && doneDate(t as Task) === d
  })

  const past = days.filter((d) => d <= today)
  const cutoff = past[past.length - 1]
  const pastSet = new Set(past)
  const plannedSet = cutoff
    ? snap.tasks.filter(
        (t) =>
          pastSet.has(t.currentPlannedDate) ||
          snap.planHistory.some((h) => h.taskId === t.id && pastSet.has(h.previousDate)),
      )
    : []
  const plannedCompleted = plannedSet.filter((t) => {
    const dd = doneDate(t)
    return dd !== null && cutoff !== undefined && dd <= cutoff
  })
  const actuallyCompleted = new Set(
    days.flatMap((d) => doneOn(snap, d).map((t) => t.id)),
  ).size

  return {
    focusDone: numerator.length,
    focusSet: denominator.length,
    plannedCompleted: plannedCompleted.length,
    plannedTotal: plannedSet.length,
    actuallyCompleted,
    cutoff,
    journalDays: days.filter((d) => hasNote(snap, d)).length,
    activityCount: snap.activities.filter((a) => days.includes(a.date)).length,
    recordDays: days.filter((d) => hasRecord(snap, d)).length,
  }
}

export const uniqueTaskCount = (tasks: Task[]): number => new Set(tasks.map((t) => t.id)).size

export const monthOf = monthKey
