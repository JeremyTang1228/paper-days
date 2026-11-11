import { Check } from 'lucide-react'
import { repo } from '../lib/repository'
import type { MonthlyGoal } from '../lib/types'
import { useDashboard } from '../state/DashboardContext'

export function MonthlyGoals({ month }: { month: string }) {
  const { snap, run } = useDashboard()
  const goals = snap.monthlyGoals.filter((g) => g.month === month)
  const active = goals.filter((g) => g.status !== 'cancelled')
  const cancelled = goals.filter((g) => g.status === 'cancelled')

  const card = (g: MonthlyGoal, i: number) => (
    <div className={`gc ${g.status === 'parked' ? 'p' : ''} ${g.status === 'cancelled' ? 'p c' : ''}`} key={g.id}>
      <span className="gn">0{i + 1}</span>
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
            if (v && v !== g.title) void run(() => repo.updateGoal(g.id, { title: v }))
            else e.currentTarget.textContent = g.title
          }}
        >
          {g.title}
        </span>
        {g.status !== 'cancelled' ? (
          <input
            className="s"
            aria-label="下一步行动"
            defaultValue={g.nextStep}
            placeholder="下一步行动（可选）"
            onBlur={(e) => {
              const v = e.currentTarget.value
              if (v !== g.nextStep) void run(() => repo.updateGoal(g.id, { nextStep: v }))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        ) : null}
      </div>
      <div className="ga">
        {g.status === 'cancelled' ? (
          <button
            style={{ color: 'var(--ac)' }}
            onClick={() => void run(() => repo.setGoalStatus(g.id, 'open'))}
          >
            恢复
          </button>
        ) : (
          <>
            <button
              className="ck"
              style={
                g.status === 'done'
                  ? { background: 'var(--ok)', borderColor: 'var(--ok)' }
                  : undefined
              }
              aria-label={g.status === 'done' ? '撤销完成' : '标记完成'}
              onClick={() =>
                void run(() =>
                  repo.setGoalStatus(g.id, g.status === 'done' ? 'open' : 'done'),
                )
              }
            >
              {g.status === 'done' ? <Check size={12} aria-hidden="true" /> : null}
            </button>
            <span>{g.status === 'done' ? '已完成' : ''}</span>
            <button
              style={{ marginLeft: 'auto' }}
              onClick={() =>
                void run(() =>
                  repo.setGoalStatus(g.id, g.status === 'parked' ? 'open' : 'parked'),
                )
              }
            >
              {g.status === 'parked' ? '恢复' : '搁置'}
            </button>
            <button onClick={() => void run(() => repo.setGoalStatus(g.id, 'cancelled'))}>
              取消
            </button>
          </>
        )}
      </div>
    </div>
  )

  return (
    <div className="sec">
      <h2 style={{ marginBottom: 12 }}>月度目标</h2>
      <div className="gcs">
        {active.map(card)}
        {active.length < 3 ? (
          <div className="gc ag">
            <input
              aria-label="添加月度目标"
              placeholder="+ 添加月度目标（最多三个）"
              onKeyDown={async (e) => {
                if (e.key !== 'Enter') return
                const input = e.currentTarget
                const v = input.value.trim()
                if (!v) return
                const ok = await run(() => repo.addMonthlyGoal(month, v))
                if (ok) input.value = ''
              }}
            />
          </div>
        ) : null}
      </div>
      {cancelled.length ? (
        <>
          <div className="lbl">已取消</div>
          <div className="gcs">{cancelled.map(card)}</div>
        </>
      ) : null}
    </div>
  )
}
