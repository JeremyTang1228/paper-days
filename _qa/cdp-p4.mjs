import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:5199/'
const PORT = 9235
const TAG = Date.now()
const PROFILE = `/tmp/pd13-p4-${TAG}`
const DL = `/tmp/pd13-downloads-${TAG}`
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')
const PHASE = process.argv[2] || 'a'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const RESTORE_BASE = process.env.RESTORE_BASE || 'http://127.0.0.1:5198/'

await fs.mkdir(OUT, { recursive: true })
await fs.mkdir(DL, { recursive: true })

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--proxy-server=http://127.0.0.1:49327', '--proxy-bypass-list=127.0.0.1;localhost',
  '--window-size=1440,1600', 'about:blank',
], { stdio: 'ignore' })

async function waitDevtools() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) return true } catch {}
    await sleep(250)
  }
  return false
}
if (!(await waitDevtools())) { chrome.kill('SIGKILL'); throw new Error('devtools not ready') }

const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
const bws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((res, rej) => { bws.onopen = res; bws.onerror = rej })
let bseq = 10000
const bpending = new Map()
bws.onmessage = (e) => {
  let m; try { m = JSON.parse(e.data) } catch { return }
  if (m.id && bpending.has(m.id)) {
    const p = bpending.get(m.id); bpending.delete(m.id)
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
  }
}
function bsend(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++bseq; bpending.set(id, { resolve, reject })
    bws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => { if (bpending.has(id)) { bpending.delete(id); reject(new Error(`timeout ${method}`)) } }, 15000)
  })
}
await bsend('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true })

async function attach(url) {
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let seq = 0
  const pending = new Map()
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data) } catch { return }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id)
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
    }
  }
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout ${method}`)) } }, 45000)
  })
  const ev = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
    return r.result.value
  }
  await send('Page.enable')
  await send('Runtime.enable')
  const navigate = async (u, waitApp = true) => {
    try { await send('Page.navigate', { url: u }) } catch (e) { console.log('nav warn:', String(e.message).slice(0, 60)) }
    await sleep(1000)
    if (waitApp) {
      for (let i = 0; i < 40; i++) {
        try { if (await ev(`!!document.querySelector('.seg button') && !!document.querySelector('.dm-t')`)) break } catch {}
        await sleep(250)
      }
    }
  }
  await navigate(url)
  return { target, ws, send, ev, navigate, close: () => ws.close() }
}

// 全类型 seed：写入独立测试 profile 的 IndexedDB，不触碰用户真实数据
const SEED = `
(async () => {
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const now = new Date();
  const T = key(now), Y = key(new Date(now.getTime() - 86400000));
  const stamp = now.toISOString(), ystamp = new Date(now.getTime() - 86400000).toISOString();
  const monday = new Date(now); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const W = key(monday), M = T.slice(0, 7);
  const db = await new Promise((res, rej) => { const r = indexedDB.open('personal-dashboard-v1-3'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const names = ['tasks','planHistory','dailyFocus','activities','journals','weeklyPlans','weeklyReflections','monthlyGoals','monthlyReflections','preferences'];
  const tx = db.transaction(names, 'readwrite');
  const put = (s, v) => tx.objectStore(s).put(v);
  put('tasks', { id:'p4a-t1', title:'P4 备份演练 · 今日首要任务', originalPlannedDate:T, currentPlannedDate:T, completedAt:null, status:'open', nextStep:'先写一句结论', createdAt:stamp, updatedAt:stamp });
  put('tasks', { id:'p4a-t2', title:'P4 备份演练 · 昨天未完成待结转', originalPlannedDate:Y, currentPlannedDate:Y, completedAt:null, status:'open', nextStep:'', createdAt:ystamp, updatedAt:ystamp });
  put('tasks', { id:'p4a-t3', title:'P4 备份演练 · 已完成并改期过', originalPlannedDate:Y, currentPlannedDate:T, completedAt:stamp, status:'open', nextStep:'', createdAt:ystamp, updatedAt:stamp });
  put('planHistory', { id:'p4a-h1', taskId:'p4a-t3', previousDate:Y, newDate:T, changedAt:stamp });
  put('dailyFocus', { date:T, taskId:'p4a-t1' });
  put('dailyFocus', { date:Y, taskId:'p4a-t2' });
  put('activities', { id:'p4a-a1', date:T, time:'09:15', content:'P4 备份演练 · 上午记录', createdAt:stamp, updatedAt:stamp });
  put('activities', { id:'p4a-a2', date:Y, time:'20:40', content:'P4 备份演练 · 昨晚记录', createdAt:ystamp, updatedAt:ystamp });
  put('journals', { date:T, content:'P4 备份演练 · 今天的感想原文，不应被改写。', updatedAt:stamp });
  put('journals', { date:Y, content:'P4 备份演练 · 昨天的感想原文。', updatedAt:ystamp });
  put('weeklyPlans', { weekStart:W, items:['P4 备份演练 · 重点一','重点二','重点三'], updatedAt:stamp });
  put('weeklyReflections', { weekStart:W, content:'P4 备份演练 · 本周总结原文。', updatedAt:stamp });
  put('monthlyGoals', { id:'p4a-g1', month:M, title:'P4 备份演练 · 月度目标', nextStep:'导出后恢复', status:'open', createdAt:stamp, updatedAt:stamp });
  put('monthlyReflections', { month:M, content:'P4 备份演练 · 月度总结原文。', updatedAt:stamp });
  put('preferences', { key:'quoteHidden', value:'0' });
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  db.close();
  return { T, Y, W, M };
})()
`

const page = await attach(BASE)
console.log('seed:', JSON.stringify(await page.ev(SEED, true)))
await page.navigate(BASE)
await sleep(700)

// ---------- P4a：点击 UI 导出 ----------
await page.ev(`document.querySelector('.dm-t').click(); true`)
await sleep(250)
const dmText = await page.ev(`document.querySelector('.dm-p').innerText`)
console.log('panel:', dmText.replace(/\n/g, ' | ').slice(0, 240))
await page.ev(`document.querySelector('.dm-b').click(); true`)

let backupFile = null
for (let i = 0; i < 40; i++) {
  const files = (await fs.readdir(DL)).filter((f) => f.endsWith('.json'))
  if (files.length) {
    const f = path.join(DL, files[0])
    const st = await fs.stat(f)
    if (st.size > 100) { backupFile = f; break }
  }
  await sleep(250)
}
if (!backupFile) throw new Error('导出文件未生成')
const raw = await fs.readFile(backupFile, 'utf8')
const bundle = JSON.parse(raw)
const d = bundle.data
const check = {
  schemaVersion: bundle.schemaVersion,
  exportedAtValid: typeof bundle.exportedAt === 'string' && !Number.isNaN(Date.parse(bundle.exportedAt)),
  hasData: !!d,
  tasks: d.tasks.length,
  planHistory: d.planHistory.length,
  focusDays: Object.keys(d.focus).length,
  activities: d.activities.length,
  journals: Object.keys(d.journals).length,
  weeklyPlans: Object.keys(d.weeklyPlans).length,
  weeklyReflections: Object.keys(d.weeklyReflections).length,
  monthlyGoals: d.monthlyGoals.length,
  monthlyReflections: Object.keys(d.monthlyReflections).length,
  hasTaskTitle: d.tasks.some((t) => t.title.includes('今日首要任务')),
  hasJournalText: Object.values(d.journals).some((v) => String(v).includes('今天的感想原文')),
  hasCarryoverTask: d.tasks.some((t) => t.id === 'p4a-t2' && t.currentPlannedDate === d.tasks.find((x) => x.id === 'p4a-t2').originalPlannedDate),
}
const p4aOK =
  check.schemaVersion === 1 && check.exportedAtValid && check.tasks === 3 &&
  check.planHistory === 1 && check.focusDays === 2 && check.activities === 2 &&
  check.journals === 2 && check.weeklyPlans === 1 && check.weeklyReflections === 1 &&
  check.monthlyGoals === 1 && check.monthlyReflections === 1 &&
  check.hasTaskTitle && check.hasJournalText && check.hasCarryoverTask
console.log('P4a export check:', JSON.stringify(check))
console.log('P4a RESULT:', p4aOK ? 'PASS' : 'FAIL')
const savedBackup = path.join(OUT, 'p4-backup.json')
await fs.writeFile(savedBackup, raw)
await fs.writeFile(path.join(OUT, 'p4a-report.json'), JSON.stringify({ check, p4aOK, savedBackup }, null, 2))

if (PHASE === 'a') {
  console.log('backup saved at:', savedBackup)
  await page.ev(`document.querySelectorAll('.seg button')[3].click(); true`).catch(() => {})
  await sleep(500)
  const shot = await page.send('Page.captureScreenshot', { format: 'png' })
  await fs.writeFile(path.join(OUT, 'p4a_review.png'), Buffer.from(shot.data, 'base64'))
  page.close(); bws.close(); chrome.kill('SIGKILL')
  process.exit(p4aOK ? 0 : 1)
}

// ---------- 共用：四视图文本、数据库快照、文件选择 ----------
async function viewText(p, tab) {
  await p.ev(`document.querySelectorAll('.seg button')[${tab}].click(); true`)
  await sleep(400)
  return p.ev(`(() => {
    const app = document.querySelector('#app');
    const vals = [...document.querySelectorAll('input,textarea')].map(e => e.value || '').join(' ');
    return (app?.innerText || '') + ' ' + vals;
  })()`)
}

async function views(p) {
  const out = {}
  for (const [name, tab] of [['day', 0], ['week', 1], ['month', 2], ['review', 3]]) {
    out[name] = (await viewText(p, tab)).replace(/\s+/g, ' ')
  }
  return out
}

function viewHits(v) {
  return {
    dayFocus: v.day.includes('P4 备份演练 · 今日首要任务'),
    dayCarryover: v.day.includes('P4 备份演练 · 昨天未完成待结转'),
    dayJournal: v.day.includes('P4 备份演练 · 今天的感想原文'),
    weekPlan: v.week.includes('P4 备份演练 · 重点一'),
    weekReflection: v.week.includes('P4 备份演练 · 本周总结原文'),
    monthGoal: v.month.includes('P4 备份演练 · 月度目标'),
    monthReflection: v.month.includes('P4 备份演练 · 月度总结原文'),
    reviewStats: v.review.includes('首要任务完成') && v.review.includes('计划任务完成'),
    reviewFocusHistory: v.review.includes('P4 备份演练 · 昨天未完成待结转'),
    reviewJournalArchive: v.review.includes('P4 备份演练 · 今天的感想原文'),
  }
}

const DB_NAMES = ['tasks', 'planHistory', 'dailyFocus', 'activities', 'journals',
  'weeklyPlans', 'weeklyReflections', 'monthlyGoals', 'monthlyReflections', 'preferences']

async function dbSnapshot(p) {
  return p.ev(`(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('personal-dashboard-v1-3');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const tx = db.transaction(${JSON.stringify(DB_NAMES)}, 'readonly');
    const rows = await Promise.all(${JSON.stringify(DB_NAMES)}.map(n => new Promise((res, rej) => {
      const q = tx.objectStore(n).getAll();
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    })));
    db.close();
    return Object.fromEntries(${JSON.stringify(DB_NAMES)}.map((n, i) => [n, rows[i]]));
  })()`, true)
}

async function chooseFile(p, filePath) {
  await p.send('DOM.enable')
  const doc = await p.send('DOM.getDocument', { depth: 1 })
  const q = await p.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' })
  if (!q.nodeId) throw new Error('找不到文件选择控件')
  await p.send('DOM.setFileInputFiles', { files: [filePath], nodeId: q.nodeId })
  await sleep(450)
}

const panelState = (p) => p.ev(`(() => {
  const warn = document.querySelector('.dm-warn');
  const err = document.querySelector('.dm-err');
  return { warn: warn?.innerText || '', err: err?.innerText || '' };
})()`)

const report = { p4a: { check, p4aOK }, checks: [], views: {}, issues: [] }
const ok = (name, cond, detail = '') => {
  report.checks.push({ name, pass: Boolean(cond), detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`)
  if (!cond) report.issues.push(name)
}

// ---------- P3：主库四视图一致性（恢复前基线） ----------
const baseViews = await views(page)
const baseHits = viewHits(baseViews)
for (const [k, v] of Object.entries(baseHits)) ok(`主库视图 ${k}`, v)
report.views.before = baseHits
const baseStats = await page.ev(`document.querySelector('.stats')?.innerText || ''`)
console.log('主库统计:', baseStats.replace(/\n/g, ' | ').slice(0, 200))
report.statsBefore = baseStats

// ---------- P4b：独立 origin（5198）恢复演练 ----------
const restore = await attach(RESTORE_BASE)
const NOISE = `
(async () => {
  const t = new Date().toISOString();
  const day = t.slice(0, 10);
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('personal-dashboard-v1-3');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = db.transaction(['tasks','journals','dailyFocus'], 'readwrite');
  tx.objectStore('tasks').put({ id:'noise-t1', title:'干扰数据 · 不应保留', originalPlannedDate:day, currentPlannedDate:day, completedAt:null, status:'open', nextStep:'', createdAt:t, updatedAt:t });
  tx.objectStore('journals').put({ date:day, content:'干扰日记 · 不应保留', updatedAt:t });
  tx.objectStore('dailyFocus').put({ date:day, taskId:'noise-t1' });
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  db.close();
  return true;
})()`
await restore.ev(NOISE, true)
await restore.navigate(RESTORE_BASE)
await sleep(500)
const noiseSnap = await dbSnapshot(restore)
ok('独立测试库已写入干扰数据', noiseSnap.tasks.some((t) => t.id === 'noise-t1'))
await restore.ev(`document.querySelector('.dm-t').click(); true`)
await sleep(250)

// 无效文件：三种格式错误，均不得改动现有数据
const badDir = path.join(OUT, 'bad-backups')
await fs.mkdir(badDir, { recursive: true })
const badFiles = {
  'broken-json.json': '{ this is not json',
  'bad-version.json': JSON.stringify({ schemaVersion: 99, exportedAt: new Date().toISOString(), data: {} }),
  'bad-structure.json': JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), data: { tasks: 'not-an-array' } }),
}
for (const [name, content] of Object.entries(badFiles)) {
  const f = path.join(badDir, name)
  await fs.writeFile(f, content)
  await chooseFile(restore, f)
  const st = await panelState(restore)
  const after = await dbSnapshot(restore)
  const unchanged = JSON.stringify(after) === JSON.stringify(noiseSnap)
  ok(`无效文件被拒绝且不改数据 · ${name}`,
    st.err.includes('备份文件无效') && !st.warn && unchanged,
    st.err.slice(0, 90))
}

// 有效备份：先显示覆盖确认，取消不得改数据
await chooseFile(restore, backupFile)
let st = await panelState(restore)
ok('恢复前显示覆盖风险确认', st.warn.includes('完整替换本机现有数据') && st.warn.includes('不可撤销'))
const beforeConfirm = await dbSnapshot(restore)
ok('未确认前不覆盖数据', JSON.stringify(beforeConfirm) === JSON.stringify(noiseSnap))
await restore.ev(`document.querySelectorAll('.dm-acts .dm-b')[1].click(); true`)
await sleep(250)
st = await panelState(restore)
const afterCancel = await dbSnapshot(restore)
ok('取消后不覆盖数据', !st.warn && JSON.stringify(afterCancel) === JSON.stringify(noiseSnap))

// 确认恢复：原子事务写入，干扰数据应被完整清除
await chooseFile(restore, backupFile)
await restore.ev(`document.querySelectorAll('.dm-acts .dm-b')[0].click(); true`)
for (let i = 0; i < 40; i++) {
  const text = await restore.ev(`document.querySelector('#toast')?.innerText || ''`)
  if (text.includes('数据已恢复')) break
  await sleep(250)
}
await sleep(600)
const restoredSnap = await dbSnapshot(restore)
const expectedCounts = {
  tasks: d.tasks.length,
  planHistory: d.planHistory.length,
  dailyFocus: Object.keys(d.focus).length,
  activities: d.activities.length,
  journals: Object.keys(d.journals).length,
  weeklyPlans: Object.keys(d.weeklyPlans).length,
  monthlyGoals: d.monthlyGoals.length,
}
const countsMatch = Object.entries(expectedCounts).every(([k, n]) => restoredSnap[k].length === n)
ok('恢复后各表记录数与备份一致', countsMatch, JSON.stringify(
  Object.fromEntries(Object.keys(expectedCounts).map((k) => [k, restoredSnap[k].length]))))
ok('干扰数据已被完整清除', !restoredSnap.tasks.some((t) => t.id === 'noise-t1') &&
  !restoredSnap.journals.some((j) => String(j.content).includes('干扰日记')))
ok('恢复后任务与感想原文一致',
  restoredSnap.tasks.some((t) => t.title === 'P4 备份演练 · 今日首要任务') &&
  restoredSnap.journals.some((j) => String(j.content).includes('今天的感想原文')))
ok('恢复后历史首要任务与计划变更保留',
  restoredSnap.dailyFocus.length === 2 && restoredSnap.planHistory.length === 1)

// 恢复后的四视图一致性与统计
await restore.ev(`document.querySelectorAll('.seg button')[0].click(); true`)
await sleep(300)
const restoredViews = await views(restore)
const restoredHits = viewHits(restoredViews)
for (const [k, v] of Object.entries(restoredHits)) ok(`恢复后视图 ${k}`, v)
report.views.after = restoredHits
const restoredStats = await restore.ev(`document.querySelector('.stats')?.innerText || ''`)
ok('恢复后统计与主库一致', restoredStats.replace(/\s+/g, ' ') === baseStats.replace(/\s+/g, ' '),
  `${baseStats.replace(/\s+/g, ' ').slice(0, 60)} vs ${restoredStats.replace(/\s+/g, ' ').slice(0, 60)}`)
report.statsAfter = restoredStats

// 截图：恢复后的 Daily 与 Review
await restore.ev(`document.querySelectorAll('.seg button')[0].click(); true`)
await sleep(350)
let shot = await restore.send('Page.captureScreenshot', { format: 'png' })
await fs.writeFile(path.join(OUT, 'p4b_restored_day.png'), Buffer.from(shot.data, 'base64'))
await restore.ev(`document.querySelectorAll('.seg button')[3].click(); true`)
await sleep(350)
shot = await restore.send('Page.captureScreenshot', { format: 'png' })
await fs.writeFile(path.join(OUT, 'p4b_restored_review.png'), Buffer.from(shot.data, 'base64'))

// ---------- 补充修复：数据加载态 ----------
await restore.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__sawLoading = false;
    window.__loadingWasClean = null;
    document.addEventListener('DOMContentLoaded', () => {
      const scan = () => {
        const l = document.querySelector('.loading');
        if (l) {
          window.__sawLoading = true;
          if (window.__loadingWasClean === null) {
            window.__loadingWasClean = !document.querySelector('.sec, .stats, .ticket');
          }
        }
      };
      new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
      scan();
    });
  `,
})
await restore.navigate(RESTORE_BASE)
await sleep(900)
const loading = await restore.ev(`({ saw: window.__sawLoading, clean: window.__loadingWasClean, gone: !document.querySelector('.loading') })`)
ok('刷新时出现轻量加载占位', loading.saw, JSON.stringify(loading))
ok('加载期间不渲染空数据视图', loading.clean === true)
ok('数据就绪后加载占位消失', loading.gone)
report.loading = loading

report.pass = report.checks.filter((c) => c.pass).length
report.total = report.checks.length
report.ok = report.issues.length === 0 && p4aOK
await fs.writeFile(path.join(OUT, 'p4b-report.json'), JSON.stringify(report, null, 2))
console.log(`\nP4b/P2/P3 浏览器验收：${report.pass}/${report.total} 通过；P4a ${p4aOK ? 'PASS' : 'FAIL'}`)
console.log('报告:', path.join(OUT, 'p4b-report.json'))
page.close(); restore.close(); bws.close(); chrome.kill('SIGKILL')
process.exit(report.ok ? 0 : 1)
