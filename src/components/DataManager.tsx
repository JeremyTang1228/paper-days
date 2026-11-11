import { useState, type ChangeEvent } from 'react'
import { todayKey } from '../lib/dates'
import { repo, validateBundle, type ExportBundle } from '../lib/repository'
import { useDashboard } from '../state/DashboardContext'

/** P4a/P4b：低干扰的数据管理入口。导出与恢复都必须等 IndexedDB 快照回填完成。 */
export function DataManager() {
  const { snap, ready, showToast } = useDashboard()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<ExportBundle | null>(null)
  const [fileName, setFileName] = useState('')
  const [restoreError, setRestoreError] = useState('')
  const [restoring, setRestoring] = useState(false)

  const exportBackup = async () => {
    setBusy(true)
    try {
      const bundle = await repo.exportAll()
      const text = JSON.stringify(bundle, null, 2)
      // 落盘前自检：能解析、字段齐全、记录数与当前快照一致
      const check = JSON.parse(text) as ExportBundle
      if (
        check.schemaVersion !== bundle.schemaVersion ||
        typeof check.exportedAt !== 'string' ||
        !check.data ||
        check.data.tasks.length !== snap.tasks.length
      ) {
        throw new Error('备份内容自检未通过')
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `paper-days-backup-${todayKey()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
      showToast('备份已导出到下载目录')
    } catch (e) {
      showToast(`导出失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  /** 选中文件后先做结构与版本校验；不合法绝不触碰现有数据 */
  const onSelectFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    setPending(null)
    setRestoreError('')
    setFileName(file?.name ?? '')
    if (!file) return
    try {
      const text = await file.text()
      setPending(validateBundle(JSON.parse(text) as unknown))
    } catch (err) {
      setRestoreError(
        `备份文件无效：${err instanceof Error ? err.message : String(err)}。本机数据未做任何改动。`,
      )
    } finally {
      input.value = '' // 允许重复选择同一文件
    }
  }

  const confirmRestore = async () => {
    if (!pending) return
    setRestoring(true)
    try {
      await repo.restoreAll(pending)
      setPending(null)
      setFileName('')
      showToast('数据已恢复，四个视图已同步更新')
    } catch (e) {
      showToast(`恢复失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRestoring(false)
    }
  }

  const counts = [
    `任务 ${snap.tasks.length}`,
    `计划变更 ${snap.planHistory.length}`,
    `首要任务 ${Object.keys(snap.focus).length} 天`,
    `活动 ${snap.activities.length}`,
    `感想 ${Object.keys(snap.journals).length} 天`,
    `周计划 ${Object.keys(snap.weeklyPlans).length}`,
    `月目标 ${snap.monthlyGoals.length}`,
  ].join(' · ')

  return (
    <div className="dm">
      <button
        type="button"
        className="dm-t"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '收起数据管理' : '数据管理 · 备份与恢复'}
      </button>
      {open ? (
        <div className="dm-p">
          <p>数据只保存在这台设备的浏览器里，建议定期导出 JSON 备份。</p>
          <div className="dm-nums">{ready ? counts : '正在读取本机数据…'}</div>
          <button
            type="button"
            className="dm-b"
            onClick={() => void exportBackup()}
            disabled={busy || !ready}
          >
            {busy ? '正在生成…' : '下载完整 JSON 备份'}
          </button>
          <div className="dm-hint">
            备份包含任务与计划变更、每日首要、活动、每日感想、周计划与总结、月目标与总结。
          </div>

          <div className="dm-sub">从备份恢复</div>
          <input
            type="file"
            className="dm-file"
            accept="application/json,.json"
            aria-label="选择 JSON 备份文件"
            onChange={(e) => void onSelectFile(e)}
            disabled={!ready || restoring}
          />
          <div className="dm-hint">
            选择文件后先校验格式与版本；只有你明确确认后才会覆盖本机数据。
          </div>

          {restoreError ? <div className="dm-err">{restoreError}</div> : null}

          {pending ? (
            <div className="dm-warn">
              <b>⚠ 覆盖确认</b>
              <p style={{ margin: '6px 0 8px' }}>
                文件「{fileName}」校验通过（版本 {pending.schemaVersion}，导出于{' '}
                {pending.exportedAt.slice(0, 10)}）。恢复会用备份内容
                <strong>完整替换本机现有数据</strong>，此操作不可撤销。建议先导出当前数据。
              </p>
              <div className="dm-nums">
                备份：任务 {pending.data.tasks.length} · 感想{' '}
                {Object.keys(pending.data.journals).length} 天 · 首要{' '}
                {Object.keys(pending.data.focus).length} 天　|　当前：任务 {snap.tasks.length}{' '}
                · 感想 {Object.keys(snap.journals).length} 天
              </div>
              <div className="dm-acts">
                <button
                  type="button"
                  className="dm-b"
                  onClick={() => void confirmRestore()}
                  disabled={restoring}
                >
                  {restoring ? '正在恢复…' : '确认恢复并覆盖'}
                </button>
                <button
                  type="button"
                  className="dm-b alt"
                  onClick={() => {
                    setPending(null)
                    setFileName('')
                  }}
                  disabled={restoring}
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
