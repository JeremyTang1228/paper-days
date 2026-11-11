import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://127.0.0.1:4188/'
const PORT = 9233
const PROFILE = `/tmp/pd13-cdp-${Date.now()}`
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots')
const VIEWS = ['day', 'week', 'month', 'review']
const WIDTHS = [1440, 1024, 390]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await fs.mkdir(OUT, { recursive: true })

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--proxy-server=http://127.0.0.1:49327',
    '--proxy-bypass-list=127.0.0.1;localhost',
    '--window-size=1440,1600',
    'about:blank',
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

const tabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, {
  method: 'PUT',
})
const target = await tabRes.json()

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

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
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`timeout: ${method}`))
      }
    }, 45000)
  })
}

async function evaluate(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  })
  if (r.exceptionDetails) {
    const d = r.exceptionDetails
    throw new Error(`${d.text} :: ${d.exception?.description || JSON.stringify(d)}`)
  }
  return r.result.value
}

await send('Page.enable')
await send('Runtime.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440, height: 1600, deviceScaleFactor: 1, mobile: false,
})
await send('Page.navigate', { url: BASE })
await sleep(1800)
await evaluate('document.fonts.ready.then(() => true)', true).catch(() => {})

const preflight = await evaluate(`(() => ({
  readyState: document.readyState,
  tabs: document.querySelectorAll('.seg button').length,
  h1: document.querySelector('h1')?.textContent || '',
  appChildren: document.querySelector('#app')?.children.length || 0,
  bodyText: document.body.innerText.slice(0, 160),
}))()`)
console.log('preflight:', JSON.stringify(preflight))
const dbList = await evaluate(`indexedDB.databases ? indexedDB.databases().then(x => x.map(d => d.name + '@' + d.version)) : 'no databases API'`, true)
console.log('databases:', JSON.stringify(dbList))

// 注入一组真实形态的数据，仅用于视觉/响应式验收（写入独立测试 profile 的 IndexedDB）
const seed = `
(async () => {
  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const now = new Date();
  const T = key(now);
  const Y = key(new Date(now.getTime() - 86400000));
  const stamp = now.toISOString();
  const ystamp = new Date(now.getTime() - 86400000).toISOString();
  const monday = new Date(now); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const W = key(monday);
  const M = T.slice(0, 7);
  const db = await new Promise((res, rej) => {
    const req = indexedDB.open('personal-dashboard-v1-3');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  const names = ['tasks','planHistory','dailyFocus','activities','journals','weeklyPlans','weeklyReflections','monthlyGoals','monthlyReflections','preferences'];
  const tx = db.transaction(names, 'readwrite');
  const put = (s, v) => tx.objectStore(s).put(v);
  put('tasks', { id:'t1', title:'整理本周项目复盘要点并同步给团队', originalPlannedDate:T, currentPlannedDate:T, completedAt:null, status:'open', nextStep:'先列出三条关键结论', createdAt:stamp, updatedAt:stamp });
  put('tasks', { id:'t2', title:'给牙医打电话预约洗牙', originalPlannedDate:T, currentPlannedDate:T, completedAt:null, status:'open', nextStep:'', createdAt:stamp, updatedAt:stamp });
  put('tasks', { id:'t3', title:'把上季度的读书笔记整理归档到时间档案', originalPlannedDate:Y, currentPlannedDate:Y, completedAt:null, status:'open', nextStep:'按月份分文件夹', createdAt:ystamp, updatedAt:ystamp });
  put('tasks', { id:'t4', title:'晨间散步 30 分钟', originalPlannedDate:Y, currentPlannedDate:Y, completedAt:ystamp, status:'open', nextStep:'', createdAt:ystamp, updatedAt:ystamp });
  put('dailyFocus', { date:T, taskId:'t1' });
  put('dailyFocus', { date:Y, taskId:'t3' });
  put('activities', { id:'a1', date:T, time:'09:20', content:'列了今天最重要的三件事，先处理复盘材料', createdAt:stamp, updatedAt:stamp });
  put('activities', { id:'a2', date:T, time:'14:05', content:'和团队过了一遍时间档案的字段口径，确认历史日期不被覆盖', createdAt:stamp, updatedAt:stamp });
  put('journals', { date:T, content:'今天把计划拆得更细了一点。\\n\\n发现真正卡住我的不是任务太多，而是没有先定那一件最重要的事。写下来之后，下午的节奏明显顺了。\\n\\n明天继续保留这个习惯：早上先写票根，再打开待办。', updatedAt:stamp });
  put('journals', { date:Y, content:'昨天比较碎片化，但把读书笔记的目录理清了。', updatedAt:ystamp });
  put('weeklyPlans', { weekStart:W, items:['完成 V1.3 正式版上线','把每日感想补满一周','周末整理一次桌面资料'], updatedAt:stamp });
  put('weeklyReflections', { weekStart:W, content:'节奏比上周稳，重点是别把结转任务堆到周五。', updatedAt:stamp });
  put('monthlyGoals', { id:'g1', month:M, title:'建立可长期使用的个人时间档案', nextStep:'每天写一条感想', status:'open', createdAt:stamp, updatedAt:stamp });
  put('monthlyGoals', { id:'g2', month:M, title:'完成一次完整备份与恢复演练', nextStep:'导出 JSON 后在独立库恢复', status:'open', createdAt:stamp, updatedAt:stamp });
  put('monthlyReflections', { month:M, content:'这个月的关键词是「留下痕迹」。', updatedAt:stamp });
  await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
  db.close();
  return { today: T, yesterday: Y, week: W, month: M };
})()
`
const seeded = await evaluate(seed, true)
console.log('seed:', JSON.stringify(seeded))

const report = []
for (const width of WIDTHS) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height: width <= 390 ? 1400 : 1600, deviceScaleFactor: 1,
    mobile: width <= 390,
  })
  await send('Page.reload', { ignoreCache: false })
  await sleep(1500)
  await evaluate('document.fonts.ready.then(() => true)', true).catch(() => {})

  for (let i = 0; i < VIEWS.length; i++) {
    await evaluate(`document.querySelectorAll('.seg button')[${i}].click(); true`)
    await sleep(420)
    const check = await evaluate(`(() => {
      const de = document.documentElement;
      const vw = window.innerWidth;
      const bad = [...document.querySelectorAll('#app *')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > vw + 2; })
        .slice(0, 6)
        .map((el) => (el.className && typeof el.className === 'string' ? el.className : el.tagName) + '@' + Math.round(el.getBoundingClientRect().right));
      return {
        scrollWidth: de.scrollWidth,
        clientWidth: de.clientWidth,
        innerWidth: vw,
        offenders: bad,
        tab: document.querySelector('.seg button[aria-selected="true"]')?.textContent || '',
        hasMockSelect: !!document.querySelector('.foot select'),
        heading: document.querySelector('h1')?.textContent || '',
      };
    })()`)
    const metrics = await send('Page.getLayoutMetrics')
    const fullHeight = Math.min(Math.ceil(metrics.cssContentSize.height) + 20, 3600)
    let shot
    try {
      shot = await send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height: fullHeight, scale: 1 },
      })
    } catch {
      shot = await send('Page.captureScreenshot', { format: 'png' })
    }
    const file = path.join(OUT, `${width}_${VIEWS[i]}.png`)
    await fs.writeFile(file, Buffer.from(shot.data, 'base64'))
    const row = {
      width,
      view: VIEWS[i],
      ...check,
      overflow: check.scrollWidth > check.clientWidth + 1,
      file: path.basename(file),
      bytes: Buffer.from(shot.data, 'base64').length,
    }
    report.push(row)
    console.log(
      `${width}x ${VIEWS[i].padEnd(6)} tab=${row.tab} h1=${row.heading} ` +
      `scroll=${row.scrollWidth}/${row.clientWidth} overflow=${row.overflow} ` +
      `offenders=${JSON.stringify(row.offenders)} mockSelect=${row.hasMockSelect}`,
    )
  }
}

await fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
console.log('\nTOTAL', report.length, '| overflow cases:', report.filter((r) => r.overflow).length)
ws.close()
chrome.kill('SIGKILL')
