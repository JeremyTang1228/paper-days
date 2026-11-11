import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:4188/'
const PORT = 9234
const PROFILE = `/tmp/pd13-p1-${Date.now()}`
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const TITLE = 'P1 持久化验收 · 刷新后我依然存在'
const JOURNAL = '这是一段用于验证自动保存的每日感想。\n\n第二行也要完整保留，刷新与关闭重开后都不应该丢失。'

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

const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  let m; try { m = JSON.parse(ev.data) } catch { return }
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id)
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result)
  }
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout ${method}`)) } }, 45000)
  })
}
async function ev(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
/** 等 React 挂载；expectData=true 时还要等 Dexie 异步快照回填完成，避免把加载延迟误判成数据丢失 */
async function waitReady(expectData = false, timeoutMs = 12000) {
  const t0 = Date.now()
  const expr = `(() => {
    if (!document.querySelector('.seg button') || !document.querySelector('input[aria-label="添加任务"]')) return false;
    const ta = document.querySelector('textarea[placeholder^="今天的想法"]');
    if (!ta) return false;
    if (!${expectData}) return true;
    return document.querySelectorAll('.row').length > 0 && (ta.value || '').length > 0;
  })()`
  while (Date.now() - t0 < timeoutMs) {
    try { if (await ev(expr)) return true } catch {}
    await sleep(250)
  }
  return false
}

async function load(url, expectData = false) {
  try {
    await send('Page.navigate', { url })
  } catch (e) {
    console.log('navigate warning:', String(e.message).slice(0, 80))
  }
  await sleep(900)
  if (url === BASE) {
    console.log('app ready:', await waitReady(expectData))
  }
  await ev('document.fonts.ready.then(() => true)', true).catch(() => {})
}

await send('Page.enable')
await send('Runtime.enable')
await load(BASE)

// 1) 通过真实 UI 新增任务
console.log('add task ->', await ev(`(() => {
  const el = document.querySelector('input[aria-label="添加任务"]');
  if (!el) return 'MISSING INPUT';
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  s.call(el, ${JSON.stringify(TITLE)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  return 'submitted';
})()`))
await sleep(900)
const afterAdd = await ev(`(() => ({
  found: [...document.querySelectorAll('.row .ti')].some(e => e.textContent.includes(${JSON.stringify(TITLE)})),
  rows: document.querySelectorAll('.row').length,
  toast: document.querySelector('#toast')?.textContent || '',
}))()`)
console.log('after add:', JSON.stringify(afterAdd))

// 2) 勾选完成
console.log('toggle done ->', await ev(`(() => {
  const row = [...document.querySelectorAll('.row')].find(r => r.querySelector('.ti')?.textContent?.includes(${JSON.stringify(TITLE)}));
  if (!row) return 'MISSING ROW';
  row.querySelector('.ck').click();
  return 'clicked';
})()`))
await sleep(800)

// 3) 编辑每日感想（自动保存，以持久化成功为准）
console.log('journal ->', await ev(`(() => {
  const el = document.querySelector('textarea[placeholder^="今天的想法"]');
  if (!el) return 'MISSING TEXTAREA';
  const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  s.call(el, ${JSON.stringify(JOURNAL)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return 'typed';
})()`))
await sleep(1600)
const saveState = await ev(`(() => ({ state: document.querySelector('.sv')?.getAttribute('data-state'), label: document.querySelector('.sv')?.textContent }))()`)
console.log('save indicator:', JSON.stringify(saveState))

function verifyExpr() {
  return `(() => {
    const row = [...document.querySelectorAll('.row')].find(r => r.querySelector('.ti')?.textContent?.includes(${JSON.stringify(TITLE)}));
    const ta = document.querySelector('textarea[placeholder^="今天的想法"]');
    return {
      taskFound: !!row,
      taskDone: !!row && (row.classList.contains('done') || row.querySelector('.ck')?.getAttribute('aria-pressed') === 'true'),
      journalMatch: ta?.value === ${JSON.stringify(JOURNAL)},
      journalLen: ta?.value?.length || 0,
      tab: document.querySelector('.seg button[aria-selected="true"]')?.textContent || '',
      h1: document.querySelector('h1')?.textContent || '',
      textareas: document.querySelectorAll('textarea').length,
      rows: document.querySelectorAll('.row').length,
      bodyStart: document.body.innerText.slice(0, 200),
      ls: JSON.stringify(Object.entries(localStorage)),
    };
  })()`
}

// 4) 刷新
await send('Page.reload')
console.log('app ready after reload:', await waitReady(true))
const afterReload = await ev(verifyExpr())
console.log('after reload:', JSON.stringify(afterReload))

// 5) 页面完全卸载后重新打开
await load('about:blank')
await load(BASE, true)
const afterReopen = await ev(verifyExpr())
console.log('after full reopen:', JSON.stringify(afterReopen))

// 6) 四个视图共用同一份数据：回顾页应出现这段感想
await ev(`document.querySelectorAll('.seg button')[3].click(); true`)
await sleep(700)
const shared = await ev(`(() => ({
  reviewHasJournal: document.body.innerText.includes(${JSON.stringify('第二行也要完整保留')}),
  reviewHasTask: document.body.innerText.includes(${JSON.stringify(TITLE)}),
  h1: document.querySelector('h1')?.textContent || '',
}))()`)
console.log('shared data (review):', JSON.stringify(shared))

const shot = await send('Page.captureScreenshot', { format: 'png' })
await fs.writeFile(path.join(OUT, 'p1_review_after_reopen.png'), Buffer.from(shot.data, 'base64'))

const ok =
  afterAdd.found && afterReload.taskFound && afterReload.taskDone &&
  afterReload.journalMatch && afterReopen.taskFound && afterReopen.taskDone &&
  afterReopen.journalMatch && shared.reviewHasJournal
console.log('\nP1 RESULT:', ok ? 'PASS' : 'FAIL')
await fs.writeFile(path.join(OUT, 'p1-report.json'), JSON.stringify({ TITLE, JOURNAL, afterAdd, saveState, afterReload, afterReopen, shared, ok }, null, 2))
ws.close()
chrome.kill('SIGKILL')
