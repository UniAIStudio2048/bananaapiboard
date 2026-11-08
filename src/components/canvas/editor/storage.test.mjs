import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bindEditorStorage, editorStorage } from './storage.js'

test('草稿与偏好每次变更立即交给数据库写入器，不使用浏览器缓存', () => {
  const writes = []
  const unbind = bindEditorStorage({ draft: 'old' }, value => writes.push(value))
  assert.equal(editorStorage.getItem('draft'), 'old')
  editorStorage.setItem('draft', 'new')
  assert.deepEqual(writes, [{ draft: 'new' }])
  editorStorage.setItem('preset', 'text')
  editorStorage.removeItem('draft')
  assert.deepEqual(writes.at(-1), { preset: 'text' })
  assert.equal(writes[0].draft, 'new')
  unbind()
  assert.equal(editorStorage.getItem('preset'), null)
})

test('旧编辑器的异步清理不会解绑新编辑器的数据库写入器', async () => {
  const oldWrites = [], newWrites = []
  const oldUnbind = bindEditorStorage({ draft: 'old' }, value => oldWrites.push(value))
  const newUnbind = bindEditorStorage({ draft: 'new' }, value => newWrites.push(value), async () => newWrites.push('flushed'))
  oldUnbind()
  editorStorage.setItem('draft', 'current')
  await editorStorage.flush()
  assert.equal(editorStorage.getItem('draft'), 'current')
  assert.deepEqual(oldWrites, [])
  assert.deepEqual(newWrites, [{ draft: 'current' }, 'flushed'])
  newUnbind()
})
