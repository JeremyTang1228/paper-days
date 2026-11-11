/**
 * 一次性构建配置（仅用于 WorkBuddy 沙箱内生成 dist）。
 * 该环境对单个命令有约 2 分钟的文件访问通道限制，Vite 逐个读取
 * lucide-react 上千个图标文件会超时。这里先只打包实际用到的 4 个图标，
 * 再把裸模块名指向该精简文件；源码与常规 vite.config.ts 均不改。
 * 用户本地终端直接 `npm run build` 无需此文件。
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ICONS = path.join(ROOT, 'node_modules/lucide-react/dist/esm/icons')
const MIN = path.join(ROOT, '_qa/_lucide-min.js')

await build({
  stdin: {
    contents: `
      export { default as Sparkles } from '${ICONS}/sparkles.js'
      export { default as Check } from '${ICONS}/check.js'
      export { default as ChevronLeft } from '${ICONS}/chevron-left.js'
      export { default as ChevronRight } from '${ICONS}/chevron-right.js'
    `,
    resolveDir: ROOT,
    sourcefile: 'lucide-min-entry.js',
    loader: 'js',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: MIN,
  external: ['react', 'react/jsx-runtime'],
  logLevel: 'silent',
})

export default defineConfig({
  root: ROOT,
  plugins: [react()],
  resolve: { alias: [{ find: /^lucide-react$/, replacement: MIN }] },
  build: { outDir: 'dist', sourcemap: false, emptyOutDir: true },
})
