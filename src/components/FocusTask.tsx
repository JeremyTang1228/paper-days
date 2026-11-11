import { useState } from 'react'
import { Check } from 'lucide-react'
import { repo } from '../lib/repository'
import {
  carryoverTasks,
  dayTasks,
  doneDate,
  isDone,
  taskById,
} from '../lib/selectors'
import type { ISODate } from '../lib/types'
import { useDashboard } from '../state/DashboardContext'
import { TaskMenu } from './TaskList'

export function FocusTask({ date }: { date: ISODate }) {
  const { snap, today, run, hard, setHard, menu, setMenu } = useDashboard()
  const [draft, setDraft] = useState('')

  const ft = taskById(snap, snap.focus[date])
  const fo =
    ft &&
    (date < today ||
      (ft.status === 'open' &&
        (ft.currentPlannedDate <= date || doneDate(ft) === date)))
      ? ft
      : null
  const fdn = Boolean(fo && isDone(fo) && (doneDate(fo) ?? '') <= date)
  // 首要任务卡里的菜单与待办 / 结转里的同名任务实例相互独立
  const focusAnchor = `focus:${date}`
  const calOpen = Boolean(
    fo && menu?.id === fo.id && menu.anchor === focusAnchor && menu.mode === 'date',
  )
  const rest = dayTasks(snap, date).filter((t) => !fo || t.id !== fo.id)
  const carry = date === today ? carryoverTasks(snap, today) : []
  const candidates = [
    ...rest.filter((t) => !isDone(t)),
    ...carry,
  ].slice(0, 5)

  const addAsFocus = async () => {
    const v = draft.trim()
    if (!v) return
    const ok = await run(async () => {
      const id = await repo.addTask(v, date)
      await repo.setFocus(date, id)
    })
    if (ok) setDraft('')
  }

  return (
    <section className="focus">
      <div className="fl">
        今日首要<i>ONE THING</i>
      </div>

      {fo ? (
        <>
          <div className={`fr ${fdn ? 'done' : ''}`}>
            <button
              className="ck big"
              aria-label={fdn ? '撤销完成' : '标记完成'}
              aria-pressed={fdn}
              onClick={() => void run(() => repo.toggleTask(fo.id))}
            >
              {fdn ? <Check size={16} aria-hidden="true" /> : null}
            </button>
            <div>
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
                  if (v && v !== fo.title) void run(() => repo.renameTask(fo.id, v))
                  else e.currentTarget.textContent = fo.title
                }}
              >
                {fo.title}
              </span>
              {fo.nextStep ? <div className="stp">下一步 · {fo.nextStep}</div> : null}
            </div>
          </div>
          <div className="fa">
            {!fdn && date >= today ? (
              <button className="hd" onClick={() => setHard(!hard)}>
                暂时难以开始？
              </button>
            ) : null}
            {date >= today ? (
              <button onClick={() => void run(() => repo.clearFocus(date))}>
                更换首要任务
              </button>
            ) : null}
          </div>
          {hard && !fdn ? (
            <div className="hard">
              <button onClick={() => setMenu({ id: fo.id, mode: 'step', anchor: focusAnchor })}>
                拆成更小的一步
              </button>
              <button
                aria-expanded={calOpen}
                onClick={() =>
                  setMenu(calOpen ? null : { id: fo.id, mode: 'date', anchor: focusAnchor })
                }
              >
                调整执行日期
              </button>
              <button
                onClick={() =>
                  void run(
                    () => repo.setTaskStatus(fo.id, 'parked'),
                    '已搁置，可在「已搁置」中放回',
                  )
                }
              >
                暂时搁置
              </button>
            </div>
          ) : null}
          <TaskMenu task={fo} date={date} anchor={focusAnchor} />
        </>
      ) : date < today ? (
        <div className="emp">这一天没有设置首要任务。</div>
      ) : (
        <>
          <div style={{ font: '500 24px var(--serif)' }}>
            今天最值得推进的一件事是什么？
          </div>
          <div className="add" style={{ margin: '14px 0 0' }}>
            <input
              aria-label="新增一件事，回车设为首要"
              placeholder="新增一件事，回车设为首要"
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addAsFocus()
              }}
            />
          </div>
          {candidates.length ? (
            <div className="chips">
              {candidates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => void run(() => repo.setFocus(date, t.id))}
                >
                  {t.title}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
