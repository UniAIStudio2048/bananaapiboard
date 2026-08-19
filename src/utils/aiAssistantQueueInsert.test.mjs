/**
 * 「立即插入」决策纯函数测试：
 * 1) 回合运行中点「立即插入」→ 不取消当前回合，置顶排队等待本轮结束后立即发送；
 * 2) 空闲时点「立即插入」→ 直接发送（无需取消任何回合）；
 * 3) 本地兜底队列按优先级挑选下一条。
 *
 * Run: cd /opt/banana/bananaapiboard && node --test src/utils/aiAssistantQueueInsert.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { isAssistantRoundBusy, pickNextQueuedIndex, filterVisibleQueueItems } from './aiAssistantQueueInsert.js'

test('isAssistantRoundBusy: 增强模式下任一运行信号为真即忙（isLoading / activeTurnRunning / 服务端队列非空 / 回合已入队）', () => {
  const base = { enhancedMode: true, isLoading: false, activeTurnRunning: false, serverQueueLength: 0, activeTurnStatus: 'idle' }
  assert.equal(isAssistantRoundBusy(base), false)
  assert.equal(isAssistantRoundBusy({ ...base, isLoading: true }), true)
  assert.equal(isAssistantRoundBusy({ ...base, activeTurnRunning: true }), true)
  assert.equal(isAssistantRoundBusy({ ...base, serverQueueLength: 2 }), true)
  assert.equal(isAssistantRoundBusy({ ...base, activeTurnStatus: 'queued' }), true)
})

test('isAssistantRoundBusy: 旧模式沿用 isLoading', () => {
  assert.equal(isAssistantRoundBusy({ enhancedMode: false, isLoading: false, activeTurnRunning: true, serverQueueLength: 1, activeTurnStatus: 'running' }), false)
  assert.equal(isAssistantRoundBusy({ enhancedMode: false, isLoading: true, activeTurnRunning: false, serverQueueLength: 0, activeTurnStatus: 'idle' }), true)
})

test('pickNextQueuedIndex: 无置顶项时取第一条，有置顶项时跳过普通项优先取置顶项', () => {
  const items = [
    { id: 'a' },
    { id: 'b', priority: true },
    { id: 'c' },
  ]
  assert.equal(pickNextQueuedIndex(items), 1)
  assert.equal(pickNextQueuedIndex([{ id: 'a' }, { id: 'b' }]), 0)
  assert.equal(pickNextQueuedIndex([]), -1)
})

test('filterVisibleQueueItems: 已进入聊天区的置顶项从队列条隐藏，其余保留原顺序', () => {
  const items = [
    { id: 'a', turn_id: 't1' },
    { id: 'b', turn_id: 't2', client_message_id: 'cm2' },
    { id: 'c', turn_id: 't3' },
  ]
  const hidden = new Set(['t2', 'cm9'])
  assert.deepEqual(
    filterVisibleQueueItems(items, hidden).map((i) => i.id),
    ['a', 'c']
  )
  // 隐藏键同时支持 client_message_id 匹配（本地项无 turn_id）
  assert.deepEqual(
    filterVisibleQueueItems([{ id: 'd', client_message_id: 'cm9' }], hidden).map((i) => i.id),
    []
  )
  // 空集合全部可见；空输入返回空
  assert.equal(filterVisibleQueueItems(items, new Set()).length, 3)
  assert.deepEqual(filterVisibleQueueItems([], hidden), [])
})
