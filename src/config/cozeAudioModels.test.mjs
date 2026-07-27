import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAudioModels, VOICE_DESIGN_STYLES } from './audioModels.js'

test('publishes enabled Coze audio models and fixed voice styles', () => {
  assert.deepEqual(normalizeAudioModels([{ name: 'voice', displayName: 'Voice', apiType: 'coze-audio-workflow', capability: 'tts', enabled: true }])[0].capability, 'tts')
  assert.deepEqual(VOICE_DESIGN_STYLES.map(item => item.value), [
    'general', 'narration', 'conversational', 'advertising', 'character', 'emotional'
  ])
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
