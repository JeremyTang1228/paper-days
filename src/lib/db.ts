import Dexie, { type Table } from 'dexie'
import type {
  ActivityRecord,
  DailyFocus,
  DailyJournal,
  MonthlyGoal,
  MonthlyReflection,
  Preference,
  Task,
  TaskPlanHistory,
  WeeklyPlan,
  WeeklyReflection,
} from './types'

export const SCHEMA_VERSION = 1
export const DB_NAME = 'personal-dashboard-v1-3'

class DashboardDB extends Dexie {
  tasks!: Table<Task, string>
  planHistory!: Table<TaskPlanHistory, string>
  dailyFocus!: Table<DailyFocus, string>
  activities!: Table<ActivityRecord, string>
  journals!: Table<DailyJournal, string>
  weeklyPlans!: Table<WeeklyPlan, string>
  weeklyReflections!: Table<WeeklyReflection, string>
  monthlyGoals!: Table<MonthlyGoal, string>
  monthlyReflections!: Table<MonthlyReflection, string>
  preferences!: Table<Preference, string>

  constructor() {
    super(DB_NAME)
    this.version(SCHEMA_VERSION).stores({
      tasks: 'id, currentPlannedDate, originalPlannedDate, status, completedAt, updatedAt',
      planHistory: 'id, taskId, changedAt, previousDate, newDate',
      dailyFocus: 'date, taskId',
      activities: 'id, date, createdAt',
      journals: 'date, updatedAt',
      weeklyPlans: 'weekStart',
      weeklyReflections: 'weekStart',
      monthlyGoals: 'id, month, status',
      monthlyReflections: 'month',
      preferences: 'key',
    })
  }
}

export const db = new DashboardDB()
