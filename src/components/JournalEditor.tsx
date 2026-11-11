import { useEffect, useRef, useState } from 'react'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/**
 * 草稿 + 自动保存。只有 onSave 真正 resolve 才标记「已保存」；
 * 外部回传值与刚写入值相同时不会重置光标，也不会重复写入。
 */
export function useJournalDraft(value: string, onSave: (v: string) => Promise<void>) {
  const [text, setText] = useState(value)
  const [state, setState] = useState<SaveState>('idle')
  const written = useRef(value)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (value !== written.current) {
      written.current = value
      setText(value)
    }
  }, [value])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const update = (v: string) => {
    setText(v)
    setState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      try {
        await onSave(v)
        written.current = v
        setState('saved')
      } catch {
        setState('error')
      }
    }, 650)
  }

  return { text, update, state }
}

export function SaveIndicator({ state }: { state: SaveState }) {
  const label =
    state === 'saving'
      ? '正在保存…'
      : state === 'saved'
        ? '已保存'
        : state === 'error'
          ? '保存失败，请重试'
          : ''
  return (
    <span className="sv" data-state={state} role="status" aria-live="polite">
      {label}
    </span>
  )
}
