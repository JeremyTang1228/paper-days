import { Sparkles } from 'lucide-react'
import { quoteFor } from '../lib/quotes'
import { useDashboard } from '../state/DashboardContext'
import type { ISODate } from '../lib/types'

export function DailyQuote({ date }: { date: ISODate }) {
  const { snap, nextQuote, setQuoteHidden } = useDashboard()
  if (snap.quoteHidden) {
    return (
      <div className="rfm">
        <button onClick={() => setQuoteHidden(false)}>今日的一点光亮 ▸</button>
      </div>
    )
  }
  const q = quoteFor(date, snap.quoteOffsets[date] || 0)
  return (
    <div className="rf">
      <div className="rfl">
        <Sparkles size={14} aria-hidden="true" /> 今日的一点光亮 · Daily Reflection
      </div>
      <p>{q.zh}</p>
      <em>{q.en}</em>
      <div className="bt">
        <button onClick={nextQuote}>换一句</button>
        <button onClick={() => setQuoteHidden(true)}>收起</button>
      </div>
    </div>
  )
}
