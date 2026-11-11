import type { Table } from 'dexie'
import { db, SCHEMA_VERSION } from './db'
import {
  emptySnapshot,
  type ActivityRecord,
  type DashboardSnapshot,
  type GoalStatus,
  type ISODate,
  type ISODateTime,
  type Task,
  type TaskStatus,
} from './types'

const uid = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
const now = (): ISODateTime => new Date().toISOString()

async function mustUpdate(
  table: Table<any, string>, // eslint-disable-line @typescript-eslint/no-explicit-any
  key: string,
  changes: Record<string, unknown>,
): Promise<void> {
  const affected = await table.update(key, changes)
  if (affected === 0) throw new Error('写入失败：记录不存在或数据库不可写')
}

/** 统一数据访问层：UI 只通过这里读写，业务数据不放在组件里 */
export async function loadSnapshot(): Promise<DashboardSnapshot> {
  const [
    tasks,
    planHistory,
    focusRows,
    activities,
    journalRows,
    weeklyPlanRows,
    weeklyRefRows,
    goals,
    monthlyRefRows,
    prefs,
  ] = await Promise.all([
    db.tasks.toArray(),
    db.planHistory.toArray(),
    db.dailyFocus.toArray(),
    db.activities.toArray(),
    db.journals.toArray(),
    db.weeklyPlans.toArray(),
    db.weeklyReflections.toArray(),
    db.monthlyGoals.toArray(),
    db.monthlyReflections.toArray(),
    db.preferences.toArray(),
  ])

  const snap = emptySnapshot()
  snap.tasks = tasks
  snap.planHistory = planHistory
  snap.focus = Object.fromEntries(focusRows.map((r) => [r.date, r.taskId]))
  snap.activities = activities
  snap.journals = Object.fromEntries(journalRows.map((r) => [r.date, r.content]))
  snap.weeklyPlans = Object.fromEntries(weeklyPlanRows.map((r) => [r.weekStart, r.items]))
  snap.weeklyReflections = Object.fromEntries(weeklyRefRows.map((r) => [r.weekStart, r.content]))
  snap.monthlyGoals = goals
  snap.monthlyReflections = Object.fromEntries(monthlyRefRows.map((r) => [r.month, r.content]))
  for (const p of prefs) {
    if (p.key === 'quoteHidden') snap.quoteHidden = p.value === '1'
    else if (p.key.startsWith('quote:')) snap.quoteOffsets[p.key.slice(6)] = Number(p.value) || 0
  }
  return snap
}

export interface ExportBundle {
  schemaVersion: number
  exportedAt: ISODateTime
  data: DashboardSnapshot
}

export const repo = {
  /** 任务 */
  async addTask(title: string, date: ISODate): Promise<string> {
    const t = now()
    const task: Task = {
      id: uid(),
      title,
      originalPlannedDate: date,
      currentPlannedDate: date,
      completedAt: null,
      status: 'open',
      nextStep: '',
      createdAt: t,
      updatedAt: t,
    }
    await db.tasks.add(task)
    return task.id
  },

  async renameTask(id: string, title: string): Promise<void> {
    await mustUpdate(db.tasks, id, { title, updatedAt: now() })
  },

  /** 完成时间取真实操作时刻；撤销完成则清空 */
  async toggleTask(id: string): Promise<void> {
    const t = await db.tasks.get(id)
    if (!t) throw new Error('任务不存在')
    await mustUpdate(db.tasks, id, {
      completedAt: t.completedAt ? null : now(),
      updatedAt: now(),
    })
  },

  /** 改期：保留首次计划日，并写入一条计划变更事实 */
  async rescheduleTask(id: string, newDate: ISODate): Promise<void> {
    const t = await db.tasks.get(id)
    if (!t) throw new Error('任务不存在')
    if (t.currentPlannedDate === newDate) return
    await db.transaction('rw', db.tasks, db.planHistory, async () => {
      await db.planHistory.add({
        id: uid(),
        taskId: id,
        previousDate: t.currentPlannedDate,
        newDate,
        changedAt: now(),
      })
      await mustUpdate(db.tasks, id, { currentPlannedDate: newDate, updatedAt: now() })
    })
  },

  async setTaskStatus(id: string, status: TaskStatus): Promise<void> {
    await mustUpdate(db.tasks, id, { status, updatedAt: now() })
  },

  async setNextStep(id: string, step: string): Promise<void> {
    await mustUpdate(db.tasks, id, { nextStep: step, updatedAt: now() })
  },

  /** 每日首要：只写当天关系，任务后续改期/搁置/取消都不清理历史 */
  async setFocus(date: ISODate, taskId: string): Promise<void> {
    await db.dailyFocus.put({ date, taskId })
  },
  async clearFocus(date: ISODate): Promise<void> {
    await db.dailyFocus.delete(date)
  },

  /** 实际活动 */
  async addActivity(date: ISODate, content: string, time?: string): Promise<void> {
    const t = now()
    const record: ActivityRecord = { id: uid(), date, time, content, createdAt: t, updatedAt: t }
    await db.activities.add(record)
  },
  async updateActivity(id: string, content: string): Promise<void> {
    await mustUpdate(db.activities, id, { content, updatedAt: now() })
  },
  async deleteActivity(id: string): Promise<void> {
    await db.activities.delete(id)
  },

  /** 每日感想 */
  async setJournal(date: ISODate, content: string): Promise<void> {
    await db.journals.put({ date, content, updatedAt: now() })
  },

  /** 每周重点 / 总结 */
  async setWeeklyPlan(weekStart: ISODate, items: [string, string, string]): Promise<void> {
    await db.weeklyPlans.put({ weekStart, items, updatedAt: now() })
  },
  async setWeeklyReflection(weekStart: ISODate, content: string): Promise<void> {
    await db.weeklyReflections.put({ weekStart, content, updatedAt: now() })
  },

  /** 月度目标 / 总结 */
  async addMonthlyGoal(month: string, title: string): Promise<void> {
    const t = now()
    await db.monthlyGoals.add({
      id: uid(),
      month,
      title,
      nextStep: '',
      status: 'open',
      createdAt: t,
      updatedAt: t,
    })
  },
  async updateGoal(id: string, changes: { title?: string; nextStep?: string }): Promise<void> {
    await mustUpdate(db.monthlyGoals, id, { ...changes, updatedAt: now() })
  },
  async setGoalStatus(id: string, status: GoalStatus): Promise<void> {
    await mustUpdate(db.monthlyGoals, id, { status, updatedAt: now() })
  },

  async setMonthlyReflection(month: string, content: string): Promise<void> {
    await db.monthlyReflections.put({ month, content, updatedAt: now() })
  },

  /** 本地偏好 */
  async setPreference(key: string, value: string): Promise<void> {
    await db.preferences.put({ key, value })
  },

  /** P4：导出与恢复（原子事务，校验失败不覆盖现有数据） */
  async exportAll(): Promise<ExportBundle> {
    return { schemaVersion: SCHEMA_VERSION, exportedAt: now(), data: await loadSnapshot() }
  },

  async restoreAll(bundle: unknown): Promise<void> {
    const parsed = validateBundle(bundle)
    const d = parsed.data
    await db.transaction(
      'rw',
      [
        db.tasks,
        db.planHistory,
        db.dailyFocus,
        db.activities,
        db.journals,
        db.weeklyPlans,
        db.weeklyReflections,
        db.monthlyGoals,
        db.monthlyReflections,
        db.preferences,
      ],
      async () => {
        await Promise.all([
          db.tasks.clear(),
          db.planHistory.clear(),
          db.dailyFocus.clear(),
          db.activities.clear(),
          db.journals.clear(),
          db.weeklyPlans.clear(),
          db.weeklyReflections.clear(),
          db.monthlyGoals.clear(),
          db.monthlyReflections.clear(),
          db.preferences.clear(),
        ])
        await db.tasks.bulkAdd(d.tasks)
        await db.planHistory.bulkAdd(d.planHistory)
        await db.dailyFocus.bulkAdd(
          Object.entries(d.focus).map(([date, taskId]) => ({ date, taskId })),
        )
        await db.activities.bulkAdd(d.activities)
        await db.journals.bulkAdd(
          Object.entries(d.journals).map(([date, content]) => ({ date, content, updatedAt: now() })),
        )
        await db.weeklyPlans.bulkAdd(
          Object.entries(d.weeklyPlans).map(([weekStart, items]) => ({
            weekStart,
            items,
            updatedAt: now(),
          })),
        )
        await db.weeklyReflections.bulkAdd(
          Object.entries(d.weeklyReflections).map(([weekStart, content]) => ({
            weekStart,
            content,
            updatedAt: now(),
          })),
        )
        await db.monthlyGoals.bulkAdd(d.monthlyGoals)
        await db.monthlyReflections.bulkAdd(
          Object.entries(d.monthlyReflections).map(([month, content]) => ({
            month,
            content,
            updatedAt: now(),
          })),
        )
        await db.preferences.bulkAdd([
          { key: 'quoteHidden', value: d.quoteHidden ? '1' : '0' },
          ...Object.entries(d.quoteOffsets).map(([date, n]) => ({
            key: `quote:${date}`,
            value: String(n),
          })),
        ])
      },
    )
  },
}

export function validateBundle(bundle: unknown): ExportBundle {
  if (!bundle || typeof bundle !== 'object') throw new Error('备份文件不是有效的 JSON 对象')
  const b = bundle as Partial<ExportBundle>
  if (b.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`备份版本不兼容（需要 ${SCHEMA_VERSION}，实际 ${String(b.schemaVersion)}）`)
  }
  if (typeof b.exportedAt !== 'string' || Number.isNaN(Date.parse(b.exportedAt))) {
    throw new Error('备份缺少有效的导出时间')
  }
  const d = b.data as DashboardSnapshot | undefined
  if (!d || typeof d !== 'object') throw new Error('备份缺少 data 字段')
  const arrays: (keyof DashboardSnapshot)[] = [
    'tasks',
    'planHistory',
    'activities',
    'monthlyGoals',
  ]
  for (const k of arrays) if (!Array.isArray(d[k])) throw new Error(`备份字段 ${k} 格式错误`)
  const objects: (keyof DashboardSnapshot)[] = [
    'focus',
    'journals',
    'weeklyPlans',
    'weeklyReflections',
    'monthlyReflections',
    'quoteOffsets',
  ]
  for (const k of objects) {
    if (!d[k] || typeof d[k] !== 'object' || Array.isArray(d[k])) {
      throw new Error(`备份字段 ${k} 格式错误`)
    }
  }
  const isStr = (v: unknown): v is string => typeof v === 'string'
  const isDate = (v: unknown): boolean => isStr(v) && /^\d{4}-\d{2}-\d{2}$/.test(v)
  const TASK_STATUS = ['open', 'parked', 'cancelled']
  const GOAL_STATUS = ['open', 'done', 'parked', 'cancelled']

  for (const t of d.tasks) {
    if (
      !t ||
      !isStr(t.id) ||
      !isStr(t.title) ||
      !isDate(t.originalPlannedDate) ||
      !isDate(t.currentPlannedDate) ||
      !TASK_STATUS.includes(t.status) ||
      (t.completedAt !== null &&
        (!isStr(t.completedAt) || Number.isNaN(Date.parse(t.completedAt))))
    ) {
      throw new Error('备份中存在格式错误的任务记录')
    }
  }
  for (const h of d.planHistory) {
    if (
      !h ||
      !isStr(h.id) ||
      !isStr(h.taskId) ||
      !isDate(h.previousDate) ||
      !isDate(h.newDate)
    ) {
      throw new Error('备份中存在格式错误的计划变更记录')
    }
  }
  for (const a of d.activities) {
    if (!a || !isStr(a.id) || !isDate(a.date) || !isStr(a.content)) {
      throw new Error('备份中存在格式错误的活动记录')
    }
  }
  for (const g of d.monthlyGoals) {
    if (
      !g ||
      !isStr(g.id) ||
      !isStr(g.month) ||
      !/^\d{4}-\d{2}$/.test(g.month) ||
      !isStr(g.title) ||
      !GOAL_STATUS.includes(g.status)
    ) {
      throw new Error('备份中存在格式错误的月度目标')
    }
  }
  const stringMaps: (keyof DashboardSnapshot)[] = [
    'focus',
    'journals',
    'weeklyReflections',
    'monthlyReflections',
  ]
  for (const k of stringMaps) {
    for (const [key, val] of Object.entries(d[k] as Record<string, unknown>)) {
      if (!isStr(val)) throw new Error(`备份字段 ${k} 中 ${key} 的值格式错误`)
    }
  }
  for (const [weekStart, items] of Object.entries(
    d.weeklyPlans as Record<string, unknown>,
  )) {
    if (!Array.isArray(items) || items.length !== 3 || !items.every(isStr)) {
      throw new Error(`备份字段 weeklyPlans 中 ${weekStart} 的格式错误`)
    }
  }
  if (typeof d.quoteHidden !== 'boolean') throw new Error('备份字段 quoteHidden 格式错误')
  for (const [key, n] of Object.entries(d.quoteOffsets as Record<string, unknown>)) {
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      throw new Error(`备份字段 quoteOffsets 中 ${key} 的格式错误`)
    }
  }
  return b as ExportBundle
}
