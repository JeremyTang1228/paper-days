import { Check } from 'lucide-react'
import { diffDays, md, shift } from '../lib/dates'
import { repo } from '../lib/repository'
import { doneDate, isDone } from '../lib/selectors'
import type { ISODate, Task } from '../lib/types'
import { useDashboard } from '../state/DashboardContext'
import { DateCalendar } from './DateCalendar'

export function TaskMenu({
  task,
  date,
  anchor,
}: {
  task: Task
  date: ISODate
  anchor: string
}) {
  const { menu, setMenu, run, today } = useDashboard()
  // 只有「任务 id + 渲染锚点」都命中的那一个实例才展开菜单
  if (!menu || menu.id !== task.id || menu.anchor !== anchor) return null
  const switchMode = (mode: 'main' | 'step' | 'date') =>
    setMenu({ id: task.id, mode, anchor })

  if (menu.mode === 'date') {
    return (
      <div className="menu calpop" role="dialog" aria-label="选择执行日期">
        <DateCalendar
          value={task.currentPlannedDate}
          today={today}
          onPick={(d) => {
            void run(() => repo.rescheduleTask(task.id, d), `已改期到${md(d)}`)
            setMenu(null)
          }}
        />
      </div>
    )
  }

  if (menu.mode === 'step') {
    return (
      <div className="menu">
        <input
          autoFocus
          defaultValue={task.nextStep}
          placeholder="最小的一步，回车保存"
          aria-label="最小行动"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = e.currentTarget.value.trim()
              void run(() => repo.setNextStep(task.id, v))
              setMenu(null)
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="menu" role="menu">
      <button
        role="menuitem"
        onClick={() => {
          void run(() => repo.setFocus(date, task.id))
          setMenu(null)
        }}
      >
        设为今日首要
      </button>
      <button role="menuitem" onClick={() => switchMode('step')}>
        最小行动…
      </button>
      <button
        role="menuitem"
        onClick={() => {
          const d = shift(today, 1)
          void run(() => repo.rescheduleTask(task.id, d), `已改期到${md(d)}`)
          setMenu(null)
        }}
      >
        改到明天
      </button>
      <button
        role="menuitem"
        onClick={() => {
          void run(() => repo.setTaskStatus(task.id, 'parked'), '已搁置，可在「已搁置」中放回')
          setMenu(null)
        }}
      >
        搁置
      </button>
      <button
        role="menuitem"
        onClick={() => {
          void run(() => repo.setTaskStatus(task.id, 'cancelled'), '任务已取消')
          setMenu(null)
        }}
      >
        取消任务
      </button>
    </div>
  )
}

export function TaskRow({
  task,
  date,
  variant = 'day',
  anchor,
}: {
  task: Task
  date: ISODate
  variant?: 'day' | 'week'
  /** 由调用方给出的实例锚点，同一任务在不同列表里必须不同 */
  anchor: string
}) {
  const { run, menu, setMenu, today } = useDashboard()
  const open = menu?.id === task.id && menu.anchor === anchor
  const dd = doneDate(task)
  const checked = variant === 'week' ? isDone(task) : isDone(task) && dd !== null && dd <= date
  const carry =
    variant === 'day' && date === today && !isDone(task) && task.currentPlannedDate < today

  const sub = carry
    ? `首次计划 ${md(task.originalPlannedDate)} · 已延续${diffDays(today, task.originalPlannedDate)}天`
    : isDone(task) && !checked && dd
      ? `后来于${md(dd)}完成`
      : checked && variant === 'day' && task.currentPlannedDate < date
        ? `结转完成 · 首次计划 ${md(task.originalPlannedDate)}`
        : ''

  return (
    <div
      className={`row ${checked ? 'done' : ''}`}
      draggable={variant === 'week'}
      onDragStart={
        variant === 'week'
          ? (e) => e.dataTransfer.setData('text/plain', task.id)
          : undefined
      }
    >
      <button
        className="ck"
        aria-label={checked ? '撤销完成' : '标记完成'}
        aria-pressed={checked}
        onClick={() => void run(() => repo.toggleTask(task.id))}
      >
        {checked ? <Check size={12} aria-hidden="true" /> : null}
      </button>
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
            if (v && v !== task.title) void run(() => repo.renameTask(task.id, v))
            else e.currentTarget.textContent = task.title
          }}
        >
          {task.title}
        </span>
        {sub ? <small>{sub}</small> : null}
        {task.nextStep && variant === 'day' ? <small>▸ {task.nextStep}</small> : null}
      </div>
      <button
        className="mo"
        aria-label="更多操作"
        aria-expanded={open}
        onClick={() =>
          setMenu(open ? null : { id: task.id, mode: 'main', anchor })
        }
      >
        ⋯
      </button>
      <TaskMenu task={task} date={date} anchor={anchor} />
    </div>
  )
}

export function CarryoverGroup({
  date,
  tasks,
  focusId,
}: {
  date: ISODate
  tasks: Task[]
  focusId?: string
}) {
  const { carryOpen, toggleCarry, run, today, setBannerOff } = useDashboard()
  if (!tasks.length) return null
  const open = carryOpen === undefined ? tasks.length <= 5 : carryOpen

  const bulk = async (mode: 'res' | 'park') => {
    for (const t of tasks) {
      if (mode === 'res') await repo.rescheduleTask(t.id, shift(today, 1))
      else await repo.setTaskStatus(t.id, 'parked')
    }
    setBannerOff(true)
  }

  return (
    <div className="grp">
      <div className="gh">
        <button className="l" onClick={() => toggleCarry(tasks.length)}>
          {open ? '▾' : '▸'} 历史结转 · {tasks.length}
        </button>
        {tasks.length >= 3 ? (
          <>
            <button
              className="b"
              onClick={() => void run(() => bulk('res'), `${tasks.length} 项任务已安排到明天`)}
            >
              全部改到明天
            </button>
            <button
              className="b"
              onClick={() => void run(() => bulk('park'), `${tasks.length} 项任务已搁置`)}
            >
              全部搁置
            </button>
          </>
        ) : null}
      </div>
      {open
        ? tasks
            .filter((t) => t.id !== focusId)
            .map((t) => (
              <TaskRow key={t.id} task={t} date={date} anchor={`carry:${date}:${t.id}`} />
            ))
        : null}
    </div>
  )
}

export function ParkedGroup({ date }: { date: ISODate }) {
  const { snap, today, parkOpen, setParkOpen, run } = useDashboard()
  const parked = snap.tasks.filter((t) => t.status === 'parked')
  if (!parked.length || date !== today) return null
  return (
    <div className="grp">
      <div className="gh">
        <button className="l" onClick={() => setParkOpen(!parkOpen)}>
          {parkOpen ? '▾' : '▸'} 已搁置 · {parked.length}
        </button>
      </div>
      {parkOpen
        ? parked.map((t) => (
            <div className="row" key={t.id}>
              <div className="tx" style={{ color: 'var(--mu)' }}>
                {t.title}
              </div>
              <button
                style={{ color: 'var(--ac)', fontSize: 13 }}
                onClick={() =>
                  void run(async () => {
                    await repo.rescheduleTask(t.id, today)
                    await repo.setTaskStatus(t.id, 'open')
                  }, '已放回今天')
                }
              >
                放回今天
              </button>
            </div>
          ))
        : null}
    </div>
  )
}
