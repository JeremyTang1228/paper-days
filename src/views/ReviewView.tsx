import {
  daysInMonth,
  md,
  monthKey,
  monthLabel,
  rangeDays,
  weekStart,
} from '../lib/dates'
import { repo } from '../lib/repository'
import { useDashboard } from '../state/DashboardContext'
import { DateNavigator } from '../components/AppShell'
import { ReviewStats } from '../components/ReviewStats'
import { ReviewTimeline } from '../components/ReviewTimeline'
import { JournalArchive } from '../components/JournalArchive'
import { SaveIndicator, useJournalDraft } from '../components/JournalEditor'

export function ReviewView() {
  const { reviewRange, setReviewRange, date, snap } = useDashboard()
  const isMonth = reviewRange === 'month'
  const start = isMonth ? `${monthKey(date)}-01` : weekStart(date)
  const days = rangeDays(start, isMonth ? daysInMonth(monthKey(start)) : 7)
  const title = isMonth ? monthLabel(monthKey(start)) : `${md(start)} – ${md(days[6])}`
  const key = isMonth ? monthKey(start) : start
  const summary = useJournalDraft(
    isMonth
      ? snap.monthlyReflections[key] || ''
      : snap.weeklyReflections[key] || '',
    (v) =>
      isMonth ? repo.setMonthlyReflection(key, v) : repo.setWeeklyReflection(key, v),
  )

  const toggle = (
    <div className="seg sm">
      <button className={isMonth ? '' : 'on'} onClick={() => setReviewRange('week')}>
        按周
      </button>
      <button className={isMonth ? 'on' : ''} onClick={() => setReviewRange('month')}>
        按月
      </button>
    </div>
  )

  return (
    <>
      <DateNavigator title={title} eyebrow="时光档案 · My Journey" extra={toggle} />
      <ReviewStats days={days} />
      <ReviewTimeline days={days} isMonth={isMonth} />
      <JournalArchive days={days} />
      <div className="sec">
        <div className="ph">
          <h2>{isMonth ? '月度' : '本周'}总结</h2>
          <SaveIndicator state={summary.state} />
        </div>
        <textarea
          aria-label={isMonth ? '月度总结' : '本周总结'}
          placeholder={isMonth ? '这个月留下了什么？' : '这周真正向前推进了什么？'}
          value={summary.text}
          onChange={(e) => summary.update(e.currentTarget.value)}
        />
        <div className="hint">
          与「{isMonth ? '每月' : '每周'}」页面中的总结是同一份内容。
        </div>
      </div>
    </>
  )
}
