import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { normalizeAudioModels } from '../../../config/audioModels.js'
import { calculateAudioPointsCost } from '../../../utils/audioPricing.js'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')
test('normalization retains character billing and legacy fixed billing', () => {
  const models = normalizeAudioModels([
    { name: 'clone', apiType: 'runninghub-audio', pricingMode: 'per_character', pointsCost: 1 },
    { name: 'legacy', apiType: 'runninghub-audio', pointsCost: 14 }
  ])
  assert.equal(models[0].pricingMode, 'per_character')
  assert.equal(models[1].pricingMode, 'fixed')
})

test('canvas quote follows existing 100 character buckets, including free rates', () => {
  const body = source.match(/const musicPointsCost = computed\(\(\) => \{([\s\S]*?)\n\}\)/)[1]
  for (const [characters, rate, expected] of [[1, 1, 1], [100, 1, 1], [101, 1, 2], [201, 0.5, 1.5], [101, 0, 0]]) {
    const context = { currentMusicModelConfig: { value: { pointsCost: rate, pricingMode: 'per_character' } },
      isRunningHubAudio: { value: true }, isRunningHubSuno6: { value: false }, musicPrompt: { value: '文'.repeat(characters) },
      getUserNodeRate: () => 1, calculateAudioPointsCost }
    assert.equal(vm.runInNewContext(`(() => {${body}})()`, context), expected)
  }
})

test('LongCat clone hides unsupported voice styles and blocks unreadable or overlong reference audio', () => {
  assert.match(source, /!isLongCatVoiceClone && \(audioCapability === 'voice_design' \|\| audioCapability === 'voice_clone'\)/)
  assert.match(source, /referenceAudioDuration\.value > 45/)
  assert.match(source, /if \(isLongCatVoiceClone\.value\) return !longCatVoiceInputError\.value/)
  assert.match(source, /if \(!isLongCatVoiceClone\.value\) body\.style = voiceDesignStyle\.value/)
})

test('a delayed failure from a previous task cannot overwrite a retry on the same audio node', async () => {
  const node = { id: 'audio-1', data: { taskId: 'old-task' } }
  const updates = []
  const sandbox = {
    canvasStore: { nodes: [node], updateNodeData: (...args) => updates.push(args) },
    apiClient: { get: async () => { node.data.taskId = 'new-task'; return { status: 'failed', data: { error_message: 'old failure' } } } },
    setTimeout: () => {}
  }
  const handler = source.slice(source.indexOf('async function pollCozeAudioStatus('), source.indexOf('const isSavingDesignedVoice'))
  vm.runInNewContext(`${handler}\nglobalThis.poll = pollCozeAudioStatus`, sandbox)
  await sandbox.poll('audio-1', 'old-task')
  assert.equal(updates.length, 0)
})
