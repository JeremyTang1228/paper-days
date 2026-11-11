import { useState } from 'react'
import {
  daysInMonth,
  md,
  mondayOffset,
  monthFirst,
  monthKey,
  monthLabel,
  shiftMonth,
} from '../lib/dates'
import type { ISODate } from '../lib/types'

/**
 * 「调整执行日期」的月历。沿用菜单外框（.menu）的纸片语言，内容本身只是
 * 一个可直接点选日期的月视图：周一为首列，可前后翻月，今天 / 当前执行日高亮。
 * 不做日期格式输入，也不弹系统原生选择器。
 */
export function DateCalendar({
  value,
  today,
  onPick,
}: {
  value: ISODate
  today: ISODate
  onPick: (d: ISODate) => void
}) {
  const [m, setM] = useState(monthKey(value))
  const lead = mondayOffset(monthFirst(m))
  const days = Array.from(
    { length: daysInMonth(m) },
    (_, i) => `${m}-${String(i + 1).padStart(2, '0')}` as ISODate,
  )

  return (
    <div className="calpick">
      <div className="ch">
        <button type="button" aria-label="上个月" onClick={() => setM(shiftMonth(m, -1))}>
          ‹
        </button>
        <strong>{monthLabel(m)}</strong>
        <button type="button" aria-label="下个月" onClick={() => setM(shiftMonth(m, 1))}>
          ›
        </button>
      </div>
      <div className="cw" aria-hidden="true">
        {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="cg">
        {lead ? <span className="blank" style={{ gridColumn: `span ${lead}` }} /> : null}
        {days.map((d) => (
          <button
            key={d}
            type="button"
            data-date={d}
            aria-label={`安排到${md(d)}`}
            className={`${d === today ? 'today' : ''} ${d === value ? 'cur' : ''}`.trim()}
            onClick={() => onPick(d)}
          >
            {Number(d.slice(8))}
          </button>
        ))}
      </div>
    </div>
  )
}
