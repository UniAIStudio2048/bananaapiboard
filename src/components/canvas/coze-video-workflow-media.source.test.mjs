import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./nodes/VideoNode.vue', import.meta.url), 'utf8')

test('Coze video workflow submits connected image and audio/video references', () => {
  const start = source.indexOf("currentModelConfig.value?.apiType === 'coze-video-workflow'")
  assert.ok(start >= 0)
  const block = source.slice(start, start + 1600)
  assert.match(block, /first_frame_image/)
  assert.match(block, /last_frame_image/)
  assert.match(block, /reference_videos/)
  assert.match(block, /reference_audios/)
})
