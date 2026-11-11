/**
 * 结转口径专项：历史日期不应重复显示同一任务、未完成计数不应翻倍；
 * 今天仍应显示「历史结转」分组；两个日期下三点菜单都只展开一个。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:4188/'
const PORT = 9245
const PROFILE = `/tmp/pd13-carryover-${Date.now()}`
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
await send('Page.enable')
await send('Runtime.enable')
await sleep(1000)
async function waitReady(timeoutMs = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await evaluate(`document.querySelectorAll('.seg button').length === 4 && !document.querySelector('.loading') && !!document.querySelector('input[aria-label="添加任务"]')`)) return true
    } catch {}
    await sleep(300)
  }
  return false
}

const seed = `
(async () => {
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const now = new Date();
  const T = key(now), Y = key(new Date(now.getTime() - 86400000)), D2 = key(new Date(now.getTime() - 2*86400000));
  const stamp = now.toISOString();
  const db = await new Promise((res, rej) => {
    const req = indexedDB.open('personal-dashboard-v1-3');
    req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
  });
  const names = ['tasks','planHistory','dailyFocus','activities','journals','weeklyPlans','weeklyReflections','monthlyGoals','monthlyReflections','preferences'];
  const tx = db.transaction(names, 'readwrite');
  for (const n of names) tx.objectStore(n).clear();
  const put = (s, v) => tx.objectStore(s).put(v);
  const mk = (id, title, day) => ({ id, title, originalPlannedDate: day, currentPlannedDate: day, completedAt: null, status: 'open', nextStep: '', createdAt: stamp, updatedAt: stamp });
  put('tasks', mk('cy-t1', '今天·写周报', T));
  put('tasks', mk('cy-t2', '今天·买菜', T));
  put('tasks', mk('cy-y1', '网站制作', Y));
  put('tasks', mk('cy-y2', '英语教学准备', Y));
  put('tasks', mk('cy-d1', '更早的事', D2));
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
  return { T, Y, D2 };
})()`
if (!(await waitReady())) throw new Error('应用未就绪')
const dates = await evaluate(seed, true)
await send('Page.reload', { ignoreCache: true })
await sleep(900)
if (!(await waitReady())) throw new Error('重载后未就绪')

const view = () => evaluate(`(() => {
  const rows = [...document.querySelectorAll('.cols > .panel:first-child .row .ti')].map(e => e.textContent.trim());
  return {
    title: document.querySelector('.nav h1')?.textContent?.trim(),
    count: document.querySelector('.cols > .panel:first-child .cnt')?.textContent?.trim(),
    rows,
    duplicateTitles: rows.filter((x, i) => rows.indexOf(x) !== i),
    groups: [...document.querySelectorAll('.grp .gh .l')].map(e => e.textContent.trim()),
    banner: !!document.querySelector('.banner'),
  };
})()`)
const click = (sel, nth = 0) => evaluate(`(() => { const b = document.querySelectorAll(${JSON.stringify(sel)})[${nth}]; if (!b) return false; b.click(); return true; })()`)
const menus = () => evaluate(`document.querySelectorAll('.menu').length`)
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await fs.writeFile(path.join(OUT, name), Buffer.from(r.data, 'base64'))
}

const report = { dates, views: {}, menus: {} }

// 今天：应有结转分组，计数 = 今日 2 条 + 结转 3 条
report.views.today = await view()
await shot('carryover_today.png')
// 今天 / 结转分组里点「…」只展开一个菜单
await click('.grp .row .mo', 0)
await sleep(220)
report.menus.todayCarry = await menus()
await click('.grp .row .mo', 0)
await sleep(150)

// 昨天：只应有当天 2 条，无结转分组
await click('button[aria-label="上一个"]')
await sleep(350)
report.views.yesterday = await view()
await shot('carryover_yesterday.png')
await click('.cols > .panel:first-child .row .mo', 0)
await sleep(220)
report.menus.yesterday = await menus()
await click('.cols > .panel:first-child .row .mo', 0)
await sleep(150)

// 前天：只应有当天 1 条
await click('button[aria-label="上一个"]')
await sleep(350)
report.views.twoDaysAgo = await view()

// 回到今天：结转分组与计数恢复
await click('.pager .nb', 1)
await sleep(350)
report.views.backToToday = await view()

await fs.writeFile(path.join(OUT, 'carryover-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
ws.close()
chrome.kill('SIGKILL')
