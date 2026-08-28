import test from 'node:test'
import assert from 'node:assert/strict'
import { getUserNodeRate, applyUserNodeRate } from './userGroupRate.js'

// Node 环境没有 localStorage，提供最小 mock
function setLocalUser(user) {
  globalThis.localStorage = {
    getItem(key) {
      if (key === 'user') return user ? JSON.stringify(user) : null
      return null
    }
  }
}

test('无 localStorage 时回退 1.0', () => {
  delete globalThis.localStorage
  assert.equal(getUserNodeRate('image'), 1.0)
  assert.equal(applyUserNodeRate(100, 'video'), 100)
})

test('无分组 user_group 时回退 1.0', () => {
  setLocalUser({ id: 'u1', username: 'test' })
  assert.equal(getUserNodeRate('image'), 1.0)
})

test('默认分组四类倍率均为 1.0', () => {
  setLocalUser({ id: 'u1', user_group: { id: 'g', rate_text: 1, rate_image: 1, rate_video: 1, rate_audio: 1 } })
  assert.equal(getUserNodeRate('text'), 1.0)
  assert.equal(getUserNodeRate('image'), 1.0)
  assert.equal(getUserNodeRate('video'), 1.0)
  assert.equal(getUserNodeRate('audio'), 1.0)
})

test('自定义分组读取对应倍率（0.5 / 1.2 / 1.3）', () => {
  setLocalUser({ id: 'u1', user_group: { id: 'g', rate_text: 1, rate_image: 1.2, rate_video: 0.5, rate_audio: 1.3 } })
  assert.equal(getUserNodeRate('image'), 1.2)
  assert.equal(getUserNodeRate('video'), 0.5)
  assert.equal(getUserNodeRate('audio'), 1.3)
})

test('applyUserNodeRate 按倍率放大成本', () => {
  setLocalUser({ id: 'u1', user_group: { id: 'g', rate_text: 1, rate_image: 1.2, rate_video: 0.5, rate_audio: 1.3 } })
  assert.equal(applyUserNodeRate(100, 'image'), 120)
  assert.equal(applyUserNodeRate(80, 'video'), 40)
  assert.equal(applyUserNodeRate(100, 'audio'), 130)
})

test('非法倍率或无效 nodeType 回退 1.0', () => {
  setLocalUser({ id: 'u1', user_group: { id: 'g', rate_image: 'abc', rate_text: NaN, rate_video: -1, rate_audio: 0 } })
  assert.equal(getUserNodeRate('image'), 1.0)
  assert.equal(getUserNodeRate('text'), 1.0)
  assert.equal(getUserNodeRate('video'), 1.0)
  assert.equal(getUserNodeRate('audio'), 1.0)
  assert.equal(getUserNodeRate('unknown'), 1.0)
})
