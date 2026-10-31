import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./history.js', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../../components/canvas/HistoryPanel.vue', import.meta.url), 'utf8')
test('retention request uses tenant/auth headers, bypasses cache, and preserves zero', async () => {
  const start = source.indexOf('export async function getHistoryRetention(')
  const end = source.indexOf('\nfunction getHistoryPageLimit(', start)
  assert.ok(start >= 0 && end > start)
  const calls = []
  let response = { ok: true, json: async () => ({ retentionDays: 0 }) }
  const get = new Function('fetch', 'getApiUrl', 'getAuthHeaders', `${source.slice(start, end).replace('export ', '')}; return getHistoryRetention`)(
    async (...args) => { calls.push(args); return response }, path => path, () => ({ Authorization: 'Bearer test', 'X-Tenant-ID': 'tenant' })
  )
  assert.equal(await get(), 0)
  assert.equal(calls[0][0], '/api/history/retention')
  assert.equal(calls[0][1].cache, 'no-store')
  assert.equal(calls[0][1].headers['X-Tenant-ID'], 'tenant')
  response = { ok: true, json: async () => ({ retentionDays: 30 }) }
  assert.equal(await get(), 30)
  response = { ok: false }
  await assert.rejects(get(), /获取历史记录保留期限失败/)
})
test('history footer and empty state display configured days or permanent retention', () => {
  const expression = panel.slice(panel.indexOf('const retentionHint = computed('), panel.indexOf('\nwatch(() => props.visible'))
  const render = value => new Function('computed', 'retentionDays', `${expression}; return retentionHint`)(fn => fn(), { value })
  assert.equal(render(30), '历史记录保留 30 天')
  assert.equal(render(3), '历史记录保留 3 天')
  assert.equal(render(0), '历史记录永久保留')
  assert.equal(render(null), '')
  assert.equal((panel.match(/\{\{ retentionHint \}\}/g) || []).length, 2)
})
