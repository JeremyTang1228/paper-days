/**
 * 本地单元测试执行器：用项目自带 esbuild 把已有 vitest 测试文件打包成 ESM，
 * 再以 Node 原生 assert 执行。规避本沙箱中 vitest worker 池无法启动的问题。
 * 生产代码与测试源码均不改动。
 */
import { build } from 'esbuild'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const shim = path.join(here, 'vitest-shim.mjs')
const outFile = path.join(here, '_tests.bundle.mjs')

const stdin = {
  contents: `
    import '../src/lib/dates.test.ts'
    import '../src/lib/selectors.test.ts'
  `,
  resolveDir: here,
  sourcefile: 'tests.entry.ts',
  loader: 'ts',
}

const result = await build({
  stdin,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  outfile: outFile,
  external: ['date-fns', 'node:*'],
  logLevel: 'silent',
  plugins: [
    {
      name: 'vitest-shim',
      setup(b) {
        b.onResolve({ filter: /^vitest$/ }, () => ({ path: shim }))
      },
    },
  ],
})

await writeFile(outFile, result.outputFiles[0].contents)
await import(pathToFileURL(outFile).href + `?t=${Date.now()}`)

const suites = globalThis.__PD_TEST_SUITES__ ?? []
const results = []
let pass = 0
let fail = 0

for (const suite of suites) {
  for (const t of suite.tests) {
    try {
      await t.fn()
      pass += 1
      results.push({ suite: suite.name, name: t.name, ok: true })
      console.log(`  PASS  ${t.name}`)
    } catch (e) {
      fail += 1
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ suite: suite.name, name: t.name, ok: false, error: msg })
      console.log(`  FAIL  ${t.name}\n        ${msg.split('\n').slice(0, 4).join('\n        ')}`)
    }
  }
}

const report = {
  runner: 'esbuild + node:assert (vitest worker pool unavailable in sandbox)',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  ranAt: new Date().toISOString(),
  total: pass + fail,
  pass,
  fail,
  results,
}
await writeFile(path.join(here, 'unit-report.json'), JSON.stringify(report, null, 2))
console.log(`\n单元测试：${pass} 通过 / ${fail} 失败 / 共 ${report.total} 项（时区 ${report.timezone}）`)
process.exit(fail > 0 ? 1 : 0)
