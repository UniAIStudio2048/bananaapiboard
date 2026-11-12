import test from 'node:test'
import assert from 'node:assert/strict'
import { ref, reactive, nextTick } from 'vue'
import { useCanvasEditLease } from './useCanvasEditLease.js'

function makeLease(initial = {}) {
  const states = reactive({ ...initial })
  const calls = []
  const results = { acquire: {}, takeover: {} }
  return {
    states, calls, results,
    getState: id => states[id] || null,
    async acquire(id) {
      calls.push(['acquire', id])
      const prev = states[id]
      states[id] = results.acquire[id] || { mode: 'editor', token: 1 }
      return { ...states[id], becameEditor: states[id].mode === 'editor' && prev?.mode !== 'editor' }
    },
    async takeover(id) {
      calls.push(['takeover', id])
      states[id] = results.takeover[id] || { mode: 'editor', token: 2 }
      return states[id]
    },
    async yieldLease(id) { calls.push(['yield', id]); return true },
    release(id) { calls.push(['release', id]); if (states[id]?.mode === 'editor') states[id] = { mode: 'released' } },
    async heartbeat() { calls.push(['heartbeat']) },
    applyLeaseChanged(id, payload) {
      calls.push(['leaseChanged', id])
      if (states[id]?.mode === 'editor' && payload.token > states[id].token) {
        states[id] = { mode: 'readonly', reason: 'taken', holder: payload.holder }
        return true
      }
      return false
    }
  }
}

function makeEnv() {
  const listeners = {}
  const target = { addEventListener: (n, fn) => { listeners[n] = fn }, removeEventListener: n => { delete listeners[n] } }
  const doc = { visibilityState: 'visible', addEventListener: (n, fn) => { listeners[`doc:${n}`] = fn }, removeEventListener: n => { delete listeners[`doc:${n}`] } }
  const timers = []
  return {
    listeners, target, doc, timers,
    setIntervalImpl: (fn, ms) => { timers.push({ fn, ms }); return timers.length },
    clearIntervalImpl: () => {}
  }
}

function setup({ lease = makeLease(), openIds = ['wf-1'], currentId = 'wf-1' } = {}) {
  const env = makeEnv()
  const open = ref(openIds)
  const current = ref(currentId)
  const log = []
  const api = useCanvasEditLease({
    lease,
    getOpenWorkflowIds: () => open.value,
    getCurrentWorkflowId: () => current.value,
    saveBeforeYield: async id => { log.push(['save', id]) },
    reloadWorkflow: async id => { log.push(['reload', id]) },
    onKicked: (id, holder) => log.push(['kicked', id, holder]),
    heartbeatMs: 20000,
    target: env.target,
    doc: env.doc,
    setIntervalImpl: env.setIntervalImpl,
    clearIntervalImpl: env.clearIntervalImpl
  })
  return { api, lease, env, open, current, log }
}

const flush = async () => { await nextTick(); await new Promise(r => setTimeout(r, 0)) }

test('打开的工作流逐个获取编辑权，关闭的标签页释放', async () => {
  const { lease, open } = setup({ openIds: ['wf-1', 'wf-2'] })
  await flush()
  assert.deepEqual(lease.calls.filter(c => c[0] === 'acquire').map(c => c[1]), ['wf-1', 'wf-2'])
  open.value = ['wf-1']
  await flush()
  assert.ok(lease.calls.some(c => c[0] === 'release' && c[1] === 'wf-2'))
})

test('当前工作流被他人持有时为只读；抢占成功后重新加载最新内容', async () => {
  const lease = makeLease()
  lease.results.acquire['wf-1'] = { mode: 'readonly', reason: 'held', holder: { device: 'A' } }
  const { api, log } = setup({ lease })
  await flush()
  assert.equal(api.isReadonly.value, true)
  await api.takeover()
  assert.equal(api.isReadonly.value, false)
  assert.deepEqual(log, [['reload', 'wf-1']])
})

test('收到交接请求：先保存再让出', async () => {
  const { api, lease, log } = setup()
  await flush()
  await api.handleHandoverRequest('wf-1')
  assert.deepEqual(log, [['save', 'wf-1']])
  assert.ok(lease.calls.some(c => c[0] === 'yield' && c[1] === 'wf-1'))
})

test('非编辑者收到交接请求时不保存也不让出', async () => {
  const lease = makeLease()
  lease.results.acquire['wf-1'] = { mode: 'readonly', reason: 'held' }
  const { api, log } = setup({ lease })
  await flush()
  await api.handleHandoverRequest('wf-1')
  assert.deepEqual(log, [])
  assert.ok(!lease.calls.some(c => c[0] === 'yield'))
})

test('被抢占时回调 onKicked 并转为只读', async () => {
  const { api, log } = setup()
  await flush()
  api.handleLeaseChanged('wf-1', { token: 5, holder: { device: 'B' } })
  assert.deepEqual(log, [['kicked', 'wf-1', { device: 'B' }]])
  assert.equal(api.isReadonly.value, true)
})

test('只读时收到 workflow_saved：当前工作流立即重新加载，后台工作流等切回时再加载', async () => {
  const lease = makeLease()
  lease.results.acquire['wf-1'] = { mode: 'readonly', reason: 'held' }
  lease.results.acquire['wf-2'] = { mode: 'readonly', reason: 'held' }
  const { api, log, current } = setup({ lease, openIds: ['wf-1', 'wf-2'] })
  await flush()
  await api.handleWorkflowSaved('wf-1')
  await api.handleWorkflowSaved('wf-2')
  assert.deepEqual(log, [['reload', 'wf-1']])
  current.value = 'wf-2'
  await flush()
  assert.deepEqual(log, [['reload', 'wf-1'], ['reload', 'wf-2']])
})

test('编辑者收到 workflow_saved 不重新加载', async () => {
  const { api, log } = setup()
  await flush()
  await api.handleWorkflowSaved('wf-1')
  assert.deepEqual(log, [])
})

test('页面重新可见时，只读工作流仍需用户点击拿回编辑权', async () => {
  const lease = makeLease()
  lease.results.acquire['wf-1'] = { mode: 'readonly', reason: 'taken' }
  const { api, env, log } = setup({ lease })
  await flush()
  lease.results.acquire['wf-1'] = { mode: 'editor', token: 9 }
  env.listeners['doc:visibilitychange']()
  await flush()
  assert.equal(api.isReadonly.value, true)
  assert.deepEqual(log, [])
  assert.equal(lease.calls.filter(c => c[0] === 'acquire').length, 1)
})

test('定时心跳续期；pagehide 释放所有打开的工作流', async () => {
  const { lease, env } = setup({ openIds: ['wf-1', 'wf-2'] })
  await flush()
  assert.equal(env.timers[0].ms, 20000)
  await env.timers[0].fn()
  assert.ok(lease.calls.some(c => c[0] === 'heartbeat'))
  env.listeners.pagehide()
  assert.deepEqual(lease.calls.filter(c => c[0] === 'release').map(c => c[1]), ['wf-1', 'wf-2'])
})

test('从“已释放”重新获得编辑权（如页面重新可见）时同步最新内容', async () => {
  const lease = makeLease()
  const { env, log } = setup({ lease })
  await flush()
  lease.states['wf-1'] = { mode: 'released' }
  lease.results.acquire['wf-1'] = { mode: 'editor', token: 7 }
  env.listeners['doc:visibilitychange']()
  await flush()
  assert.deepEqual(log, [['reload', 'wf-1']])
})

test('租约接口不可用（unknown）后恢复编辑权不重新加载，避免丢弃本地未保存修改', async () => {
  const lease = makeLease()
  const { env, log } = setup({ lease })
  await flush()
  lease.states['wf-1'] = { mode: 'unknown' }
  lease.results.acquire['wf-1'] = { mode: 'editor', token: 7 }
  env.listeners['doc:visibilitychange']()
  await flush()
  assert.deepEqual(log, [])
})

for (const reason of ['held', 'taken', 'free']) {
  test(`切回只读工作流（${reason}）不自动获取编辑权`, async () => {
    const lease = makeLease()
    lease.results.acquire['wf-1'] = { mode: 'readonly', reason }
    const { api, current } = setup({ lease, openIds: ['wf-1', 'wf-2'] })
    await flush()
    current.value = 'wf-2'
    await flush()
    current.value = 'wf-1'
    await flush()
    assert.equal(api.isReadonly.value, true)
    assert.equal(lease.calls.filter(c => c[0] === 'acquire' && c[1] === 'wf-1').length, 1)
  })
}

test('同窗口反复切换已打开的工作流，不释放或重新申请租约', async () => {
  const { lease, current } = setup({ openIds: ['wf-1', 'wf-2'] })
  await flush()
  for (const id of ['wf-2', 'wf-1', 'wf-2', 'wf-1']) {
    current.value = id
    await flush()
  }
  assert.deepEqual(lease.calls, [['acquire', 'wf-1'], ['acquire', 'wf-2']])
})

test('打开列表的旧异步遍历不会为已关闭的工作流重新获取租约', async () => {
  const lease = makeLease()
  let finish
  lease.acquire = id => {
    lease.calls.push(['acquire', id])
    lease.states[id] = { mode: 'pending' }
    return new Promise(resolve => { finish = resolve })
  }
  const { open, api } = setup({ lease, openIds: ['wf-1', 'wf-2'] })
  open.value = []
  await flush()
  finish({ mode: 'released' })
  await flush()
  assert.deepEqual(lease.calls.filter(c => c[0] === 'acquire'), [['acquire', 'wf-1']])
  api.dispose()
})

test('组件销毁后，旧异步遍历不会继续申请后续工作流', async () => {
  const lease = makeLease()
  let finish
  lease.acquire = id => {
    lease.calls.push(['acquire', id])
    return new Promise(resolve => { finish = resolve })
  }
  const { api } = setup({ lease, openIds: ['wf-1', 'wf-2'] })
  api.dispose()
  finish({ mode: 'released' })
  await flush()
  assert.deepEqual(lease.calls.filter(c => c[0] === 'acquire'), [['acquire', 'wf-1']])
})
