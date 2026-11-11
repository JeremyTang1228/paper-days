import { describe, expect, it } from 'vitest'
import {
  dayKeyFromTimestamp,
  daysInMonth,
  md,
  mondayOffset,
  monthDays,
  monthFirst,
  monthKey,
  rangeDays,
  shift,
  shiftMonth,
  weekStart,
} from './dates'

describe('P2/P3 · 日期边界', () => {
  it('10a. 周起始为周一，跨月与跨年正确', () => {
    expect(weekStart('2026-11-10')).toBe('2026-11-09')
    expect(weekStart('2026-11-01')).toBe('2026-10-26')
    expect(weekStart('2027-01-01')).toBe('2026-12-28')
    expect(rangeDays(weekStart('2026-11-10'), 7)).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12',
      '2026-11-13', '2026-11-14', '2026-11-15',
    ])
  })

  it('10b. 月视图天数与自然月边界（含闰年）', () => {
    expect(daysInMonth('2026-11')).toBe(30)
    expect(daysInMonth('2026-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-12')).toBe(31)
    const nov = monthDays('2026-11')
    expect(nov).toHaveLength(30)
    expect(nov[0]).toBe('2026-11-01')
    expect(nov[29]).toBe('2026-11-30')
    expect(monthFirst(monthKey('2026-11-30'))).toBe('2026-11-01')
  })

  it('10c. 日/月位移跨月跨年不出错', () => {
    expect(shift('2026-11-30', 1)).toBe('2026-12-01')
    expect(shift('2026-12-31', 1)).toBe('2027-01-01')
    expect(shift('2027-01-01', -1)).toBe('2026-12-31')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('10d. 完成时间按本地日历日归属，不伪造历史完成日', () => {
    // 2026-11-10T23:30Z 在 GMT+8 已是 11 月 11 日
    expect(dayKeyFromTimestamp('2026-11-10T23:30:00.000Z')).toBe('2026-11-11')
    expect(dayKeyFromTimestamp('2026-11-10T01:00:00.000Z')).toBe('2026-11-10')
    expect(doneDateOf('2026-11-10T09:00:00+08:00')).toBe('2026-11-10')
  })

  it('周一偏移与中文日期格式', () => {
    expect(mondayOffset('2026-11-09')).toBe(0)
    expect(mondayOffset('2026-11-15')).toBe(6)
    expect(md('2026-11-09')).toBe('11月9日')
  })
})

// 单独包一层，明确「完成日期」只由时间戳决定
function doneDateOf(ts: string): string {
  return dayKeyFromTimestamp(ts)
}
