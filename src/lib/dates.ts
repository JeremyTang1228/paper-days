import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  format,
  getDay,
  parseISO,
  startOfWeek,
} from 'date-fns'
import type { ISODate, ISODateTime } from './types'

export const toKey = (d: Date): ISODate => format(d, 'yyyy-MM-dd')
export const fromKey = (k: ISODate): Date => parseISO(k)
export const todayKey = (): ISODate => toKey(new Date())
export const shift = (k: ISODate, n: number): ISODate => toKey(addDays(fromKey(k), n))
export const diffDays = (a: ISODate, b: ISODate): number =>
  differenceInCalendarDays(fromKey(a), fromKey(b))
export const weekStart = (k: ISODate): ISODate =>
  toKey(startOfWeek(fromKey(k), { weekStartsOn: 1 }))
export const monthKey = (k: ISODate): string => k.slice(0, 7)
export const monthFirst = (m: string): ISODate => `${m}-01`
export const shiftMonth = (m: string, n: number): string =>
  format(addMonths(parseISO(monthFirst(m)), n), 'yyyy-MM')
export const daysInMonth = (m: string): number =>
  new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate()
export const weekdayCn = ['日', '一', '二', '三', '四', '五', '六'] as const
export const weekdayIndex = (k: ISODate): number => getDay(fromKey(k))
/** 周一为首列的偏移（原型中的 (getDay()+6)%7） */
export const mondayOffset = (k: ISODate): number => (weekdayIndex(k) + 6) % 7
export const md = (k: ISODate): string => {
  const d = fromKey(k)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
export const monthLabel = (m: string): string =>
  `${Number(m.slice(0, 4))}年${Number(m.slice(5, 7))}月`
export const rangeDays = (start: ISODate, count: number): ISODate[] =>
  Array.from({ length: count }, (_, i) => shift(start, i))
export const monthDays = (m: string): ISODate[] =>
  rangeDays(monthFirst(m), daysInMonth(m))
/** 完成时间以真实操作时刻为准，仅取其本地日历日 */
export const dayKeyFromTimestamp = (ts: ISODateTime): ISODate => toKey(new Date(ts))
export const nextMonday = (k: ISODate): ISODate => shift(weekStart(k), 7)
