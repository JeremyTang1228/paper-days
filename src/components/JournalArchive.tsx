import { md, weekdayCn, weekdayIndex } from '../lib/dates'
import { hasNote, taskById } from '../lib/selectors'
import type { ISODate } from '../lib/types'
import { useDashboard } from '../state/DashboardContext'

export function JournalArchive({ days }: { days: ISODate[] }) {
  const { snap, expanded, toggleExpanded, goToDay } = useDashboard()
  const noted = days.filter((d) => hasNote(snap, d))

  return (
    <div className="sec">
      <h2 style={{ marginBottom: 12 }}>感想汇集</h2>
      {noted.length ? (
        noted.map((d) => {
          const t = taskById(snap, snap.focus[d])
          const long = snap.journals[d].length > 110
          const ex = Boolean(expanded[d])
          return (
            <div className="jc" key={d}>
              <header>
                <a
                  role="button"
                  tabIndex={0}
                  onClick={() => goToDay(d)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') goToDay(d)
                  }}
                >
                  {md(d)} 周{weekdayCn[weekdayIndex(d)]}
                </a>
                {t ? <span>首要：{t.title}</span> : null}
              </header>
              <p className={long && !ex ? 'cl' : ''}>{snap.journals[d]}</p>
              {long ? (
                <button onClick={() => toggleExpanded(d)}>{ex ? '收起' : '展开全文'}</button>
              ) : null}
            </div>
          )
        })
      ) : (
        <div className="hint">这段时间没有写下感想。</div>
      )}
    </div>
  )
}
