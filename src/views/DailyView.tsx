import { useState } from 'react'
import { md, weekdayCn, weekdayIndex } from '../lib/dates'
import { repo } from '../lib/repository'
import {
  carryoverTasks,
  dayTasks,
  doneDate,
  isDone,
  previousDatesOf,
  taskById,
} from '../lib/selectors'
import { useDashboard } from '../state/DashboardContext'
import { DateNavigator } from '../components/AppShell'
import { DailyQuote } from '../components/DailyQuote'
import { FocusTask } from '../components/FocusTask'
import { TaskRow, CarryoverGroup, ParkedGroup } from '../components/TaskList'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { SaveIndicator, useJournalDraft } from '../components/JournalEditor'

export function DailyView() {
  const { snap, date, today, bannerOff, setBannerOff, run } = useDashboard()
  const [draft, setDraft] = useState('')
  const journal = useJournalDraft(snap.journals[date] || '', (v) =>
    repo.setJournal(date, v),
  )

  const ts = dayTasks(snap, date)
  // 结转是「今天视角」的概念，只在浏览今天时出现。历史日期若仍按 today 计算结转，
  // 当天计划的任务会同时进入「待办」和「历史结转」，显示两遍且未完成计数翻倍。
  // 与 FocusTask / ParkedGroup / 顶部提示条的 date === today 口径保持一致。
  const car = date === today ? carryoverTasks(snap, today) : []
  const fo = taskById(snap, snap.focus[date])
  const rest = ts.filter((t) => !fo || t.id !== fo.id)
  const left =
    rest.filter((t) => !(isDone(t) && (doneDate(t) ?? '') <= date)).length + car.length
  const moved = snap.tasks.filter(
    (t) =>
      previousDatesOf(snap, t.id).has(date) &&
      t.currentPlannedDate !== date &&
      t.status !== 'cancelled',
  )

  const addTask = async () => {
    const v = draft.trim()
    if (!v) return
    const ok = await run(() => repo.addTask(v, date))
    if (ok) setDraft('')
  }

  return (
    <>
      <DateNavigator
        title={md(date)}
        eyebrow={`周${weekdayCn[weekdayIndex(date)]}${date === today ? ' · 今天' : ''}`}
      />

      {car.length >= 3 && date === today && !bannerOff ? (
        <div className="banner">
          之前还有一些未完成的事项，你可以选择继续或重新安排。
          <button onClick={() => setBannerOff(true)}>收起</button>
        </div>
      ) : null}

      <DailyQuote date={date} />
      <FocusTask date={date} />

      <div className="cols">
        <section className="panel">
          <div className="ph">
            <h2>待办</h2>
            <span className="cnt">{left} 项未完成</span>
          </div>
          <div className="add">
            <input
              aria-label="添加任务"
              placeholder="添加任务，回车确认"
              value={draft}
              onChange={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void addTask()
              }}
            />
          </div>
          {rest.map((t) => (
            <TaskRow key={t.id} task={t} date={date} anchor={`day:${date}:${t.id}`} />
          ))}
          {moved.map((t) => (
            <div className="mv" key={t.id}>
              ↪ {t.title} · 已改期到{md(t.currentPlannedDate)}
            </div>
          ))}
          {!ts.length && !car.length && !moved.length ? (
            <div className="hint">还没有任务。想到什么就写在上面，按回车即可。</div>
          ) : ts.length &&
            !ts.some((t) => !(isDone(t) && (doneDate(t) ?? '') <= date)) &&
            !car.length ? (
            <div className="hint">这一天的事都完成了。</div>
          ) : null}
          <CarryoverGroup date={date} tasks={car} focusId={fo?.id} />
          <ParkedGroup date={date} />
        </section>
        <ActivityTimeline date={date} />
      </div>

      <section className="note">
        <div className="ph">
          <h2>每日感想</h2>
          <SaveIndicator state={journal.state} />
        </div>
        <textarea
          aria-label="每日感想"
          placeholder="今天的想法、收获、灵感或困惑……"
          value={journal.text}
          onChange={(e) => journal.update(e.currentTarget.value)}
        />
      </section>
    </>
  )
}
