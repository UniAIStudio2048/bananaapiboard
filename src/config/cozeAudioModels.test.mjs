import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAudioModels, VOICE_DESIGN_STYLES } from './audioModels.js'

test('publishes enabled Coze audio models and fixed voice styles', () => {
  assert.deepEqual(normalizeAudioModels([{ name: 'voice', displayName: 'Voice', apiType: 'coze-audio-workflow', capability: 'tts', enabled: true }])[0].capability, 'tts')
  assert.deepEqual(VOICE_DESIGN_STYLES.map(item => item.value), [
    'general', 'narration', 'conversational', 'advertising', 'character', 'emotional'
  ])
})

test('publishes enabled MiniMax audio models without exposing configuration secrets', () => {
  const model = normalizeAudioModels([{
    name: 'minimax-tts',
    displayName: 'MiniMax 语音合成',
    apiType: 'minimax-audio',
    capability: 'tts',
    actualModel: 'speech-2.8-hd',
    voiceClonePointsCost: 18,
    apiKey: 'must-not-be-published',
    enabled: true
  }])[0]

  assert.equal(model.provider, 'minimax')
  assert.equal(model.actualModel, 'speech-2.8-hd')
  assert.equal(model.voiceClonePointsCost, 18)
  assert.equal(Object.hasOwn(model, 'apiKey'), false)
})

test('attaches custom icons and orders models by configured audio groups', () => {
  const models = normalizeAudioModels([
    { name: 'ungrouped', displayName: '未分组', apiType: 'coze-audio-workflow', enabled: true },
    { name: 'clone', displayName: '克隆', apiType: 'coze-audio-workflow', icon: 'C', enabled: true },
    { name: 'design', displayName: '设计', apiType: 'coze-audio-workflow', icon: 'D', enabled: true }
  ], [{ name: '声音', logo: '🎙️', models: ['clone', 'design'] }])
  assert.deepEqual(models.map(model => model.value), ['clone', 'design', 'ungrouped'])
  assert.equal(models[0].groupLogo, '🎙️')
  assert.equal(models[0].icon, 'C')
})
