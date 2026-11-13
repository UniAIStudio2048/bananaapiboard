import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const start = source.indexOf("  if (capturedState.apiType === 'runninghub-longcat') {")
const end = source.indexOf("\n  if (capturedState.apiType === 'runninghub-ai-app-video')", start)

test('LongCat 保留空提示词、智能时长和指定的小数时长', () => {
  for (const [prompt, duration, expected] of [['', '', 'auto'], ['自然说话', '2.5', '2.5']]) {
    const formData = new FormData()
    formData.set('prompt', prompt || '根据图片生成视频')
    runInNewContext(source.slice(start, end), {
      formData, finalPrompt: prompt,
      capturedState: { apiType: 'runninghub-longcat', longCatDuration: duration, referenceAudios: ['https://example.com/audio.wav'] }
    })
    assert.equal(formData.get('prompt'), prompt)
    assert.equal(formData.get('duration'), expected)
    assert.deepEqual(JSON.parse(formData.get('reference_audios')), ['https://example.com/audio.wav'])
  }
})
