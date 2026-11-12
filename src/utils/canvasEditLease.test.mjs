import test from 'node:test'
import assert from 'node:assert/strict'
import { createEditLeaseClient, getCanvasSessionId, LEASE_SESSION_STORAGE_KEY } from './canvasEditLease.js'

function makeClient(responses = {}) {
  const calls = []
  const request = async (path, options = {}) => {
    calls.push({ path, ...options })
    const key = Object.keys(responses).find(k => path.endsWith(k))
    const value = typeof responses[key] === 'function' ? responses[key](options) : responses[key]
    return value || { ok: true, status: 200, data: {} }
  }
  const client = createEditLeaseClient({
    request,
    getSessionId: () => 'sess-1',
    getBeaconAuth: () => ({ 'X-Tenant-ID': 't-1', Authorization: 'Bearer tok' })
  })
  return { client, calls }
}

test('会话标识：同一 storage 内稳定复用，缺失时生成', () => {
  const store = new Map()
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  const first = getCanvasSessionId(storage)
  assert.ok(first)
  assert.equal(getCanvasSessionId(storage), first)
  assert.equal(store.get(LEASE_SESSION_STORAGE_KEY), first)
})

test('acquire 成功：编辑模式并在请求头中带令牌', async () => {
  const { client, calls } = makeClient({ '/lease/acquire': { ok: true, status: 200, data: { mode: 'editor', token: 5, holder: { device: 'Chrome · macOS' } } } })
  await client.acquire('wf-1')
  assert.equal(calls[0].path, '/api/canvas/workflows/wf-1/lease/acquire')
  assert.equal(calls[0].headers['X-Canvas-Session-Id'], 'sess-1')
  assert.equal(client.getState('wf-1').mode, 'editor')
  assert.equal(client.isReadonly('wf-1'), false)
  assert.deepEqual(client.getLeaseHeaders('wf-1'), { 'X-Canvas-Session-Id': 'sess-1', 'X-Canvas-Lease-Token': '5' })
})

test('acquire 被他人持有：只读并记录持有者，请求头不带令牌', async () => {
  const { client } = makeClient({ '/lease/acquire': { ok: true, status: 200, data: { mode: 'readonly', holder: { userName: '张三', device: 'Safari · iOS' } } } })
  await client.acquire('wf-1')
  const state = client.getState('wf-1')
  assert.equal(state.mode, 'readonly')
  assert.equal(state.reason, 'held')
  assert.equal(state.holder.userName, '张三')
  assert.equal(client.isReadonly('wf-1'), true)
  assert.deepEqual(client.getLeaseHeaders('wf-1'), { 'X-Canvas-Session-Id': 'sess-1' })
})

test('acquire 请求失败：降级为未知状态，不进入只读', async () => {
  const { client } = makeClient({ '/lease/acquire': { ok: false, status: 500, data: { error: 'boom' } } })
  await client.acquire('wf-1')
  assert.equal(client.getState('wf-1').mode, 'unknown')
  assert.equal(client.isReadonly('wf-1'), false)
  assert.deepEqual(client.getLeaseHeaders('wf-1'), { 'X-Canvas-Session-Id': 'sess-1' })
})

test('takeover：成功后成为编辑者，并返回是否从只读转为编辑', async () => {
  const { client } = makeClient({
    '/lease/acquire': { ok: true, status: 200, data: { mode: 'readonly', holder: { device: 'A' } } },
    '/lease/takeover': { ok: true, status: 200, data: { mode: 'editor', token: 9, holder: { device: 'B' } } }
  })
  await client.acquire('wf-1')
  const result = await client.takeover('wf-1')
  assert.equal(result.mode, 'editor')
  assert.equal(result.becameEditor, true)
  assert.equal(client.getState('wf-1').token, 9)
})

test('lease_changed：更大的令牌表示被抢占，切为只读并记录抢占人', async () => {
  const { client } = makeClient({ '/lease/acquire': { ok: true, status: 200, data: { mode: 'editor', token: 3 } } })
  await client.acquire('wf-1')
  client.applyLeaseChanged('wf-1', { token: 3, holder: { device: 'self' } })
  assert.equal(client.getState('wf-1').mode, 'editor', '自己的广播不应改变状态')
  const kicked = client.applyLeaseChanged('wf-1', { token: 4, holder: { userName: '李四', device: 'Edge · Windows' } })
  assert.equal(kicked, true)
  const state = client.getState('wf-1')
  assert.equal(state.mode, 'readonly')
  assert.equal(state.reason, 'taken')
  assert.equal(state.holder.userName, '李四')
})

test('lease_changed：只读方收到释放或新持有者时更新提示', async () => {
  const { client } = makeClient({ '/lease/acquire': { ok: true, status: 200, data: { mode: 'readonly', holder: { device: 'A' } } } })
  await client.acquire('wf-1')
  client.applyLeaseChanged('wf-1', { token: 6, holder: null })
  assert.equal(client.getState('wf-1').reason, 'free')
  assert.equal(client.getState('wf-1').holder, null)
  client.applyLeaseChanged('wf-1', { token: 7, holder: { device: 'C' } })
  assert.equal(client.getState('wf-1').reason, 'held')
  assert.equal(client.getState('wf-1').holder.device, 'C')
})

test('lease_changed：获取或抢占进行中时忽略广播，以接口结果为准', async () => {
  let resolveTakeover
  const { client } = makeClient({
    '/lease/takeover': () => new Promise(resolve => { resolveTakeover = resolve })
  })
  const pending = client.takeover('wf-1')
  client.applyLeaseChanged('wf-1', { token: 2, holder: { device: 'self' } })
  assert.equal(client.getState('wf-1').mode, 'pending')
  resolveTakeover({ ok: true, status: 200, data: { mode: 'editor', token: 2 } })
  await pending
  assert.equal(client.getState('wf-1').mode, 'editor')
})

test('markLost：保存被拒（编辑权已转移）时切为只读', () => {
  const { client } = makeClient()
  client.markLost('wf-1', { device: 'X' }, 'edit_lease_lost')
  assert.equal(client.getState('wf-1').mode, 'readonly')
  assert.equal(client.getState('wf-1').reason, 'taken')
  client.markLost('wf-2', { device: 'Y' }, 'edit_lease_held')
  assert.equal(client.getState('wf-2').reason, 'held')
})

test('markLost：迟到的旧请求拒绝不覆盖已获得的编辑权', async () => {
  const { client } = makeClient({ '/lease/takeover': { ok: true, status: 200, data: { mode: 'editor', token: 7 } } })
  await client.takeover('wf-1')
  // 抢占前未带令牌发出的写入在抢占完成后才返回 409
  assert.equal(client.markLost('wf-1', { device: 'Chrome · Windows' }, 'edit_lease_held', null), false)
  assert.equal(client.getState('wf-1').mode, 'editor')
  // 携带旧令牌的写入被拒同样忽略
  assert.equal(client.markLost('wf-1', null, 'edit_lease_lost', 6), false)
  assert.equal(client.getState('wf-1').mode, 'editor')
  // 携带当前令牌的写入被拒：确实失去编辑权
  assert.equal(client.markLost('wf-1', null, 'edit_lease_lost', 7), true)
  assert.equal(client.getState('wf-1').mode, 'readonly')
})

test('markLost：获取或抢占进行中时忽略，以接口结果为准', async () => {
  let resolveTakeover
  const { client } = makeClient({ '/lease/takeover': () => new Promise(resolve => { resolveTakeover = resolve }) })
  const pending = client.takeover('wf-1')
  assert.equal(client.getState('wf-1').mode, 'pending')
  assert.equal(client.markLost('wf-1', { device: 'X' }, 'edit_lease_held', null), false)
  resolveTakeover({ ok: true, status: 200, data: { mode: 'editor', token: 3 } })
  await pending
  assert.equal(client.getState('wf-1').mode, 'editor')
})

test('yield 与 release：带会话与令牌；release 使用 keepalive 并在 body 携带鉴权', async () => {
  const { client, calls } = makeClient({ '/lease/acquire': { ok: true, status: 200, data: { mode: 'editor', token: 11 } } })
  await client.acquire('wf-1')
  await client.yieldLease('wf-1')
  const yieldCall = calls.find(c => c.path.endsWith('/lease/yield'))
  assert.equal(yieldCall.headers['X-Canvas-Lease-Token'], '11')
  client.release('wf-1')
  const releaseCall = calls.find(c => c.path.endsWith('/lease/release-beacon'))
  assert.equal(releaseCall.keepalive, true)
  assert.deepEqual(releaseCall.body, {
    leaseSessionId: 'sess-1',
    leaseToken: 11,
    _headers: { 'X-Tenant-ID': 't-1', Authorization: 'Bearer tok' }
  })
  assert.equal(client.getState('wf-1').mode, 'released')
})

test('release：非编辑状态不发请求', () => {
  const { client, calls } = makeClient()
  client.release('wf-1')
  assert.equal(calls.length, 0)
})

test('heartbeat：只续期编辑中的工作流，丢失后只读且不自动获取', async () => {
  let acquireCount = 0
  const { client, calls } = makeClient({
    '/lease/acquire': () => ({ ok: true, status: 200, data: { mode: 'editor', token: ++acquireCount } }),
    '/leases/heartbeat': { ok: true, status: 200, data: { renewed: ['wf-1'], lost: ['wf-2'] } }
  })
  await client.acquire('wf-1')
  await client.acquire('wf-2')
  await client.heartbeat()
  const hb = calls.find(c => c.path === '/api/canvas/leases/heartbeat')
  assert.deepEqual(hb.body.workflowIds.sort(), ['wf-1', 'wf-2'])
  assert.equal(calls.filter(c => c.path.endsWith('/wf-2/lease/acquire')).length, 1)
  assert.equal(client.getState('wf-2').mode, 'readonly')
})

const editorResponse = token => ({ ok: true, status: 200, data: { mode: 'editor', token } })

test('并发 acquire 复用同一请求，避免同会话占位租约被误判为他人持有', async () => {
  let finish
  const { client, calls } = makeClient({ '/lease/acquire': () => new Promise(resolve => { finish = resolve }) })
  const first = client.acquire('wf-1')
  const second = client.acquire('wf-1')
  assert.equal(calls.length, 1)
  finish(editorResponse(1))
  await Promise.all([first, second])
  assert.equal(client.getState('wf-1').mode, 'editor')
})

test('获取期间关闭工作流：迟到的成功结果必须释放，不能留下幽灵租约', async () => {
  let finish
  const { client, calls } = makeClient({ '/lease/acquire': () => new Promise(resolve => { finish = resolve }) })
  const pending = client.acquire('wf-1')
  client.release('wf-1')
  finish(editorResponse(7))
  await pending
  assert.equal(client.getState('wf-1').mode, 'released')
  const release = calls.find(c => c.path.endsWith('/release-beacon'))
  assert.equal(release?.body.leaseToken, 7)
})

test('关闭后立即重开：等待旧释放完成，防止迟到释放删除重入租约', async () => {
  let finishRelease
  const { client, calls } = makeClient({
    '/lease/acquire': editorResponse(1),
    '/release-beacon': () => new Promise(resolve => { finishRelease = resolve })
  })
  await client.acquire('wf-1')
  client.release('wf-1')
  const reopened = client.acquire('wf-1')
  assert.equal(calls.filter(c => c.path.endsWith('/acquire')).length, 1)
  finishRelease({ ok: true, data: { released: true } })
  await reopened
  assert.equal(client.getState('wf-1').mode, 'editor')
  assert.equal(calls.filter(c => c.path.endsWith('/acquire')).length, 2)
})

for (const action of ['takeover', 'release', 'broadcast']) {
  test(`迟到的心跳丢锁结果不覆盖之后的 ${action}`, async () => {
    let finish
    const { client, calls } = makeClient({
      '/lease/acquire': editorResponse(1),
      '/lease/takeover': editorResponse(2),
      '/leases/heartbeat': () => new Promise(resolve => { finish = resolve })
    })
    await client.acquire('wf-1')
    const pending = client.heartbeat()
    if (action === 'takeover') await client.takeover('wf-1')
    if (action === 'release') client.release('wf-1')
    if (action === 'broadcast') client.applyLeaseChanged('wf-1', { token: 2, holder: { device: 'B' } })
    const expected = { ...client.getState('wf-1') }
    finish({ ok: true, data: { lost: ['wf-1'] } })
    await pending
    assert.deepEqual(client.getState('wf-1'), expected)
    assert.equal(calls.filter(c => c.path.endsWith('/acquire')).length, 1)
  })
}

test('关闭、重开后再次关闭：等待释放期间取消的申请不会再发出', async () => {
  let finishRelease
  const { client, calls } = makeClient({
    '/lease/acquire': editorResponse(1),
    '/release-beacon': () => new Promise(resolve => { finishRelease = resolve })
  })
  await client.acquire('wf-1')
  client.release('wf-1')
  const reopened = client.acquire('wf-1')
  client.release('wf-1')
  finishRelease({ ok: true, data: { released: true } })
  await reopened
  assert.equal(client.getState('wf-1').mode, 'released')
  assert.equal(calls.filter(c => c.path.endsWith('/acquire')).length, 1)
})

test('申请未完成时关闭、重开再关闭：排队的新申请也必须取消', async () => {
  let finish
  const { client, calls } = makeClient({ '/lease/acquire': () => new Promise(resolve => { finish = resolve }) })
  const first = client.acquire('wf-1')
  client.release('wf-1')
  const reopened = client.acquire('wf-1')
  client.release('wf-1')
  finish(editorResponse(7))
  await first
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(calls.filter(c => c.path.endsWith('/acquire')).length, 1)
  await reopened
  assert.equal(client.getState('wf-1').mode, 'released')
})
