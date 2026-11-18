import { localizedPattern } from '../../../i18n/sourceAssertions.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { shouldShowVideoGenerationTimeoutHint } from '../../../utils/videoGenerationProgress.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

test('processing video nodes do not render provider percentages or fixed estimates', () => {
  assert.doesNotMatch(source, /progress-percent">\{\{\s*progressPercent\s*\}\}%/)
  assert.doesNotMatch(source, localizedPattern(/预计\s*1-3\s*分钟/))
})

test('processing video nodes render elapsed generation time and timeout hint', () => {
  assert.match(source, /processingProgressText\(data\)/)
  assert.match(source, /showProcessingTimeoutHint\(data\)/)
  assert.match(source, localizedPattern(/当前任务可能超时失败，可尝试重新提交任务/))
})

test('the warning uses the running canvas task model even when it is filtered out of the current picker', () => {
  const start = Date.parse('2026-05-13T12:00:00.000Z')
  const elapsedTimeNow = { value: start + 13 * 60 * 1000 }
  const handler = source.match(/function showProcessingTimeoutHint\([^\n]+\n[\s\S]*?\n\}/)[0]
  const showHint = new Function('context', `with (context) { ${handler}; return showProcessingTimeoutHint }`)({
    elapsedTimeNow,
    shouldShowVideoGenerationTimeoutHint,
    getProcessingTimingData: data => ({ processingStartedAt: data.processingStartedAt }),
    getModelAvgDurationSeconds: () => 60,
    selectedModel: { value: 'another-model' },
    models: { value: [] },
    tenantConfig: { video_models: [{ name: 'custom-video-model', apiType: 'routerbee-wan3' }] }
  })
  const task = { model: 'custom-video-model', processingStartedAt: start }
  assert.equal(showHint(task), false)
  elapsedTimeNow.value = start + 20 * 60 * 1000
  assert.equal(showHint(task), true)
  assert.equal(showHint({ ...task, taskType: 'video-hd' }), false)
})
