import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'Canvas.vue'), 'utf8')

const writerStart = source.indexOf('const collaborationWriter = createIncrementalWriter(')
const onErrorStart = source.indexOf('onError: (err) => {', writerStart)
const onErrorSource = source.slice(onErrorStart, source.indexOf('canvasStore.setIncrementalWriter(collaborationWriter)', onErrorStart))

test('personal workflows never show the collaboration version conflict toast', () => {
  assert.ok(writerStart > 0 && onErrorStart > writerStart, 'collaborationWriter onError must exist')
  const personalGuard = onErrorSource.search(/workflowSpaceType\s*!==\s*'team'/)
  const toast = onErrorSource.indexOf('协作版本已变化')
  assert.ok(personalGuard >= 0, '个人工作流必须在冲突提示前单独处理')
  assert.ok(toast > personalGuard, '个人工作流的判断必须在冲突提示之前返回')
  const guardBlock = onErrorSource.slice(personalGuard, onErrorSource.indexOf('return', personalGuard) + 'return'.length)
  assert.match(guardBlock, /return/, '个人工作流冲突时直接返回，由编辑租约与整份自动保存接管')
  assert.doesNotMatch(guardBlock, /markCollaborationStale/, '个人工作流不应被标记为协作过期')
})

test('team workflows still surface collaboration conflicts', () => {
  assert.match(onErrorSource, /markCollaborationStale\?\.\(/)
  assert.match(onErrorSource, /displayToast\('协作版本已变化，请刷新工作流后继续编辑'/)
})
