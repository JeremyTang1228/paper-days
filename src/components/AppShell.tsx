import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDashboard } from '../state/DashboardContext'
import type { ReactNode } from 'react'
import { DailyView } from '../views/DailyView'
import { WeeklyView } from '../views/WeeklyView'
import { MonthlyView } from '../views/MonthlyView'
import { ReviewView } from '../views/ReviewView'
import { DataManager } from './DataManager'
import type { ViewKey } from '../state/DashboardContext'

const TABS: [ViewKey, string][] = [
  ['day', '每日'],
  ['week', '每周'],
  ['month', '每月'],
  ['review', '回顾'],
]

export function AppShell() {
  const { view, setView, toast, ready } = useDashboard()
  return (
    <>
      <div id="app" className="fx">
        <div className="top">
          <span className="brand">
            <i className="lg">P</i>
            <span className="bn">纸上日子</span>
          </span>
          <div className="seg" role="tablist" aria-label="视图切换">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={view === key}
                className={view === key ? 'on' : ''}
                onClick={() => setView(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 数据回填完成前只显示极简占位，不渲染会误导成「无数据」的四个视图 */}
        {!ready ? (
          <div className="loading" role="status" aria-live="polite">
            正在读取本机数据…
          </div>
        ) : (
          <>
            {view === 'day' && <DailyView />}
            {view === 'week' && <WeeklyView />}
            {view === 'month' && <MonthlyView />}
            {view === 'review' && <ReviewView />}
          </>
        )}

        <div className="foot">
          数据保存在本机浏览器 · 本地优先，无需账号与云端
          <DataManager />
        </div>
      </div>
      <div id="toast" className={toast ? 'on' : ''} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  )
}

export function DateNavigator({
  title,
  eyebrow,
  extra,
}: {
  title: string
  eyebrow?: string
  extra?: ReactNode
}) {
  const { view, reviewRange, move, setDate, today } = useDashboard()
  const label =
    view === 'day'
      ? '今天'
      : view === 'week' || (view === 'review' && reviewRange === 'week')
        ? '本周'
        : '本月'
  return (
    <div className="nav">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
      </div>
      <div className="pager">
        <button className="nb" onClick={() => move(-1)} aria-label="上一个">
          <ChevronLeft size={16} />
        </button>
        <button className="nb" onClick={() => setDate(today)}>
          {label}
        </button>
        <button className="nb" onClick={() => move(1)} aria-label="下一个">
          <ChevronRight size={16} />
        </button>
      </div>
      {extra}
    </div>
  )
}
