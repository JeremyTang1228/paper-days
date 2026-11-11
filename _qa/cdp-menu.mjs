/**
 * 下拉 / 弹出菜单遮挡专项检查（只读，不改产品代码）
 * 用独立 Chrome profile，注入测试数据后逐个打开菜单：
 *  - 命中测试 elementFromPoint：菜单内采样点是否真的落在菜单上
 *  - 祖先链诊断：谁创建了层叠上下文、谁用 overflow 裁切了菜单
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:4188/'
const PORT = 9242
const PROFILE = `/tmp/pd13-menu-${Date.now()}`
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
  if (r.exceptionDetails) {
    const d = r.exceptionDetails
    throw new Error(`${d.text} :: ${d.exception?.description || JSON.stringify(d)}`)
  }
  return r.result.value
}

await send('Page.enable')
await send('Runtime.enable')
await sleep(1200)

async function waitReady(timeoutMs = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const ok = await evaluate(
        `document.querySelectorAll('.seg button').length === 4 && !document.querySelector('.loading') && !!document.querySelector('input[aria-label="添加任务"]')`,
      )
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
  const T = key(now);
  const Y = key(new Date(now.getTime() - 86400000));
  const stamp = now.toISOString();
  const ystamp = new Date(now.getTime() - 86400000).toISOString();
  const db = await new Promise((res, rej) => {
    const req = indexedDB.open('personal-dashboard-v1-3');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const names = ['tasks','planHistory','dailyFocus','activities','journals','weeklyPlans','weeklyReflections','monthlyGoals','monthlyReflections','preferences'];
  const tx = db.transaction(names, 'readwrite');
  const put = (s, v) => tx.objectStore(s).put(v);
  put('tasks', { id:'m1', title:'英语 Reading', originalPlannedDate:T, currentPlannedDate:T, completedAt:null, status:'open', nextStep:'', createdAt:stamp, updatedAt:stamp });
  put('tasks', { id:'m2', title:'儿子数学练习', originalPlannedDate:T, currentPlannedDate:T, completedAt:null, status:'open', nextStep:'', createdAt:stamp, updatedAt:stamp });
  put('tasks', { id:'m3', title:'整理上周读书笔记', originalPlannedDate:Y, currentPlannedDate:Y, completedAt:null, status:'open', nextStep:'', createdAt:ystamp, updatedAt:ystamp });
  put('tasks', { id:'m4', title:'晨间散步 30 分钟', originalPlannedDate:Y, currentPlannedDate:Y, completedAt:ystamp, status:'open', nextStep:'', createdAt:ystamp, updatedAt:ystamp });
  put('activities', { id:'a1', date:T, time:'09:20', content:'列了今天最重要的三件事', createdAt:stamp, updatedAt:stamp });
  put('journals', { date:T, content:'今天把计划拆得更细了一点。', updatedAt:stamp });
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  db.close();
  return { today: T, yesterday: Y };
})()
`

// 必须先让应用自己建好带表的 IndexedDB，再注入数据
console.log('initial ready:', await waitReady())
await evaluate(seed, true)
console.log('seed ok:', JSON.stringify(await evaluate(`(() => ({ t: new Date().toISOString() }))()`)))

const probe = `(() => {
  const menu = document.querySelector('.menu');
  if (!menu) return { error: '菜单未打开' };
  const r = menu.getBoundingClientRect();
  const cs = getComputedStyle(menu);
  const items = [...menu.querySelectorAll('button,label,input')];
  const pts = [
    ['顶部', r.left + r.width / 2, r.top + 8],
    ['中部', r.left + r.width / 2, r.top + r.height / 2],
    ['底部', r.left + r.width / 2, r.bottom - 8],
  ];
  for (const el of items) {
    const ir = el.getBoundingClientRect();
    if (ir.width < 2 || ir.height < 2) continue;
    const label = (el.tagName.toLowerCase() + ':' + (el.textContent || el.getAttribute('aria-label') || el.type || '')).replace(/\\s+/g, ' ').trim().slice(0, 22);
    pts.push([label, ir.left + ir.width / 2, ir.top + ir.height / 2]);
  }
  const hits = pts.map(([name, x, y]) => {
    const el = document.elementFromPoint(x, y);
    const inside = !!el && (el === menu || menu.contains(el));
    const cls = el ? (typeof el.className === 'string' && el.className ? el.className : el.tagName) : null;
    const blocker = el ? (el.closest('section,.note,.panel,.col,.foot')?.className || '') : '';
    return { name, x: Math.round(x), y: Math.round(y), inside, hit: cls, blocker };
  });
  const chain = [];
  let p = menu.parentElement;
  while (p && chain.length < 14) {
    const s = getComputedStyle(p);
    const pr = p.getBoundingClientRect();
    chain.push({
      el: (typeof p.className === 'string' && p.className ? p.className : p.tagName),
      zIndex: s.zIndex, position: s.position,
      transform: s.transform, opacity: s.opacity,
      animation: s.animationName, fill: s.animationFillMode,
      isolation: s.isolation, willChange: s.willChange, filter: s.filter,
      overflowX: s.overflowX, overflowY: s.overflowY,
      clipsBottom: s.overflowY !== 'visible' && r.bottom > pr.bottom + 1,
      clipsRight: s.overflowX !== 'visible' && r.right > pr.right + 1,
    });
    p = p.parentElement;
  }
  return {
    rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right) },
    viewport: { w: innerWidth, h: innerHeight },
    scroll: { y: Math.round(scrollY), height: document.documentElement.scrollHeight, max: document.documentElement.scrollHeight - innerHeight },
    menuZ: cs.zIndex,
    itemCount: items.length,
    hits,
    blocked: hits.filter((h) => !h.inside),
    chain,
    clippedBy: chain.filter((c) => c.clipsBottom || c.clipsRight).map((c) => c.el),
    offViewportBottom: r.bottom > innerHeight + 1,
    offViewportRight: r.right > innerWidth + 1,
  };
})()`

const SCENES = [
  { id: 'day1440-todo',  width: 1440, height: 1200, view: 0, sel: '.cols > .panel:first-child .row .mo', label: '每日 / 待办第一条 / 1440' },
  { id: 'day1440-carry', width: 1440, height: 1200, view: 0, sel: '.grp .row .mo', label: '每日 / 历史结转 / 1440' },
  { id: 'day390-todo',   width: 390,  height: 844,  view: 0, sel: '.cols > .panel:first-child .row .mo', label: '每日 / 待办第一条 / 390' },
  { id: 'day390-carry',  width: 390,  height: 844,  view: 0, sel: '.grp .row .mo', label: '每日 / 历史结转 / 390' },
  { id: 'week1440',      width: 1440, height: 1200, view: 1, sel: '.dt .row .mo', label: '每周 / 某天任务 / 1440' },
  { id: 'week390',       width: 390,  height: 844,  view: 1, sel: '.dt .row .mo', label: '每周 / 某天任务 / 390' },
]

const results = []
for (const s of SCENES) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: s.width, height: s.height, deviceScaleFactor: 1, mobile: s.width <= 390,
  })
  await send('Page.reload', { ignoreCache: false })
  const ready = await waitReady()
  if (!ready) { results.push({ ...s, error: '应用未就绪' }); continue }
  await evaluate('document.fonts.ready.then(() => true)', true).catch(() => {})
  if (s.view !== 0) {
    await evaluate(`document.querySelectorAll('.seg button')[${s.view}].click(); true`)
    await sleep(400)
  }
  const opened = await evaluate(`(() => {
    const btn = document.querySelector(${JSON.stringify(s.sel)});
    if (!btn) return false;
    btn.click();
    return true;
  })()`)
  // 等 .fx 入场动画（含 320ms 错峰 + 360ms 时长）彻底结束，避免把动画期的临时层叠误判为持久遮挡
  await sleep(1100)
  // 把菜单滚动进视口，区分「被别的元素盖住」与「只是在屏幕下方需要滚动」
  await evaluate(`(() => {
    const m = document.querySelector('.menu');
    if (m) m.scrollIntoView({ block: 'center' });
    return true;
  })()`)
  await sleep(220)
  const m = opened ? await evaluate(probe) : { error: '未找到触发按钮' }
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = path.join(OUT, `menu_${s.id}.png`)
  await fs.writeFile(file, Buffer.from(shot.data, 'base64'))
  const row = { ...s, ...m, file: path.basename(file) }
  results.push(row)
  if (m.error) {
    console.log(`${s.label.padEnd(26)} | ERROR ${m.error}`)
  } else {
    console.log(
      `${s.label.padEnd(26)} | 菜单 ${m.rect.w}x${m.rect.h} @(${m.rect.x},${m.rect.y}) | ` +
      `被挡采样点 ${m.blocked.length}/${m.hits.length} | 裁切祖先 ${JSON.stringify(m.clippedBy)} | ` +
      `超出视口 bottom=${m.offViewportBottom} right=${m.offViewportRight}`,
    )
    if (m.blocked.length) {
      console.log('   挡住的元素：', m.blocked.map((b) => `${b.name}→${b.hit}@${b.blocker}`).join(' | '))
    }
  }
}

// ---------- 全量：逐个打开当前视图里所有三点菜单触发点 ----------
const ALL_VIEWS = [
  { view: 0, width: 1440, height: 1200, name: '每日 1440' },
  { view: 0, width: 390, height: 844, name: '每日 390' },
  { view: 1, width: 1440, height: 1200, name: '每周 1440' },
  { view: 1, width: 390, height: 844, name: '每周 390' },
]
const all = []
for (const v of ALL_VIEWS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: v.width, height: v.height, deviceScaleFactor: 1, mobile: v.width <= 390,
  })
  await send('Page.reload', { ignoreCache: false })
  await waitReady()
  await sleep(1000)
  if (v.view !== 0) {
    await evaluate(`document.querySelectorAll('.seg button')[${v.view}].click(); true`)
    await sleep(350)
  }
  const count = await evaluate(`document.querySelectorAll('.mo').length`)
  for (let i = 0; i < count; i++) {
    await evaluate(`document.querySelectorAll('.mo')[${i}].click(); true`)
    await sleep(140)
    // 若上一步恰好把同一个菜单关掉了，再点一次打开
    if (!(await evaluate(`!!document.querySelector('.menu')`))) {
      await evaluate(`document.querySelectorAll('.mo')[${i}].click(); true`)
      await sleep(140)
    }
    await evaluate(`(() => { const m = document.querySelector('.menu'); if (m) m.scrollIntoView({ block: 'center' }); return true; })()`)
    await sleep(160)
    const m = await evaluate(probe)
    const row = { view: v.name, index: i, triggers: count, blocked: (m.blocked || []).length, points: (m.hits || []).length, clippedBy: m.clippedBy || [], error: m.error || null }
    all.push(row)
    console.log(`全量 ${v.name.padEnd(9)} 第${i + 1}/${count}个菜单 | 被挡 ${row.blocked}/${row.points} | 裁切 ${JSON.stringify(row.clippedBy)}`)
  }
  // 子菜单「最小行动…」
  await evaluate(`(() => {
    const b = document.querySelector('.mo');
    if (b && !document.querySelector('.menu')) b.click();
    return true;
  })()`)
  await sleep(160)
  const subOpened = await evaluate(`(() => {
    const b = [...document.querySelectorAll('.menu button')].find(x => x.textContent.includes('最小行动'));
    if (!b) return false;
    b.click();
    return true;
  })()`)
  await sleep(200)
  if (subOpened) {
    await evaluate(`(() => { const m = document.querySelector('.menu'); if (m) m.scrollIntoView({ block: 'center' }); return true; })()`)
    await sleep(150)
    const m = await evaluate(probe)
    const row = { view: v.name, index: '子菜单', triggers: count, blocked: (m.blocked || []).length, points: (m.hits || []).length, clippedBy: m.clippedBy || [], error: m.error || null }
    all.push(row)
    console.log(`全量 ${v.name.padEnd(9)} 子菜单     | 被挡 ${row.blocked}/${row.points} | 裁切 ${JSON.stringify(row.clippedBy)}`)
  }
  // 页脚「数据管理」展开面板（普通文档流，检查展开后是否被后续元素覆盖）
  const dm = await evaluate(`(() => {
    const t = document.querySelector('.dm-t');
    if (!t) return { error: 'no dm-t' };
    t.click();
    return { ok: true };
  })()`)
  await sleep(180)
  const dmHit = await evaluate(`(() => {
    const p = document.querySelector('.dm-p');
    if (!p) return { error: 'no panel' };
    p.scrollIntoView({ block: 'center' });
    const r = p.getBoundingClientRect();
    const pts = [[r.left + r.width / 2, r.top + 12], [r.left + r.width / 2, r.bottom - 12]];
    const inside = pts.map(([x, y]) => { const el = document.elementFromPoint(x, y); return !!el && (el === p || p.contains(el)); });
    return { height: Math.round(r.height), inside };
  })()`)
  const dmRow = { view: v.name, index: '数据管理面板', ...dmHit }
  all.push(dmRow)
  console.log(`全量 ${v.name.padEnd(9)} 数据管理   | ${JSON.stringify(dmHit)}`)
}

const totalBlocked = all.reduce((n, r) => n + (r.blocked || 0), 0)
const totalClipped = all.filter((r) => (r.clippedBy || []).length).length
console.log(`\n全量汇总：${all.length} 项检查 | 被挡采样点合计 ${totalBlocked} | 裁切项 ${totalClipped}`)
await fs.writeFile(path.join(OUT, 'menu-report.json'), JSON.stringify({ sample: results, all, totalBlocked, totalClipped }, null, 2))
console.log('报告：', path.join(OUT, 'menu-report.json'))
ws.close()
chrome.kill('SIGKILL')
if (totalBlocked !== 0 || totalClipped !== 0) process.exitCode = 1
