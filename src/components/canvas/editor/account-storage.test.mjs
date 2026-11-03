import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bindAccountEditorStorage, editorStorage } from './storage.js'

const namespace = 'a'.repeat(64)
const prefix = 'media-video-text-presets:v1:media-canvas-preferences:v1:'

test('文字预设与时间线偏好按账号写库，草稿仍按节点独立保存', async () => {
  const drafts = [], preferences = []
  const account = { namespace, values: { textPresets: '["shared"]' } }
  let unbind = bindAccountEditorStorage({ draft: 'node-a' }, account, value => drafts.push(value), value => preferences.push(value))
  assert.equal(editorStorage.getItem(prefix + namespace), '["shared"]')
  editorStorage.setItem(prefix + namespace, '["updated"]')
  assert.deepEqual(preferences, [{ textPresets: '["updated"]' }])
  assert.deepEqual(drafts, [])
  editorStorage.setItem('draft', 'edited-a')
  assert.deepEqual(drafts, [{ draft: 'edited-a' }])
  assert.equal(preferences.length, 1)
  unbind()
  unbind = bindAccountEditorStorage({ draft: 'node-b' }, { namespace, values: preferences[0] }, () => {}, () => {})
  assert.equal(editorStorage.getItem(prefix + namespace), '["updated"]')
  assert.equal(editorStorage.getItem('draft'), 'node-b')
  unbind()
  unbind = bindAccountEditorStorage({}, { namespace: 'b'.repeat(64), values: {} }, () => {}, () => {})
  assert.equal(editorStorage.getItem(prefix + namespace), null)
  unbind()
})

test('迁移节点内旧预设到账号，不覆盖已有账号预设；删除和失败刷新都走数据库写入器', async () => {
  const drafts = [], preferences = []
  const oldKey = prefix + 'c'.repeat(64)
  let rejectFlush = true
  const unbind = bindAccountEditorStorage({ draft: 'keep', [oldKey]: '["old"]' }, { namespace, values: {} }, value => drafts.push(value), value => preferences.push(value), async () => { if (rejectFlush) throw new Error('database unavailable') })
  assert.deepEqual(preferences, [{ textPresets: '["old"]' }])
  assert.deepEqual(drafts, [{ draft: 'keep' }])
  editorStorage.removeItem(prefix + namespace)
  assert.deepEqual(preferences.at(-1), {})
  await assert.rejects(editorStorage.flush(), /database unavailable/)
  rejectFlush = false
  await editorStorage.flush()
  unbind()
  const writes = []
  const stop = bindAccountEditorStorage({ [oldKey]: '["stale"]' }, { namespace, values: { textPresets: '["account"]' } }, () => {}, value => writes.push(value))
  assert.equal(editorStorage.getItem(prefix + namespace), '["account"]')
  assert.deepEqual(writes, [])
  stop()
})
