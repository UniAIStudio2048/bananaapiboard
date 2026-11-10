import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./HistoryPanel.vue', import.meta.url), 'utf8')

test('history deletion invalidates persistent cache and rejects in-flight stale snapshots', () => {
  const fetchStart = source.indexOf('async function _fetchFromServer(')
  const fetchEnd = source.indexOf('\n// 比较两个历史列表', fetchStart)
  const fetchSource = source.slice(fetchStart, fetchEnd)
  const deleteStart = source.indexOf('async function confirmDelete()')
  const deleteEnd = source.indexOf('\n// 获取正确的文件扩展名', deleteStart)
  const deleteSource = source.slice(deleteStart, deleteEnd)

  assert.match(fetchSource, /const requestRevision = historyRevision/)
  assert.match(fetchSource, /requestRevision !== historyRevision/)
  assert.match(fetchSource, /return null/)
  assert.match(deleteSource, /historyRevision \+= 1/)
  assert.match(deleteSource, /await invalidateCache\(item\.type\)/)
  assert.match(deleteSource, /dataCached\.value = false/)
})
