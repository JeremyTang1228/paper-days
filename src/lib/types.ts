/** 本地日期 YYYY-MM-DD（一律按浏览器本地时区解释） */
export type ISODate = string
/** 真实操作时刻 ISO 8601 */
export type ISODateTime = string

export type TaskStatus = 'open' | 'parked' | 'cancelled'
export type GoalStatus = 'open' | 'done' | 'parked' | 'cancelled'

export interface Task {
  id: string
  title: string
  originalPlannedDate: ISODate
  currentPlannedDate: ISODate
  completedAt: ISODateTime | null
  status: TaskStatus
  nextStep: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

/** 只记录会影响历史回顾的计划变化，不做通用审计日志 */
export interface TaskPlanHistory {
  id: string
  taskId: string
  previousDate: ISODate
  newDate: ISODate
  changedAt: ISODateTime
}

/** 同一天最多一件首要任务；历史关系不随任务状态变化而清除 */
export interface DailyFocus {
  date: ISODate
  taskId: string
}

export interface ActivityRecord {
  id: string
  date: ISODate
  time?: string
  content: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface DailyJournal {
  date: ISODate
  content: string
  updatedAt: ISODateTime
}

export interface WeeklyPlan {
  weekStart: ISODate
  items: [string, string, string]
  updatedAt: ISODateTime
}

export interface WeeklyReflection {
  weekStart: ISODate
  content: string
  updatedAt: ISODateTime
}

export interface MonthlyGoal {
  id: string
  month: string
  title: string
  nextStep: string
  status: GoalStatus
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface MonthlyReflection {
  month: string
  content: string
  updatedAt: ISODateTime
}

export interface Preference {
  key: string
  value: string
}

/** UI 通过统一数据访问层拿到的一份只读快照 */
export interface DashboardSnapshot {
  tasks: Task[]
  planHistory: TaskPlanHistory[]
  focus: Record<ISODate, string>
  activities: ActivityRecord[]
  journals: Record<ISODate, string>
  weeklyPlans: Record<string, [string, string, string]>
  weeklyReflections: Record<string, string>
  monthlyGoals: MonthlyGoal[]
  monthlyReflections: Record<string, string>
  quoteOffsets: Record<ISODate, number>
  quoteHidden: boolean
}

export const emptySnapshot = (): DashboardSnapshot => ({
  tasks: [],
  planHistory: [],
  focus: {},
  activities: [],
  journals: {},
  weeklyPlans: {},
  weeklyReflections: {},
  monthlyGoals: [],
  monthlyReflections: {},
  quoteOffsets: {},
  quoteHidden: false,
})
