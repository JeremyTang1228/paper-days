/**
 * 菜单行为专项：改期 / 切换日期 / 点击外部 / 菜单项裁剪 的复现与回归。
 * 用真实鼠标事件（Input.dispatchMouseEvent）而不是 el.click()，
 * 才能触发 document 上的 pointerdown 外部点击监听。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:4188/'
const PORT = 9244
const PROFILE = `/tmp/pd13-menu-behavior-${Date.now()}`
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
  put('tasks', mk('bh-today', '今天的事', T));
  put('tasks', mk('bh-old-a', '网站制作', D2));
  put('tasks', mk('bh-old-b', '英语教学准备', Y));
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
  return { T, Y, D2 };
})()`
if (!(await waitReady())) throw new Error('应用未就绪')
const dates = await evaluate(seed, true)
await send('Page.reload', { ignoreCache: true })
await sleep(900)
if (!(await waitReady())) throw new Error('重载后未就绪')

/** 真实鼠标点击：先滚动到可见，再取中心坐标派发 mousePressed / mouseReleased */
async function realClick(selector, nth = 0) {
  const box = await evaluate(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = els[${nth}];
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`)
  if (!box) throw new Error(`找不到元素 ${selector}[${nth}]`)
  await sleep(120)
  const p = await evaluate(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const r = els[${nth}].getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await sleep(260)
}
const menus = () => evaluate(`document.querySelectorAll('.menu').length`)
const menuTexts = () => evaluate(`[...document.querySelectorAll('.menu button, .menu label')].map(e => e.textContent.trim())`)
const openFirstMo = async () => { await realClick('.row .mo', 0); }

async function reset() {
  await send('Page.reload', { ignoreCache: false })
  await sleep(700)
  if (!(await waitReady())) throw new Error('场景重载后未就绪')
}
const report = { dates, checks: {} }

// 1) 菜单项清单（优化 2 的目标：不含「改到下周一」「选择日期」，其余 5 项保持）
await reset()
await openFirstMo()
report.checks.menuItems = await menuTexts()
report.checks.menuOpened = await menus()
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await fs.writeFile(path.join(OUT, 'menu_5items.png'), Buffer.from(shot.data, 'base64'))

// 2) 点击外部是否自动关闭
await reset()
await openFirstMo()
const beforeOutside = await menus()
await realClick('.nav h1')
report.checks.outsideClick = { before: beforeOutside, after: await menus() }

// 3) 切换浏览日期后是否关闭；再切回来是否会「幽灵复现」
await reset()
await openFirstMo()
const beforeDateChange = await menus()
await realClick('button[aria-label="上一个"]')
const afterPrev = await menus()
await realClick('button[aria-label="下一个"]')
const afterBack = await menus()
report.checks.dateChange = { before: beforeDateChange, afterPrev, afterBack }

// 4) 切换视图后是否关闭
await reset()
await openFirstMo()
const beforeTab = await menus()
await realClick('.seg button', 1)
const afterWeek = await menus()
report.checks.viewChange = { before: beforeTab, afterWeek }

// 5) 「改到明天」动作后菜单是否关闭
await reset()
await openFirstMo()
const beforeReschedule = await menus()
await realClick('.menu button', 2) // 设为今日首要 / 最小行动… / 改到明天
await sleep(400)
report.checks.reschedule = { before: beforeReschedule, after: await menus() }

// 6) 选择日期（若仍存在）：改成今天后菜单是否关闭
await reset()
await openFirstMo()
const dateInput = await evaluate(`!!document.querySelector('.menu input[type="date"]')`)
if (dateInput) {
  const changed = await evaluate(`(() => {
    const el = document.querySelector('.menu input[type="date"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(dates.T)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  })()`)
  await sleep(500)
  report.checks.datePicker = { value: changed, after: await menus() }
} else {
  report.checks.datePicker = { removed: true, note: '按要求隐藏，无此控件' }
}

// 7) 点击菜单内部不应被外部点击逻辑误关；切到「最小行动」子菜单仍可用
await reset()
await openFirstMo()
await realClick('.menu button', 1) // 最小行动…
report.checks.insideClick = {
  menuCount: await menus(),
  stepInput: await evaluate(`!!document.querySelector('.menu input[aria-label="最小行动"]')`),
}

// 8) 点另一行的「…」应直接切换菜单，而不是被关掉后打不开
await reset()
await openFirstMo()
await realClick('.row .mo', 1)
report.checks.switchRow = {
  menuCount: await menus(),
  expandedRows: await evaluate(`[...document.querySelectorAll('.row .mo')].filter(b => b.getAttribute('aria-expanded') === 'true').length`),
}

await fs.writeFile(path.join(OUT, 'menu-behavior-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
ws.close()
chrome.kill('SIGKILL')
