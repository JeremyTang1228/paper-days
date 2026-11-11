/**
 * 「调整执行日期」专项 QA：
 * 期望：点首要卡片里的「调整执行日期」只弹出一个可点击的月历，点某天即改期并收起。
 * 同时回归：外部点击 / 切换日期 / 切换视图收起、窄屏不被遮挡、行菜单保持 5 项不变。
 * 用真实鼠标事件（Input.dispatchMouseEvent）触发 document 的 pointerdown 监听。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:4188/'
const PORT = 9246
const PROFILE = `/tmp/pd13-date-popup-${Date.now()}`
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
  await evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})][${nth}];
    if (!el) return false;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    return true;
  })()`)
  await sleep(120)
  const p = await evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})][${nth}];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`)
  if (!p) throw new Error(`找不到元素 ${selector}[${nth}]`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await sleep(260)
}
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
async function reset(withSeed = false) {
  await send('Page.reload', { ignoreCache: false })
  await sleep(700)
  if (!(await waitReady())) throw new Error('场景重载后未就绪')
  if (withSeed) {
    // 每个场景都回到「今天有一条首要任务」的干净状态，避免上一场景改期影响后续
    await evaluate(seed, true)
    await send('Page.reload', { ignoreCache: false })
    await sleep(700)
    if (!(await waitReady())) throw new Error('播种重载后未就绪')
  }
}
const menus = () => evaluate(`document.querySelectorAll('.menu').length`)

await send('Page.enable')
await send('Runtime.enable')
await sleep(1000)

const seed = `
(async () => {
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const now = new Date(); const T = key(now); const stamp = now.toISOString();
  const db = await new Promise((res, rej) => {
    const req = indexedDB.open('personal-dashboard-v1-3');
    req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
  });
  const names = ['tasks','planHistory','dailyFocus','activities','journals','weeklyPlans','weeklyReflections','monthlyGoals','monthlyReflections','preferences'];
  const tx = db.transaction(names, 'readwrite');
  for (const n of names) tx.objectStore(n).clear();
  const put = (s, v) => tx.objectStore(s).put(v);
  const mk = (id, title, day) => ({ id, title, originalPlannedDate: day, currentPlannedDate: day, completedAt: null, status: 'open', nextStep: '', createdAt: stamp, updatedAt: stamp });
  put('tasks', mk('dp-focus', '首要任务：写周报', T));
  put('tasks', mk('dp-other', '另一件小事', T));
  put('dailyFocus', { date: T, taskId: 'dp-focus' });
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
  return { T };
})()`
if (!(await waitReady())) throw new Error('应用未就绪')
const dates = await evaluate(seed, true)
await reset()

async function openCalendar() {
  await reset(true)
  await realClick('.focus .hd')
  const idx = await evaluate(`[...document.querySelectorAll('.focus .hard button')].findIndex(b => b.textContent.includes('调整执行日期'))`)
  if (idx < 0) throw new Error('未找到「调整执行日期」按钮')
  await realClick('.focus .hard button', idx)
}
const popupState = () => evaluate(`(() => {
  const m = document.querySelector('.focus .menu');
  if (!m) return { menuCount: 0 };
  const r = m.getBoundingClientRect();
  return {
    menuCount: document.querySelectorAll('.menu').length,
    isCalendar: m.classList.contains('calpop'),
    texts: [...m.querySelectorAll('button')].map(b => b.textContent.trim()).slice(0, 8),
    dayCount: m.querySelectorAll('[data-date]').length,
    month: m.querySelector('.calpick .ch strong')?.textContent || null,
    todayCells: [...m.querySelectorAll('[data-date].today')].map(e => e.dataset.date),
    curCells: [...m.querySelectorAll('[data-date].cur')].map(e => e.dataset.date),
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right) },
  };
})()`)

const report = { dates, checks: {} }

// 0) 弹层形态基线 / 结果
await openCalendar()
report.checks.popup = await popupState()
const shotName = report.checks.popup.isCalendar ? 'datepopup_1440.png' : 'datepopup_baseline.png'
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await fs.writeFile(path.join(OUT, shotName), Buffer.from(shot.data, 'base64'))
report.checks.popup.screenshot = shotName

if (report.checks.popup.isCalendar) {
  // 1) 月份导航
  const beforeMonth = report.checks.popup.month
  await realClick('.calpick .ch button', 1)
  const nextMonth = await evaluate(`document.querySelector('.calpick .ch strong')?.textContent`)
  await realClick('.calpick .ch button', 0)
  const backMonth = await evaluate(`document.querySelector('.calpick .ch strong')?.textContent`)
  report.checks.monthNav = { beforeMonth, nextMonth, backMonth, stillOpen: await menus() }

  // 2) 点击具体某一天：改期 + 收起 + 落库
  // 选当月里早于今天的一天：首要任务改期后仍留在今天视图，后续场景才可继续
  let pick = await evaluate(`(() => {
    const t = ${JSON.stringify(dates.T)};
    const past = [...document.querySelectorAll('.calpick [data-date]')]
      .map(e => e.dataset.date).filter(d => d < t);
    return past[past.length - 1] || null;
  })()`)
  if (!pick) {
    await realClick('.calpick .ch button', 0)
    pick = await evaluate(`[...document.querySelectorAll('.calpick [data-date]')].pop()?.dataset.date`)
  }
  await realClick(`[data-date="${pick}"]`)
  await sleep(500)
  const dbDate = await evaluate(`(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('personal-dashboard-v1-3'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const t = await new Promise((res, rej) => { const r = db.transaction('tasks').objectStore('tasks').get('dp-focus'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    db.close(); return t.currentPlannedDate;
  })()`, true)
  report.checks.pickDate = {
    targetDate: pick,
    dbDate,
    menusAfter: await menus(),
    toast: await evaluate(`document.querySelector('#toast')?.textContent || ''`),
  }

  // 3) 外部点击收起
  await openCalendar()
  const beforeOutside = await menus()
  await realClick('.nav h1')
  report.checks.outsideClick = { before: beforeOutside, after: await menus() }

  // 4) 再点一次同一个按钮：收起（toggle）
  await openCalendar()
  const beforeToggle = await menus()
  const toggleIdx = await evaluate(`[...document.querySelectorAll('.focus .hard button')].findIndex(b => b.textContent.includes('调整执行日期'))`)
  await realClick('.focus .hard button', toggleIdx)
  report.checks.toggle = { before: beforeToggle, after: await menus() }

  // 5) 切换日期 / 视图收起
  await openCalendar()
  const beforeDate = await menus()
  await realClick('button[aria-label="上一个"]')
  report.checks.dateChange = { before: beforeDate, after: await menus() }

  await openCalendar()
  const beforeView = await menus()
  await realClick('.seg button', 1)
  report.checks.viewChange = { before: beforeView, after: await menus() }

  // 6) 行「…」菜单仍是 5 项、不含日历
  await reset(true)
  await realClick('.row .mo', 0)
  report.checks.rowMenu = {
    texts: await evaluate(`[...document.querySelectorAll('.menu button')].map(b => b.textContent.trim())`),
    hasCalendar: await evaluate(`!!document.querySelector('.menu.calpop')`),
  }

  // 7) 窄屏遮挡检测：1440 / 390 两档，对所有日期格做命中测试
  for (const width of [1440, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: width <= 390 ? 844 : 1200, deviceScaleFactor: 1, mobile: width <= 390 })
    await openCalendar()
    await sleep(900)
    await evaluate(`(() => { const m = document.querySelector('.menu.calpop'); if (m) m.scrollIntoView({ block: 'center' }); return true })()`)
    await sleep(220)
    const probe = await evaluate(`(() => {
      const m = document.querySelector('.menu.calpop');
      if (!m) return { error: '未找到日历' };
      const r = m.getBoundingClientRect();
      const cells = [...m.querySelectorAll('[data-date]')];
      const hits = cells.map((el) => {
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { date: el.dataset.date, inside: !!hit && (hit === m || m.contains(hit)), hit: hit ? (typeof hit.className === 'string' && hit.className ? hit.className : hit.tagName) : null };
      });
      return {
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        viewport: { w: innerWidth, h: innerHeight },
        cells: cells.length,
        blocked: hits.filter(h => !h.inside),
        offRight: r.right > innerWidth + 1,
        offBottom: r.bottom > innerHeight + 1,
      };
    })()`)
    const file = path.join(OUT, `datepopup_${width}.png`)
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await fs.writeFile(file, Buffer.from(s.data, 'base64'))
    report.checks[`clip_${width}`] = { ...probe, screenshot: path.basename(file) }
  }
  await send('Emulation.clearDeviceMetricsOverride')

  const a = report.checks
  report.assertions = {
    popupIsCalendar: a.popup.isCalendar && a.popup.dayCount >= 28 && !a.popup.texts.includes('设为今日首要'),
    popupOnlyOne: a.popup.menuCount === 1,
    monthNavWorks: a.monthNav.nextMonth !== a.monthNav.beforeMonth && a.monthNav.backMonth === a.monthNav.beforeMonth && a.monthNav.stillOpen === 1,
    pickDatePersists: a.pickDate.dbDate === a.pickDate.targetDate && a.pickDate.menusAfter === 0 && a.pickDate.toast.includes('已改期到'),
    outsideCloses: a.outsideClick.before === 1 && a.outsideClick.after === 0,
    toggleCloses: a.toggle.before === 1 && a.toggle.after === 0,
    dateChangeCloses: a.dateChange.before === 1 && a.dateChange.after === 0,
    viewChangeCloses: a.viewChange.before === 1 && a.viewChange.after === 0,
    rowMenuUnchanged: a.rowMenu.texts.length === 5 && !a.rowMenu.hasCalendar,
    noClip1440: a.clip_1440.blocked.length === 0 && !a.clip_1440.offRight,
    noClip390: a.clip_390.blocked.length === 0 && !a.clip_390.offRight,
  }
  report.passAll = Object.values(report.assertions).every(Boolean)
}

await fs.writeFile(path.join(OUT, 'date-popup-report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
ws.close()
chrome.kill('SIGKILL')
