import { useState } from 'react'
import { repo } from '../lib/repository'
import { activitiesOn } from '../lib/selectors'
import type { ISODate } from '../lib/types'
import { useDashboard } from '../state/DashboardContext'

export function ActivityTimeline({ date }: { date: ISODate }) {
  const { snap, run } = useDashboard()
  const [time, setTime] = useState('')
  const [draft, setDraft] = useState('')
  const acts = activitiesOn(snap, date)

  const submit = async () => {
    const v = draft.trim()
    if (!v) return
    const ok = await run(() => repo.addActivity(date, v, time || undefined))
    if (ok) setDraft('')
  }

  return (
    <section className="panel">
      <div className="ph">
        <h2>实际记录</h2>
        <span className="cnt">{acts.length} 条</span>
      </div>
      <div className="add">
        <input
          type="time"
          aria-label="时间（可选）"
          value={time}
          onChange={(e) => setTime(e.currentTarget.value)}
        />
        <input
          aria-label="记录刚才做了什么"
          placeholder="刚才做了什么，回车记录"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
      </div>
      <div className="tl">
        {acts.length ? (
          acts.map((a) => (
            <div className="row" key={a.id}>
              <span className={`time ${a.time ? '' : 'n'}`}>{a.time || '—'}</span>
              <div className="tx">
                <span
                  className="ti"
                  contentEditable
                  suppressContentEditableWarning
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.currentTarget.blur()
                    }
                  }}
                  onBlur={(e) => {
                    const v = (e.currentTarget.textContent || '').trim()
                    if (v && v !== a.content) void run(() => repo.updateActivity(a.id, v))
                    else e.currentTarget.textContent = a.content
                  }}
                >
                  {a.content}
                </span>
              </div>
              <button
                className="x"
                aria-label="删除这条记录"
                onClick={() => void run(() => repo.deleteActivity(a.id))}
              >
                ✕
              </button>
            </div>
          ))
        ) : (
          <div className="hint">发生了什么都可以记在这里，不必先建任务。</div>
        )}
      </div>
    </section>
  )
}
