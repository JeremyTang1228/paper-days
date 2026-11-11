import { useEffect, useRef, useState } from 'react'
import { repo } from '../lib/repository'
import type { ISODate } from '../lib/types'
import { useDashboard } from '../state/DashboardContext'
import { SaveIndicator, type SaveState } from './JournalEditor'

type Triple = [string, string, string]

export function WeeklyFocus({ weekStart }: { weekStart: ISODate }) {
  const { snap } = useDashboard()
  const incoming = (snap.weeklyPlans[weekStart] ?? ['', '', '']) as Triple
  const serialized = JSON.stringify(incoming)
  const [items, setItems] = useState<Triple>(incoming)
  const [state, setState] = useState<SaveState>('idle')
  const written = useRef(serialized)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (serialized !== written.current) {
      written.current = serialized
      setItems(incoming)
    }
  }, [serialized]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const change = (i: number, v: string) => {
    const next = [...items] as Triple
    next[i] = v
    setItems(next)
    setState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      try {
        await repo.setWeeklyPlan(weekStart, next)
        written.current = JSON.stringify(next)
        setState('saved')
      } catch {
        setState('error')
      }
    }, 650)
  }

  return (
    <div className="sec">
      <div className="ph">
        <h2>本周重点</h2>
        <SaveIndicator state={state} />
      </div>
      <div className="wf">
        {[0, 1, 2].map((i) => (
          <label key={i}>
            <i>{i + 1}</i>
            <input
              aria-label={`本周重点 ${i + 1}`}
              value={items[i]}
              placeholder={i ? '' : '最多三条，直接输入'}
              onChange={(e) => change(i, e.currentTarget.value)}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
