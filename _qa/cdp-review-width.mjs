/**
 * 回顾页「待办完成情况」（按月）宽度专项 QA。
 * 期望：月历网格铺满所在 .sec 宽度，右侧不留大块空白；各档宽度无横向溢出，
 * 日期格不越出网格右边界；按周视图的条形图不受影响。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:4188/'
const PORT = 9247
const PROFILE = `/tmp/pd13-review-width-${Date.now()}`
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await fs.mkdir(OUT, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--proxy-server=http://127.0.0.1:49327',
  '--proxy-bypass-list=127.0.0.1;localhost',
  '--window-size=1440,1200', 'about:blank',
], { stdio: 'ignore' })

async function devtoolsReady() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return true } catch {}
    await sleep(250)
  }
  return false
}
if (!(await devtoolsReady())) { chrome.kill('SIGKILL'); throw new Error('Chrome DevTools did not start') }
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
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout: ${method}`)) } }, 45000)
  })
}
async function evaluate(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
  if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} :: ${r.exceptionDetails.exception?.description || ''}`)
  return r.result.value
}
async function waitReady(timeoutMs = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await evaluate(`document.querySelectorAll('.top .seg button').length === 4 && !document.querySelector('.loading')`)) return true
    } catch {}
    await sleep(300)
  }
  return false
}
async function gotoMonthReview() {
  await evaluate(`document.querySelectorAll('.top .seg button')[3].click(); true`)
  await sleep(350)
  await evaluate(`document.querySelectorAll('.seg.sm button')[1].click(); true`)
  await sleep(350)
}

await send('Page.enable')
await send('Runtime.enable')
await sleep(1000)
if (!(await waitReady())) throw new Error('应用未就绪')

const MEASURE = `(() => {
  const sec = [...document.querySelectorAll('.sec')].find(s => s.querySelector('.mx'));
  if (!sec) return { error: '未找到待办完成情况区块' };
  const mx = sec.querySelector('.mx');
  const sr = sec.getBoundingClientRect(), mr = mx.getBoundingClientRect();
  const cells = [...mx.querySelectorAll('div')];
  const dayCells = cells.filter(c => !c.classList.contains('h'));
  const first = dayCells[0]?.getBoundingClientRect();
  const cs = first ? getComputedStyle(dayCells[0]) : null;
  const outside = cells.filter(c => {
    const r = c.getBoundingClientRect();
    return r.right > mr.right + 1 || r.left < mr.left - 1;
  }).length;
  return {
    appW: Math.round(document.querySelector('#app').getBoundingClientRect().width),
    secW: Math.round(sr.width),
    mxW: Math.round(mr.width),
    ratio: +(mr.width / sr.width).toFixed(3),
    rightGap: Math.round(sr.right - mr.right),
    visualRightGap: dayCells.length ? Math.round(sr.right - Math.max(...dayCells.map(c => c.getBoundingClientRect().right))) : null,
    cell: first ? { w: Math.round(first.width), h: Math.round(first.height), fontSize: cs.fontSize, fontFamily: cs.fontFamily.split(',')[0] } : null,
    dayCells: dayCells.length,
    cellsOutsideGrid: outside,
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    scrollW: document.documentElement.scrollWidth,
    viewportW: innerWidth,
    monthLabel: document.querySelector('.seg.sm button.on')?.textContent || '',
  };
})()`

const results = []
for (const width of [1440, 1024, 768, 390]) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height: width <= 390 ? 844 : 1200, deviceScaleFactor: 1, mobile: width <= 390,
  })
  await send('Page.reload', { ignoreCache: false })
  await sleep(700)
  if (!(await waitReady())) { results.push({ width, error: '未就绪' }); continue }
  await gotoMonthReview()
  await sleep(900)
  const m = await evaluate(MEASURE)
  const file = path.join(OUT, `review_width_${width}.png`)
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await fs.writeFile(file, Buffer.from(shot.data, 'base64'))
  // 月历特写：窄屏下月历在首屏之下，单独滚动到它再拍一张
  await evaluate(`(() => { const e = document.querySelector('.mx'); if (e) e.scrollIntoView({ block: 'start' }); return true })()`)
  await sleep(220)
  const shot2 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await fs.writeFile(path.join(OUT, `review_calendar_${width}.png`), Buffer.from(shot2.data, 'base64'))
  results.push({ width, ...m, screenshot: path.basename(file), calendarShot: `review_calendar_${width}.png` })
  console.log(`${width}px | sec=${m.secW} mx=${m.mxW} ratio=${m.ratio} 网格右侧=${m.rightGap}px 视觉右侧=${m.visualRightGap}px | 格子=${JSON.stringify(m.cell)} | 溢出=${m.overflowX} | 越界格=${m.cellsOutsideGrid}`)
}
await send('Emulation.clearDeviceMetricsOverride')

// 按周视图的条形图仍需保持铺满（.bar .tr flex:1），且不受本次改动影响
await send('Page.reload', { ignoreCache: false })
await sleep(700)
if (await waitReady()) {
  await evaluate(`document.querySelectorAll('.top .seg button')[3].click(); true`)
  await sleep(350)
  var week = await evaluate(`(() => {
    const sec = [...document.querySelectorAll('.sec')].find(s => s.querySelector('.bar'));
    if (!sec) return { error: '未找到条形图' };
    const sr = sec.getBoundingClientRect();
    const tr = sec.querySelector('.bar .tr').getBoundingClientRect();
    return { secW: Math.round(sr.width), barW: Math.round(tr.width), rightGap: Math.round(sr.right - tr.right), overflowX: document.documentElement.scrollWidth > innerWidth + 1 };
  })()`)
} else { var week = { error: '未就绪' } }

const report = { results, week, assertions: {
  fills1440: results.find(r => r.width === 1440)?.ratio >= 0.98,
  fills1024: results.find(r => r.width === 1024)?.ratio >= 0.98,
  fills768: results.find(r => r.width === 768)?.ratio >= 0.98,
  fills390: results.find(r => r.width === 390)?.ratio >= 0.98,
  noOverflow: results.every(r => r.overflowX === false),
  noCellOutside: results.every(r => r.cellsOutsideGrid === 0),
  noVisualRightGap: results.every(r => r.visualRightGap !== null && r.visualRightGap <= 32),
  compactCells: results.find(r => r.width === 1440)?.cell?.h <= 66,
  weekBarStillFull: week.rightGap !== undefined && week.rightGap <= 60 && week.overflowX === false,
} }
report.passAll = Object.values(report.assertions).every(Boolean)
await fs.writeFile(path.join(OUT, 'review-width-report.json'), JSON.stringify(report, null, 2))
console.log('\nassertions:', JSON.stringify(report.assertions), '\npassAll:', report.passAll)
ws.close()
chrome.kill('SIGKILL')
