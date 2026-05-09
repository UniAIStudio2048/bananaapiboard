import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

test('processing video nodes do not render provider percentages or fixed estimates', () => {
  assert.doesNotMatch(source, /progress-percent">\{\{\s*progressPercent\s*\}\}%/)
  assert.doesNotMatch(source, /预计\s*1-3\s*分钟/)
})

test('processing video nodes render elapsed generation time and timeout hint', () => {
  assert.match(source, /processingProgressText\(data\)/)
  assert.match(source, /showProcessingTimeoutHint\(data\)/)
  assert.match(source, /当前任务可能超时失败，可尝试重新提交任务/)
})

