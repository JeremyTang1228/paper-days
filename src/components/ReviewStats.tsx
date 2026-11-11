import { md } from '../lib/dates'
import { reviewStats } from '../lib/selectors'
import type { ISODate } from '../lib/types'
import { useDashboard } from '../state/DashboardContext'

export function ReviewStats({ days }: { days: ISODate[] }) {
  const { snap, today } = useDashboard()
  const s = reviewStats(snap, days, today)
  const cut = s.cutoff ? md(s.cutoff) : '—'

  return (
    <div className="stats">
      <div>
        <b style={{ color: 'var(--co)' }}>
          {s.focusDone} / {s.focusSet}
        </b>
        首要任务完成
        <small>
          已发生日期（含今天）中，首要任务当天完成数 / 已设置首要任务的天数；今天未完成也计入分母，提前或后来完成都不算当天
        </small>
      </div>
      <div>
        <b style={{ color: 'var(--ok)' }}>
          {s.plannedCompleted} / {s.plannedTotal}
        </b>
        计划任务完成
        <small>
          本期已到日期的计划任务中，截至{cut}已完成；结转任务只算一次，已取消的任务仍计入历史计划事实。期内实际完成共 {s.actuallyCompleted} 项（含此前计划、后来结转完成的）
        </small>
      </div>
      <div>
        <b style={{ color: 'var(--pu)' }}>{s.journalDays} 天</b>
        写了每日感想
        <small>按感想原文的日期统计，不改写用户文字</small>
      </div>
    </div>
  )
}
