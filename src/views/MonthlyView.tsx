import {
  md,
  monthDays,
  monthFirst,
  monthKey,
  monthLabel,
  mondayOffset,
} from '../lib/dates'
import { repo } from '../lib/repository'
import { doneOn, hasNote, plannedTasks } from '../lib/selectors'
import { useDashboard } from '../state/DashboardContext'
import { DateNavigator } from '../components/AppShell'
import { MonthlyGoals } from '../components/MonthlyGoals'
import { SaveIndicator, useJournalDraft } from '../components/JournalEditor'

export function MonthlyView() {
  const { snap, date, today, goToDay } = useDashboard()
  const m = monthKey(date)
  const days = monthDays(m)
  const reflection = useJournalDraft(snap.monthlyReflections[m] || '', (v) =>
    repo.setMonthlyReflection(m, v),
  )
  const goals = snap.monthlyGoals.filter((g) => g.month === m && g.status !== 'cancelled')
  const doneIds = new Set(days.flatMap((d) => doneOn(snap, d).map((t) => t.id)))
  const activityCount = snap.activities.filter((a) => a.date.startsWith(m)).length
  const recordDays = days.filter(
    (d) => plannedTasks(snap, d).length || snap.activities.some((a) => a.date === d) || hasNote(snap, d),
  ).length

  return (
    <>
      <DateNavigator title={monthLabel(m)} />
      <MonthlyGoals month={m} />

      <div className="cal">
        {'一二三四五六日'.split('').map((x) => (
          <div className="h" key={x}>
            {x}
          </div>
        ))}
        {Array.from({ length: mondayOffset(monthFirst(m)) }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {days.map((k) => {
          const planned = plannedTasks(snap, k).length
          const hasRecord =
            snap.activities.some((a) => a.date === k) || hasNote(snap, k)
          const completed = doneOn(snap, k).length
          return (
            <button
              className={`d ${k === today ? 't' : ''} ${completed ? 'dn' : ''}`}
              key={k}
              aria-label={md(k)}
              onClick={() => goToDay(k)}
            >
              <span>{Number(k.slice(8))}</span>
              <span className="dots">
                {planned ? <i style={{ background: 'var(--mu)' }} /> : null}
                {hasRecord ? <i style={{ background: 'var(--pu)' }} /> : null}
                {completed ? <i style={{ background: 'var(--ok)' }} /> : null}
              </span>
            </button>
          )
        })}
      </div>
      <div className="leg">
        <span>
          <i style={{ background: 'var(--mu)' }} />
          有任务
        </span>
        <span>
          <i style={{ background: 'var(--pu)' }} />
          有记录/感想
        </span>
        <span>
          <i style={{ background: 'var(--ok)' }} />
          有完成
        </span>
      </div>

      <div className="sec">
        <h2 style={{ marginBottom: 12 }}>月度复盘</h2>
        <div className="stats">
          <div>
            <b>{doneIds.size}</b>实际完成
          </div>
          <div>
            <b>{activityCount}</b>活动记录
          </div>
          <div>
            <b>{recordDays}</b>记录天数
          </div>
          <div>
            <b>
              {goals.filter((g) => g.status === 'done').length}/{goals.length}
            </b>
            目标已完成
          </div>
        </div>
        <div className="ph">
          <h2>月度总结</h2>
          <SaveIndicator state={reflection.state} />
        </div>
        <textarea
          aria-label="月度总结"
          placeholder="这个月留下了什么？下个月想调整什么？"
          value={reflection.text}
          onChange={(e) => reflection.update(e.currentTarget.value)}
        />
      </div>
    </>
  )
}
