import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
  type ReactNode,
} from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { monthKey, shift, shiftMonth, todayKey } from '../lib/dates'
import { loadSnapshot, repo } from '../lib/repository'
import { emptySnapshot, type DashboardSnapshot, type ISODate } from '../lib/types'

export type ViewKey = 'day' | 'week' | 'month' | 'review'
export type ReviewRange = 'week' | 'month'
export interface MenuState {
  id: string
  /** main=五项菜单，step=最小行动输入框，date=调整执行日期的月历 */
  mode: 'main' | 'step' | 'date'
  /**
   * 菜单所在「渲染实例」的锚点。同一条任务可能同时出现在待办、历史结转、
   * 今日首要、周视图等多个位置，只按 id 匹配会让这些实例一起展开菜单。
   */
  anchor: string
}

interface DashboardContextValue {
  snap: DashboardSnapshot
  ready: boolean
  today: ISODate
  view: ViewKey
  setView: (v: ViewKey) => void
  date: ISODate
  setDate: (d: ISODate) => void
  goToDay: (d: ISODate) => void
  move: (dir: number) => void
  reviewRange: ReviewRange
  setReviewRange: (r: ReviewRange) => void
  menu: MenuState | null
  setMenu: (m: MenuState | null) => void
  carryOpen: boolean | undefined
  toggleCarry: (count: number) => void
  parkOpen: boolean
  setParkOpen: (v: boolean) => void
  hard: boolean
  setHard: (v: boolean) => void
  bannerOff: boolean
  setBannerOff: (v: boolean) => void
  openDay: ISODate | null
  setOpenDay: (d: ISODate | null) => void
  expanded: Record<string, boolean>
  toggleExpanded: (d: ISODate) => void
  nextQuote: () => void
  setQuoteHidden: (hidden: boolean) => void
  toast: string
  showToast: (m: string) => void
  /** 统一写入入口：只有真正持久化成功才提示成功 */
  run: (action: () => Promise<unknown>, successMsg?: string) => Promise<boolean>
}

const DashboardContext = createContext<DashboardContextValue | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const fallback = useMemo(emptySnapshot, [])
  // 不传默认快照：useLiveQuery 首次返回 undefined，据此判断数据是否已从 IndexedDB 回填，
  // 避免把加载中的空态误显示成「没有数据」，也避免此时先导出/恢复空库。
  const live = useLiveQuery(loadSnapshot, [])
  const snap = live ?? fallback
  const ready = live !== undefined

  /** 跨午夜：定时 + 窗口重新获得焦点时重新识别“今天” */
  const [today, setToday] = useState<ISODate>(todayKey)
  useEffect(() => {
    const refresh = () => setToday(todayKey())
    const id = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  const [view, setView] = useState<ViewKey>('day')
  const [date, setDate] = useState<ISODate>(todayKey)
  const [reviewRange, setReviewRange] = useState<ReviewRange>('week')
  const [menu, setMenu] = useState<MenuState | null>(null)

  /** 切换浏览日期或视图时收起菜单：否则菜单状态残留，切回原日期会「幽灵复现」 */
  useLayoutEffect(() => {
    setMenu(null)
    // 只在日期 / 视图变化时清理，菜单自身开合不触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, view])

  /** 点击菜单以外的任意位置收起菜单；菜单内部、三点按钮、首要卡片快捷按钮不处理 */
  useEffect(() => {
    if (!menu) return
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target
      if (t instanceof Element && t.closest('.menu, .mo, .hard button')) return
      setMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menu])

  const [carryOpen, setCarryOpen] = useState<boolean | undefined>(undefined)
  const [parkOpen, setParkOpen] = useState(false)
  const [hard, setHard] = useState(false)
  const [bannerOff, setBannerOff] = useState(false)
  const [openDay, setOpenDay] = useState<ISODate | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast = useCallback((m: string) => {
    setToast(m)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 2600)
  }, [])

  const run = useCallback(
    async (action: () => Promise<unknown>, successMsg?: string): Promise<boolean> => {
      try {
        await action()
        if (successMsg) showToast(successMsg)
        return true
      } catch (e) {
        showToast(`保存失败：${e instanceof Error ? e.message : String(e)}`)
        return false
      }
    },
    [showToast],
  )

  const move = useCallback(
    (dir: number) => {
      const unit =
        view === 'review' ? (reviewRange === 'month' ? 'month' : 'week') : view
      if (unit === 'month') setDate(`${shiftMonth(monthKey(date), dir)}-01`)
      else setDate(shift(date, dir * (unit === 'day' ? 1 : 7)))
    },
    [view, reviewRange, date],
  )

  const goToDay = useCallback((d: ISODate) => {
    setDate(d)
    setView('day')
    setMenu(null)
  }, [])

  const nextQuote = useCallback(() => {
    const next = (snap.quoteOffsets[date] || 0) + 1
    void run(() => repo.setPreference(`quote:${date}`, String(next)))
  }, [snap.quoteOffsets, date, run])

  const setQuoteHidden = useCallback(
    (hidden: boolean) => {
      void run(() => repo.setPreference('quoteHidden', hidden ? '1' : '0'))
    },
    [run],
  )

  const value: DashboardContextValue = {
    snap,
    ready,
    today,
    view,
    setView,
    date,
    setDate,
    goToDay,
    move,
    reviewRange,
    setReviewRange,
    menu,
    setMenu,
    carryOpen,
    toggleCarry: (count) =>
      setCarryOpen((prev) => !(prev === undefined ? count <= 5 : prev)),
    parkOpen,
    setParkOpen,
    hard,
    setHard,
    bannerOff,
    setBannerOff,
    openDay,
    setOpenDay,
    expanded,
    toggleExpanded: (d) => setExpanded((prev) => ({ ...prev, [d]: !prev[d] })),
    nextQuote,
    setQuoteHidden,
    toast,
    showToast,
    run,
  }

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard 必须在 DashboardProvider 内使用')
  return ctx
}
