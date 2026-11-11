/**
 * 诊断：日历弹框内 .calpick / .cg 是否铺满 .menu.calpop；
 * 同时记录回顾页 .mx 格子尺寸，作为「格子太大」的基线。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:4188/'
const PORT = 9248
const PROFILE = `/tmp/pd13-cal-fill-${Date.now()}`
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
async function realClick(selector, nth = 0) {
  await evaluate(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})][${nth}]; if (e) e.scrollIntoView({block:'center'}); return true })()`)
  await sleep(120)
  const p = await evaluate(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})][${nth}]; if (!e) return null; const r = e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2} })()`)
  if (!p) throw new Error(`找不到 ${selector}[${nth}]`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await sleep(260)
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

await send('Page.enable')
await send('Runtime.enable')
await sleep(1000)
if (!(await waitReady())) throw new Error('应用未就绪')

const seed = `
(async () => {
  const pad = n => String(n).padStart(2,'0');
  const key = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const now = new Date(); const T = key(now); const stamp = now.toISOString();
  const db = await new Promise((res,rej)=>{ const r=indexedDB.open('personal-dashboard-v1-3'); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
  const names=['tasks','planHistory','dailyFocus','activities','journals','weeklyPlans','weeklyReflections','monthlyGoals','monthlyReflections','preferences'];
  const tx=db.transaction(names,'readwrite');
  for(const n of names) tx.objectStore(n).clear();
  const put=(s,v)=>tx.objectStore(s).put(v);
  put('tasks',{id:'cf-focus',title:'首要任务',originalPlannedDate:T,currentPlannedDate:T,completedAt:null,status:'open',nextStep:'',createdAt:stamp,updatedAt:stamp});
  put('dailyFocus',{date:T,taskId:'cf-focus'});
  await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});
  db.close(); return {T};
})()`
await evaluate(seed, true)
await send('Page.reload', { ignoreCache: false })
await sleep(800)
if (!(await waitReady())) throw new Error('重载后未就绪')

const PROBE = `(() => {
  const info = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right),
      cssWidth: cs.width, display: cs.display, cols: cs.gridTemplateColumns, gap: cs.gap, padding: cs.padding, boxSizing: cs.boxSizing };
  };
  const menu = document.querySelector('.menu.calpop');
  const cal = document.querySelector('.calpick');
  const ch = document.querySelector('.calpick .ch');
  const cw = document.querySelector('.calpick .cw');
  const cg = document.querySelector('.calpick .cg');
  const cells = [...document.querySelectorAll('.calpick [data-date]')];
  const first = cells[0], last = cells[cells.length-1];
  const mr = menu?.getBoundingClientRect(), gr = cg?.getBoundingClientRect(), lr = last?.getBoundingClientRect();
  return {
    menu: info(menu), calpick: info(cal), ch: info(ch), cw: info(cw), cg: info(cg),
    firstCell: info(first), lastCell: info(last),
    cells: cells.length,
    gridRightGap: gr && mr ? Math.round(mr.right - gr.right) : null,
    lastCellRightGap: cells.length && mr ? Math.round(mr.right - Math.max(...cells.map(c => c.getBoundingClientRect().right))) : null,
    contentBoxW: menu ? Math.round(mr.width - parseFloat(getComputedStyle(menu).paddingLeft) - parseFloat(getComputedStyle(menu).paddingRight) - 4) : null,
  };
})()`

const report = {}
await realClick('.focus .hd')
const idx = await evaluate(`[...document.querySelectorAll('.focus .hard button')].findIndex(b => b.textContent.includes('调整执行日期'))`)
await realClick('.focus .hard button', idx)
await sleep(400)
report.calendarPopup = await evaluate(PROBE)
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await fs.writeFile(path.join(OUT, 'cal_fill_after.png'), Buffer.from(shot.data, 'base64'))

// 回顾页按月视图格子基线
await evaluate(`document.querySelectorAll('.top .seg button')[3].click(); true`)
await sleep(350)
await evaluate(`document.querySelectorAll('.seg.sm button')[1].click(); true`)
await sleep(400)
report.reviewGrid = await evaluate(`(() => {
  const mx = document.querySelector('.mx'); if (!mx) return null;
  const r = mx.getBoundingClientRect();
  const c = [...mx.querySelectorAll('div')].find(d => !d.classList.contains('h'));
  const cr = c?.getBoundingClientRect(), cs = c ? getComputedStyle(c) : null;
  return { mxW: Math.round(r.width), mxH: Math.round(r.height), cell: cr ? { w: Math.round(cr.width), h: Math.round(cr.height), font: cs.fontSize, radius: cs.borderRadius } : null };
})()`)
await evaluate(`(() => { const e = document.querySelector('.mx'); if (e) e.scrollIntoView({block:'start'}); return true })()`)
await sleep(220)
const shot2 = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await fs.writeFile(path.join(OUT, 'mx_after.png'), Buffer.from(shot2.data, 'base64'))

const p = report.calendarPopup
report.assertions = {
  menuNotGrid: p.menu.display === 'block',
  calpickFillsContent: p.calpick.w >= p.contentBoxW - 2,
  gridFillsCalpick: Math.abs(p.cg.w - p.calpick.w) <= 2,
  lastCellNearRightEdge: p.lastCellRightGap <= 16,
  gridNearRightEdge: p.gridRightGap <= 16,
  dayCellsWideEnough: p.firstCell.w >= 28,
  reviewCellCompact: report.reviewGrid.cell.h <= 66 && report.reviewGrid.cell.w <= 124,
}
report.passAll = Object.values(report.assertions).every(Boolean)
await fs.writeFile(path.join(OUT, 'cal-fill-probe.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
ws.close()
chrome.kill('SIGKILL')
