import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:4188/'
const PORT = 9241
const PROFILE = `/tmp/pd13-brand-${Date.now()}`
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')
// 覆盖手机、小平板竖屏、平板竖屏、桌面三档基线
const WIDTHS = [390, 430, 600, 768, 1024, 1440]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await fs.mkdir(OUT, { recursive: true })

const chrome = spawn(
  CHROME,
  [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--proxy-server=http://127.0.0.1:49327',
    '--proxy-bypass-list=127.0.0.1;localhost',
    '--window-size=1440,1200', 'about:blank',
  ],
  { stdio: 'ignore' },
)

async function devtoolsReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      if (r.ok) return true
    } catch {}
    await sleep(250)
  }
  return false
}

if (!(await devtoolsReady())) {
  chrome.kill('SIGKILL')
  throw new Error('Chrome DevTools did not start')
}

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })

let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  let msg
  try { msg = JSON.parse(ev.data) } catch { return }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)) }
    }, 45000)
  })
}
async function evaluate(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'evaluate failed')
  return r.result.value
}

await send('Page.enable')
await send('Runtime.enable')
await sleep(1200)

/** 等 React 挂载 + Dexie 快照回填完成，避免把加载占位误判成品牌缺失 */
async function waitReady(timeoutMs = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const ok = await evaluate(
        `document.querySelectorAll('.seg button').length === 4 && !!document.querySelector('.bn') && !!document.querySelector('.loading') === false`,
      )
      if (ok) return true
    } catch {}
    await sleep(300)
  }
  return false
}
const ready = await waitReady()
console.log('app ready:', ready)
if (!ready) { ws.close(); chrome.kill('SIGKILL'); throw new Error('应用未就绪，终止验证') }
await evaluate('document.fonts.ready.then(() => true)', true).catch(() => {})

const probe = `(() => {
  const bn = document.querySelector('.bn');
  const brand = document.querySelector('.brand');
  const seg = document.querySelector('.seg');
  const tabs = [...document.querySelectorAll('.seg button')];
  const r = bn?.getBoundingClientRect();
  const br = brand?.getBoundingClientRect();
  const sr = seg?.getBoundingClientRect();
  const cs = bn ? getComputedStyle(bn) : null;
  return {
    title: document.title,
    text: bn?.textContent?.trim() || '',
    display: cs?.display || '',
    bnWidth: Math.round(r?.width || 0),
    visible: !!r && r.width > 20 && cs?.display !== 'none',
    brandAboveTabs: !!br && !!sr && br.bottom <= sr.top + 2,
    sameRow: !!br && !!sr && Math.abs(br.top - sr.top) < 20,
    tabCount: tabs.length,
    tabWidths: tabs.map(t => Math.round(t.getBoundingClientRect().width)),
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
  };
})()`

const results = []
for (const width of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height: 900, deviceScaleFactor: 1, mobile: false,
  })
  await sleep(450)
  const m = await evaluate(probe)
  const expectedTwoRows = width <= 760
  const ok = m.visible && m.text === '纸上日子' && m.tabCount === 4 &&
    m.overflowX <= 0 && (expectedTwoRows ? m.brandAboveTabs : m.sameRow)
  results.push({ width, ok, ...m })
  console.log(`${String(width).padStart(4)}px | 品牌可见=${m.visible} | 文字="${m.text}" | 两行=${m.brandAboveTabs} | 药丸=${m.tabCount} 宽=${m.tabWidths.join('/')} | 横向溢出=${m.overflowX} | ${ok ? 'PASS' : 'FAIL'}`)

  if (width === 390 || width === 768) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await fs.writeFile(path.join(OUT, `brand_${width}.png`), Buffer.from(shot.data, 'base64'))
  }
}

const pass = results.filter((r) => r.ok).length
await fs.writeFile(path.join(OUT, 'brand-report.json'), JSON.stringify({ pass, total: results.length, results }, null, 2))
console.log(`\n结果: ${pass}/${results.length} PASS`)
ws.close()
chrome.kill('SIGKILL')
if (pass !== results.length) process.exitCode = 1
