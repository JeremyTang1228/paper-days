import {
  fromKey,
  md,
  mondayOffset,
  weekdayCn,
  weekdayIndex,
} from '../lib/dates'
import {
  activitiesOn,
  doneDate,
  doneOn,
  focusLabel,
  focusStatus,
  hasNote,
  hasRecord,
  planDone,
  planTasks,
  plannedTasks,
  taskById,
} from '../lib/selectors'
import type { ISODate } from '../lib/types'
import { useDashboard } from '../state/DashboardContext'

export function ReviewTimeline({ days, isMonth }: { days: ISODate[]; isMonth: boolean }) {
  const { snap, today, openDay, setOpenDay, goToDay } = useDashboard()

  const strip = (
    <div className={`strip ${isMonth ? 'm' : ''}`}>
      {days.map((d) => {
        const status = focusStatus(snap, d, today)
        return (
          <div title={`${md(d)} ${focusLabel(snap, d, today)}`} key={d}>
            <i className={`s-${status}`} />
            {isMonth
              ? fromKey(d).getDate() % 5 === 0 || fromKey(d).getDate() === 1
                ? fromKey(d).getDate()
                : ''
              : `周${weekdayCn[weekdayIndex(d)]}`}
          </div>
        )
      })}
    </div>
  )

  const bars = isMonth ? (
    <div className="mx">
      {'一二三四五六日'.split('').map((x) => (
        <div className="h" key={x}>
          {x}
        </div>
      ))}
      {Array.from({ length: mondayOffset(days[0]) }, (_, i) => (
        <div className="h" key={`blank-${i}`} />
      ))}
      {days.map((d) => {
        const p = planTasks(snap, d).length
        const c = planDone(snap, d).length
        const r = doneOn(snap, d).length
        return (
          <div
            key={d}
            title={`${md(d)}：计划${p}，截至当日完成${c}；当天实际完成${r}`}
            style={
              p
                ? {
                    background: `color-mix(in srgb,var(--ok) ${Math.min(100, (c / p) * 80 + (c ? 15 : 0))}%,var(--ln))`,
                    color: c ? '#fff' : 'var(--mu)',
                  }
                : undefined
            }
          >
            {fromKey(d).getDate()}
            {p ? <small>{c}/{p}</small> : null}
          </div>
        )
      })}
    </div>
  ) : (
    <>
      {(() => {
        const max = Math.max(1, ...days.map((d) => planTasks(snap, d).length))
        return days.map((d) => {
          const p = planTasks(snap, d).length
          const c = planDone(snap, d).length
          return (
            <div className="bar" key={d}>
              <span>周{weekdayCn[weekdayIndex(d)]}</span>
              <div className="tr">
                <i style={{ width: `${(c / max) * 100}%`, background: 'var(--ok)' }} />
                <i style={{ width: `${((p - c) / max) * 100}%`, background: 'var(--ln)' }} />
              </div>
              <span>{c}/{p}</span>
            </div>
          )
        })
      })()}
      <div className="leg">
        <span>
          <i style={{ background: 'var(--ok)' }} />
          当日计划、截至当日已完成
        </span>
        <span>
          <i style={{ background: 'var(--ln)' }} />
          当日计划、截至当日未完成
        </span>
      </div>
    </>
  )

  const list = isMonth ? days.filter((d) => hasRecord(snap, d) || snap.focus[d]) : days

  return (
    <>
      <div className="sec">
        <h2 style={{ marginBottom: 12 }}>首要任务时间线</h2>
        {strip}
        <div className="leg">
          <span>
            <i className="s-done" />
            已完成
          </span>
          <span>
            <i className="s-open" />
            未完成
          </span>
          <span>
            <i className="s-late" />
            后来完成
          </span>
          <span>
            <i className="s-none" />
            未设置
          </span>
          <span>
            <i className="s-now" />
            进行中/计划中
          </span>
        </div>
      </div>

      <div className="sec">
        <h2 style={{ marginBottom: 12 }}>待办完成情况</h2>
        {bars}
      </div>

      <div className="sec">
        <h2 style={{ marginBottom: 8 }}>每天的一件事</h2>
        {list.length ? (
          list.map((d) => {
            const t = taskById(snap, snap.focus[d])
            const status = focusStatus(snap, d, today)
            const p = planTasks(snap, d).length
            const pd = planDone(snap, d).length
            const c = doneOn(snap, d).length
            const open = openDay === d
            return (
              <div className={`ent st-${status}`} key={d}>
                <button className="rv" onClick={() => setOpenDay(open ? null : d)}>
                  <span className="dt">
                    <b>{fromKey(d).getDate()}</b>周{weekdayCn[weekdayIndex(d)]}
                  </span>
                  <span className="ft">
                    {t ? (
                      t.title
                    ) : (
                      <span style={{ color: 'var(--mu)' }}>未设置首要任务</span>
                    )}
                    <small>
                      计划 {p} · 截至当日完成 {pd} · 当天实际完成 {c}
                      {hasNote(snap, d) ? ' · 有感想' : ''}
                    </small>
                  </span>
                  <span className={`chip s-${status}`}>{focusLabel(snap, d, today)}</span>
                </button>
                {open ? (
                  <div className="det">
                    <h4>待办</h4>
                    {plannedTasks(snap, d).length ? (
                      plannedTasks(snap, d).map((x) => {
                        const dd = doneDate(x)
                        const doneByThen = dd !== null && dd <= d
                        // 取消/搁置仍保留在历史计划事实里，但必须标注，避免误读为待办
                        const stateNote =
                          x.status === 'cancelled'
                            ? '（已取消）'
                            : x.status === 'parked'
                              ? '（已搁置）'
                              : ''
                        return (
                          <div key={x.id}>
                            {doneByThen ? '✓' : '○'} {x.title}
                            {dd && !doneByThen ? `（后来于${dd}完成）` : stateNote}
                          </div>
                        )
                      })
                    ) : (
                      <div style={{ color: 'var(--mu)' }}>无</div>
                    )}
                    <h4>实际活动</h4>
                    {activitiesOn(snap, d).length ? (
                      activitiesOn(snap, d).map((a) => (
                        <div key={a.id}>
                          {a.time || '—'} {a.content}
                        </div>
                      ))
                    ) : (
                      <div style={{ color: 'var(--mu)' }}>无</div>
                    )}
                    <h4>感想</h4>
                    {hasNote(snap, d) ? (
                      <p>{snap.journals[d]}</p>
                    ) : (
                      <div style={{ color: 'var(--mu)' }}>无</div>
                    )}
                    <div style={{ marginTop: 8 }}>
                      <a
                        role="button"
                        tabIndex={0}
                        onClick={() => goToDay(d)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') goToDay(d)
                        }}
                      >
                        去当天的 Daily →
                      </a>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })
        ) : (
          <div className="hint">这段时间还没有记录，这很正常。</div>
        )}
      </div>
    </>
  )
}
