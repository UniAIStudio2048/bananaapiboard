/**
 * workflowSocket 单元测试：用 FakeWebSocket 模拟连接/消息/断线/重连
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { createWorkflowSocket } from './workflowSocket.js'

// ---------- Fake WebSocket ----------
class FakeWebSocket {
  static instances = []
  constructor(url) {
    this.url = url
    this.readyState = 0 // CONNECTING
    this.sent = []
    this.onopen = null
    this.onmessage = null
    this.onclose = null
    this.onerror = null
    FakeWebSocket.instances.push(this)
  }
  send(data) {
    this.sent.push(data)
  }
  close(code, reason) {
    if (this.readyState === 3) return
    this.readyState = 3
    if (typeof this.onclose === 'function') {
      this.onclose({ code: code || 1000, reason: reason || '' })
    }
  }
  // 测试驱动用：手动触发事件
  _open() {
    this.readyState = 1
    if (this.onopen) this.onopen({})
  }
  _msg(data) {
    if (this.onmessage) this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) })
  }
  _serverClose(code = 1006) {
    this.readyState = 3
    if (this.onclose) this.onclose({ code, reason: 'server_close' })
  }
}

function reset() { FakeWebSocket.instances = [] }

test.beforeEach(reset)

test('connect: 构造正确 URL，包含 token / clientId', () => {
  const s = createWorkflowSocket({
    workflowId: 'wf-1',
    baseUrl: 'ws://localhost:5000',
    getToken: () => 'session-xyz',
    clientId: 'cli-7',
    WebSocketImpl: FakeWebSocket,
    autoReconnect: false
  })
  s.connect()
  assert.equal(FakeWebSocket.instances.length, 1)
  const ws = FakeWebSocket.instances[0]
  assert.match(ws.url, /^ws:\/\/localhost:5000\/ws\/canvas\/workflow\/wf-1\?/)
  assert.match(ws.url, /token=session-xyz/)
  assert.match(ws.url, /clientId=cli-7/)
  s.disconnect()
})

test('open: 触发状态变化、心跳启动并刷新接收超时', () => {
  const states = []
  const s = createWorkflowSocket({
    workflowId: 'wf-1',
    baseUrl: 'ws://h',
    getToken: () => 't',
    WebSocketImpl: FakeWebSocket,
    onStateChange: (st) => states.push(st),
    heartbeatMs: 50,
    receiveTimeoutMs: 500,
    autoReconnect: false
  })
  s.connect()
  const ws = FakeWebSocket.instances[0]
  ws._open()
  assert.deepEqual(states, ['connecting', 'open'])
  s.disconnect()
})

test('onOps / onNodePatched / onHello 正确解码消息', () => {
  const events = []
  const s = createWorkflowSocket({
    workflowId: 'wf-1',
    baseUrl: 'ws://h',
    getToken: () => 't',
    WebSocketImpl: FakeWebSocket,
    onHello: p => events.push(['hello', p]),
    onOps: (ops, from) => events.push(['ops', ops, from]),
    onNodePatched: (id, node, v, from) => events.push(['patched', id, node, v, from]),
    autoReconnect: false
  })
  s.connect()
  const ws = FakeWebSocket.instances[0]
  ws._open()
  ws._msg({ type: 'hello', payload: { workflowId: 'wf-1', version: 3 } })
  ws._msg({ type: 'ops', payload: { ops: [{ op: 'add', target: 'node' }], fromClient: 'X' } })
  ws._msg({ type: 'node_patched', payload: { nodeId: 'n1', node: { id: 'n1' }, version: 8, fromClient: 'Y' } })

  assert.equal(events.length, 3)
  assert.equal(events[0][0], 'hello')
  assert.equal(events[0][1].version, 3)
  assert.equal(events[1][0], 'ops')
  assert.equal(events[1][1].length, 1)
  assert.equal(events[1][2], 'X')
  assert.equal(events[2][0], 'patched')
  assert.equal(events[2][1], 'n1')
  assert.equal(events[2][3], 8)
  s.disconnect()
})

test('未知 type / 非法 JSON 不会抛错', () => {
  const s = createWorkflowSocket({
    workflowId: 'wf-1',
    baseUrl: 'ws://h',
    getToken: () => 't',
    WebSocketImpl: FakeWebSocket,
    autoReconnect: false
  })
  s.connect()
  const ws = FakeWebSocket.instances[0]
  ws._open()
  ws._msg('not-json-at-all')
  ws._msg({ type: 'unknown_future' })
  // 没抛异常就算通过
  s.disconnect()
})

test('重连：onClose 后按指数退避调度，再次连接时 backoff 翻倍', async () => {
  const s = createWorkflowSocket({
    workflowId: 'wf-1',
    baseUrl: 'ws://h',
    getToken: () => 't',
    WebSocketImpl: FakeWebSocket,
    backoffInitialMs: 10,
    backoffMaxMs: 80,
    autoReconnect: true
  })
  s.connect()
  const ws1 = FakeWebSocket.instances[0]
  ws1._serverClose(1006)

  // 等待第一次重连
  await new Promise(r => setTimeout(r, 25))
  assert.equal(FakeWebSocket.instances.length, 2, '应已发起第二次连接')
  assert.equal(s.__test__.backoffMs, 20, 'backoff 应翻倍到 20ms')

  const ws2 = FakeWebSocket.instances[1]
  ws2._serverClose(1006)
  await new Promise(r => setTimeout(r, 35))
  assert.equal(FakeWebSocket.instances.length, 3, '应已发起第三次连接')
  assert.equal(s.__test__.backoffMs, 40, 'backoff 应翻倍到 40ms')
  s.disconnect()
})

test('鉴权错误 4001/4003 不会重连', async () => {
  const errors = []
  const s = createWorkflowSocket({
    workflowId: 'wf-1',
    baseUrl: 'ws://h',
    getToken: () => 't',
    WebSocketImpl: FakeWebSocket,
    backoffInitialMs: 5,
    onError: e => errors.push(e.message),
    autoReconnect: true
  })
  s.connect()
  const ws1 = FakeWebSocket.instances[0]
  ws1._serverClose(4003)
  await new Promise(r => setTimeout(r, 30))
  assert.equal(FakeWebSocket.instances.length, 1, '鉴权错误不应重连')
  assert.ok(errors.some(m => m.includes('auth_failed')), '应发出 auth_failed 错误')
  s.disconnect()
})

test('onResync：仅在「再次 open」时触发（首次 open 不触发）', async () => {
  let resyncCount = 0
  const s = createWorkflowSocket({
    workflowId: 'wf-1',
    baseUrl: 'ws://h',
    getToken: () => 't',
    WebSocketImpl: FakeWebSocket,
    backoffInitialMs: 5,
    onResync: () => { resyncCount += 1 },
    autoReconnect: true
  })
  s.connect()
  const ws1 = FakeWebSocket.instances[0]
  ws1._open()
  assert.equal(resyncCount, 0, '首次 open 不应触发 resync')

  ws1._serverClose(1006)
  await new Promise(r => setTimeout(r, 20))
  const ws2 = FakeWebSocket.instances[1]
  ws2._open()
  assert.equal(resyncCount, 1, '重连成功 open 应触发 resync')
  s.disconnect()
})

test('disconnect: 不再重连，状态进入 closed', async () => {
  const s = createWorkflowSocket({
    workflowId: 'wf-1',
    baseUrl: 'ws://h',
    getToken: () => 't',
    WebSocketImpl: FakeWebSocket,
    backoffInitialMs: 5,
    autoReconnect: true
  })
  s.connect()
  const ws1 = FakeWebSocket.instances[0]
  ws1._open()
  s.disconnect()
  await new Promise(r => setTimeout(r, 20))
  assert.equal(FakeWebSocket.instances.length, 1, 'disconnect 后不应再发起新连接')
  assert.equal(s.state, 'closed')
})

test('心跳：周期性发送 ping', async () => {
  const s = createWorkflowSocket({
    workflowId: 'wf-1',
    baseUrl: 'ws://h',
    getToken: () => 't',
    WebSocketImpl: FakeWebSocket,
    heartbeatMs: 100,         // 已被实现 clamp 到 100ms 最小值
    receiveTimeoutMs: 10000,
    autoReconnect: false
  })
  s.connect()
  const ws = FakeWebSocket.instances[0]
  ws._open()
  await new Promise(r => setTimeout(r, 350))
  const pings = ws.sent.filter(d => /"type":"ping"/.test(d))
  assert.ok(pings.length >= 2, `应发出 >=2 次 ping，实际 ${pings.length}`)
  s.disconnect()
})

test('接收超时：长时间无消息触发重连', async () => {
  const s = createWorkflowSocket({
    workflowId: 'wf-1',
    baseUrl: 'ws://h',
    getToken: () => 't',
    WebSocketImpl: FakeWebSocket,
    heartbeatMs: 100,
    receiveTimeoutMs: 200,
    backoffInitialMs: 5,
    autoReconnect: true
  })
  s.connect()
  const ws1 = FakeWebSocket.instances[0]
  ws1._open()
  await new Promise(r => setTimeout(r, 300))
  assert.ok(FakeWebSocket.instances.length >= 2, '应已发起重连')
  s.disconnect()
})

test('sendAck: 在 open 状态下发送 ack 消息', () => {
  const s = createWorkflowSocket({
    workflowId: 'wf-1',
    baseUrl: 'ws://h',
    getToken: () => 't',
    WebSocketImpl: FakeWebSocket,
    autoReconnect: false
  })
  s.connect()
  const ws = FakeWebSocket.instances[0]
  ws._open()
  const ok = s.sendAck(42)
  assert.equal(ok, true)
  const decoded = JSON.parse(ws.sent[0])
  assert.equal(decoded.type, 'ack')
  assert.equal(decoded.payload.version, 42)
  s.disconnect()
})
