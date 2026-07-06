import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readImageNode() {
  return readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`)
  assert.ok(start >= 0, `Expected ${functionName} to exist`)

  const paramsEnd = source.indexOf(')', start)
  assert.ok(paramsEnd > start, `Expected ${functionName} parameter list to close`)
  const bodyStart = source.indexOf('{', paramsEnd)
  let depth = 0
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') depth -= 1
    if (depth === 0) return source.slice(bodyStart + 1, i)
  }

  throw new Error(`Could not parse ${functionName}`)
}

test('image node error preview does not expose a retry button under the failed result', () => {
  const source = readImageNode()
  const errorPreviewMatch = source.match(/<!-- 错误状态 -->[\s\S]*?<!-- 数据丢失状态/)
  assert.ok(errorPreviewMatch, 'Expected image error preview template block')

  assert.doesNotMatch(errorPreviewMatch[0], /@click="handleRegenerate"/)
  assert.doesNotMatch(errorPreviewMatch[0], />\s*重试\s*<\/button>/)
})

test('old failed image nodes with taskId are reconciled through background polling', () => {
  const source = readImageNode()
  const restoreBody = functionBody(source, 'checkAndRestoreBackgroundTasks')

  assert.match(source, /ensureTaskPolling/)
  assert.match(restoreBody, /props\.data\?\.taskId/)
  assert.match(restoreBody, /props\.data\?\.status === 'error'/)
  assert.match(restoreBody, /ensureTaskPolling\(\{/)
  assert.match(restoreBody, /type:\s*props\.data\?\.taskType \|\| 'image'/)
  assert.doesNotMatch(restoreBody, /任务丢失，请重新生成[\s\S]*props\.data\?\.taskId/)
})

test('image task failure events with returned media are treated as successful completion', () => {
  const source = readImageNode()
  const failedBody = functionBody(source, 'handleBackgroundTaskFailed')

  assert.match(failedBody, /collectImageTaskOutputUrls\(task\.result\)/)
  assert.match(failedBody, /outputUrls\.length > 0/)
  assert.match(failedBody, /status:\s*'success'/)
  assert.match(failedBody, /removeCompletedTask\(taskId\)/)
  assert.match(failedBody, /return/)
})
