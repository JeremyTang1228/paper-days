/**
 * 复现 / 回归：浏览历史日期时，同一任务被「待办」与「历史结转」重复渲染，
 * 菜单状态仅按 task.id 匹配 → 点击任一「…」会同时展开多个菜单。
 * 只读产品代码；用独立 Chrome profile 注入数据后统计展开的菜单数量。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:4188/'
const PORT = 9243
const PROFILE = `/tmp/pd13-repro-menu-${Date.now()}`
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')
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
      const ok = await evaluate(`document.querySelectorAll('.seg button').length === 4 && !document.querySelector('.loading') && !!document.querySelector('input[aria-label="添加任务"]')`)
      if (ok) return true
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
  const Y = key(new Date(now.getTime() - 86400000));
  const stamp = now.toISOString();
  const db = await new Promise((res, rej) => {
    const req = indexedDB.open('personal-dashboard-v1-3');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const names = ['tasks','planHistory','dailyFocus','activities','journals','weeklyPlans','weeklyReflections','monthlyGoals','monthlyReflections','preferences'];
  const tx = db.transaction(names, 'readwrite');
  for (const n of names) tx.objectStore(n).clear();
  const put = (s, v) => tx.objectStore(s).put(v);
  const mk = (id, title) => ({ id, title, originalPlannedDate: Y, currentPlannedDate: Y, completedAt: null, status: 'open', nextStep: '', createdAt: stamp, updatedAt: stamp });
  put('tasks', mk('repro-a', '网站制作'));
  put('tasks', mk('repro-b', '英语教学准备'));
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
  return Y;
})()`
if (!(await waitReady())) throw new Error('应用未就绪')
await evaluate(seed, true)
await send('Page.reload', { ignoreCache: true })
await sleep(900)
if (!(await waitReady())) throw new Error('重载后未就绪')

// 切到昨天
await evaluate(`document.querySelector('button[aria-label="上一个"]').click()`)
await sleep(500)

const before = await evaluate(`(() => ({
  title: document.querySelector('.nav h1')?.textContent,
  rows: [...document.querySelectorAll('.row')].map(r => r.querySelector('.ti')?.textContent?.trim()),
  groups: [...document.querySelectorAll('.grp .gh .l')].map(e => e.textContent),
  menus: document.querySelectorAll('.menu').length,
}))()`)

const results = []
const rowCount = await evaluate(`document.querySelectorAll('.row .mo').length`)
for (let i = 0; i < rowCount; i++) {
  await evaluate(`document.querySelectorAll('.row .mo')[${i}].click()`)
  await sleep(180)
  const r = await evaluate(`(() => ({
    clickedRow: [...document.querySelectorAll('.row')].findIndex(r => r.querySelector('.mo')?.getAttribute('aria-expanded') === 'true'),
    menuCount: document.querySelectorAll('.menu').length,
    menusIn: [...document.querySelectorAll('.menu')].map(m => ({
      row: m.closest('.row')?.querySelector('.ti')?.textContent?.trim(),
      group: m.closest('.grp') ? '历史结转' : '待办',
    })),
  }))()`)
  results.push({ clickIndex: i, ...r })
  await evaluate(`document.querySelectorAll('.row .mo')[${i}].click()`)
  await sleep(120)
}

// 视觉留档：修复后点击第一行「…」只展开一个菜单
await evaluate(`document.querySelectorAll('.row .mo')[0].click()`)
await sleep(300)
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await fs.writeFile(path.join(OUT, 'fix_menu_yesterday.png'), Buffer.from(shot.data, 'base64'))
await evaluate(`document.querySelectorAll('.row .mo')[0].click()`)
await sleep(150)

// 回归：今日首要卡片里的「拆成更小的一步 / 调整执行日期」同样只展开一个菜单
await evaluate(`
(async () => {
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const T = key(new Date());
  const db = await new Promise((res, rej) => {
    const req = indexedDB.open('personal-dashboard-v1-3');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const tx = db.transaction('dailyFocus', 'readwrite');
  tx.objectStore('dailyFocus').put({ date: T, taskId: 'repro-a' });
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
})()`, true)
await send('Page.reload', { ignoreCache: true })
await sleep(900)
if (!(await waitReady())) throw new Error('二次重载后未就绪')
const focus = []
const hd = await evaluate(`!!document.querySelector('.focus .hd')`)
if (!hd) throw new Error('未找到「暂时难以开始？」按钮')
await evaluate(`document.querySelector('.focus .hd').click()`)
await sleep(200)
for (const label of ['调整执行日期', '拆成更小的一步']) {
  await evaluate(`[...document.querySelectorAll('.focus .hard button')].find(b => b.textContent.includes(${JSON.stringify(label)})).click()`)
  await sleep(200)
  focus.push({
    label,
    menuCount: await evaluate(`document.querySelectorAll('.menu').length`),
    menusInFocus: await evaluate(`document.querySelectorAll('.focus .menu').length`),
    hasStepInput: await evaluate(`!!document.querySelector('.menu input[aria-label="最小行动"]')`),
  })
}

const report = {
  before,
  results,
  focus,
  expectAfterFix: '结转只在今天显示后，历史日期不再重复渲染同一任务；每个三点按钮仍只展开 1 个菜单，首要卡片同理',
}
await fs.writeFile(path.join(OUT, 'repro-menu-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
ws.close()
chrome.kill('SIGKILL')
