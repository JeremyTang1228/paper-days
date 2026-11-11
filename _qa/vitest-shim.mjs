/**
 * 轻量 vitest 兼容层（仅用于本沙箱环境执行已有的 *.test.ts）。
 * 正常开发环境仍使用 `npm test` → vitest；此文件不参与生产构建。
 */
import assert from 'node:assert/strict'

const suites = (globalThis.__PD_TEST_SUITES__ ||= [])
let current = null

function ensureSuite() {
  if (!current) {
    current = { name: '(root)', tests: [] }
    suites.push(current)
  }
  return current
}

export function describe(name, fn) {
  const parent = current
  const suite = { name, tests: [] }
  suites.push(suite)
  current = suite
  try {
    fn()
  } finally {
    current = parent
  }
}

export function it(name, fn) {
  ensureSuite().tests.push({ name, fn })
}
export const test = it
export const beforeEach = () => {}
export const afterEach = () => {}
export const beforeAll = () => {}
export const afterAll = () => {}
export const vi = {
  fn: () => () => undefined,
  useFakeTimers: () => {},
  useRealTimers: () => {},
  setSystemTime: () => {},
}

const fmt = (v) => {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function expect(actual) {
  return {
    toBe: (expected) => assert.strictEqual(actual, expected),
    toEqual: (expected) => assert.deepStrictEqual(actual, expected),
    toHaveLength: (n) => assert.strictEqual(actual?.length, n, `期望长度 ${n}，实际 ${fmt(actual)}`),
    toBeGreaterThan: (n) => assert.ok(actual > n, `期望 ${fmt(actual)} > ${n}`),
    toBeGreaterThanOrEqual: (n) => assert.ok(actual >= n, `期望 ${fmt(actual)} >= ${n}`),
    toBeLessThan: (n) => assert.ok(actual < n, `期望 ${fmt(actual)} < ${n}`),
    toBeLessThanOrEqual: (n) => assert.ok(actual <= n, `期望 ${fmt(actual)} <= ${n}`),
    toContain: (v) => assert.ok(actual?.includes?.(v), `期望 ${fmt(actual)} 含 ${fmt(v)}`),
    toBeTruthy: () => assert.ok(actual, `期望真值，实际 ${fmt(actual)}`),
    toBeFalsy: () => assert.ok(!actual, `期望假值，实际 ${fmt(actual)}`),
    toBeNull: () => assert.strictEqual(actual, null),
    toBeUndefined: () => assert.strictEqual(actual, undefined),
    toThrow: () => assert.throws(actual),
  }
}
