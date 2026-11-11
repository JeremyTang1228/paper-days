import { md, rangeDays, weekStart, weekdayCn, weekdayIndex, fromKey } from '../lib/dates'
import { repo } from '../lib/repository'
import { doneOn, hasRecord, isDone } from '../lib/selectors'
import type { ISODate } from '../lib/types'
import { useDashboard } from '../state/DashboardContext'
import { DateNavigator } from '../components/AppShell'
import { TaskRow } from '../components/TaskList'
import { WeeklyFocus } from '../components/WeeklyFocus'
import { SaveIndicator, useJournalDraft } from '../components/JournalEditor'

export function WeeklyView() {
  const { snap, date, today, run } = useDashboard()
  const s = weekStart(date)
  const days = rangeDays(s, 7)
  const end = days[6]
  const reflection = useJournalDraft(snap.weeklyReflections[s] || '', (v) =>
    repo.setWeeklyReflection(s, v),
  )

  const doneIds = new Set(days.flatMap((d) => doneOn(snap, d).map((t) => t.id)))
  const open = snap.tasks.filter(
    (t) => t.status === 'open' && !isDone(t) && days.includes(t.currentPlannedDate),
  )
  const activityCount = snap.activities.filter((a) => days.includes(a.date)).length
  const recordDays = days.filter((d) => hasRecord(snap, d)).length

  return (
    <>
      <DateNavigator title={`${md(s)} – ${md(end)}`} />
      <WeeklyFocus weekStart={s} />

      <div className="wk">
        {days.map((d: ISODate) => {
          const ts = snap.tasks.filter((t) => t.status === 'open' && t.currentPlannedDate === d)
          return (
            <div
              className={`col ${d === today ? 't' : ''}`}
              key={d}
              data-d={d}
              onDragOver={(e) => {
                e.preventDefault()
                e.currentTarget.classList.add('over')
              }}
              onDragLeave={(e) => e.currentTarget.classList.remove('over')}
              onDrop={(e) => {
                e.preventDefault()
                e.currentTarget.classList.remove('over')
                const id = e.dataTransfer.getData('text/plain')
                if (id) void run(() => repo.rescheduleTask(id, d), `已改期到${md(d)}`)
              }}
            >
              <div className="dh">
                <b>{fromKey(d).getDate()}</b>
                <span>周{weekdayCn[weekdayIndex(d)]}</span>
                <em>
                  {ts.filter(isDone).length}/{ts.length}
                </em>
              </div>
              <div className="dt">
                {ts.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    date={date}
                    variant="week"
                    anchor={`week:${d}:${t.id}`}
                  />
                ))}
                <div className="add">
                  <AddForDay day={d} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="sec">
        <h2>本周盘点</h2>
        <div className="stats" style={{ marginTop: 12 }}>
          <div>
            <b>{doneIds.size}</b>实际完成
          </div>
          <div>
            <b>{open.length}</b>仍未完成
          </div>
          <div>
            <b>{activityCount}</b>活动记录
          </div>
          <div>
            <b>{recordDays}</b>有记录的天数
          </div>
        </div>
        <div className="two">
          <div>
            <div className="lbl">已完成</div>
            {[...doneIds].map((id) => {
              const t = snap.tasks.find((x) => x.id === id)
              return t ? (
                <div className="li o" key={id}>
                  ✓ {t.title}
                </div>
              ) : null
            })}
            {!doneIds.size ? <div className="li">暂无</div> : null}
          </div>
          <div>
            <div className="lbl">未完成</div>
            {open.map((t) => (
              <div className="li o" key={t.id}>
                ○ {t.title}
              </div>
            ))}
            {!open.length ? <div className="li">暂无</div> : null}
          </div>
        </div>
        <div className="ph">
          <h2>本周总结</h2>
          <SaveIndicator state={reflection.state} />
        </div>
        <textarea
          aria-label="本周总结"
          placeholder="这周真正向前推进了什么？"
          value={reflection.text}
          onChange={(e) => reflection.update(e.currentTarget.value)}
        />
      </div>
    </>
  )
}

function AddForDay({ day }: { day: ISODate }) {
  const { run } = useDashboard()
  return (
    <input
      aria-label={`${md(day)} 添加任务`}
      placeholder="+ 添加任务"
      onKeyDown={async (e) => {
        if (e.key !== 'Enter') return
        const input = e.currentTarget
        const v = input.value.trim()
        if (!v) return
        const ok = await run(() => repo.addTask(v, day))
        if (ok) input.value = ''
      }}
    />
  )
}
