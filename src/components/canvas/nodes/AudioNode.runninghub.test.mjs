import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildRunningHubMusicInput } from '../../../utils/runningHubMusic.js'
import { calculateAudioPointsCost } from '../../../utils/audioPricing.js'

const source = readFileSync(new URL('./AudioNode.vue', import.meta.url), 'utf8')
const reference = value => ({ value })

for (const mode of ['single', 'custom']) {
  test(`actual AudioNode handler submits all ${mode} fields using the selected tenant model`, async () => {
    const calls = []
    const updates = []
    const sandbox = {
      props: { id: 'audio-1', data: {} }, canGenerateCurrentAudio: reference(true), userPoints: reference(100), musicPointsCost: reference(14),
      isGeneratingMusic: reference(false), isRunningHubAudio: reference(true), isMiniMaxAudio: reference(false), isFishAudio: reference(false),
      audioCapability: reference('music'), selectedMusicModel: reference(`rh-${mode}`), currentMusicModelConfig: reference({ actualModel: `rhart-audio/suno-v5.5/${mode}` }),
      musicPrompt: reference('夜空的星光'), title: reference('夜航'), tags: reference('pop,cinematic'), makeInstrumental: reference(true),
      runninghubWebhookUrl: reference('https://example.com/hook'), buildRunningHubMusicInput,
      teamStore: { getSpaceParams: () => ({ spaceType: 'team', teamId: 'team-1' }) },
      canvasStore: { updateNodeData: (nodeId, data) => updates.push({ nodeId, data }) },
      apiClient: { post: async (endpoint, body) => { calls.push({ endpoint, body: JSON.parse(JSON.stringify(body)) }); return { task_id: 'task-1' } } },
      pollCozeAudioStatus: () => {}, showAlert: async () => {}, showInsufficientPointsDialog: async () => {}, formatAudioErrorMessage: message => message
    }
    const handler = source.slice(source.indexOf('async function handleGenerateCozeAudio()'), source.indexOf('async function pollCozeAudioStatus('))
    vm.runInNewContext(`${handler}\nglobalThis.generate = handleGenerateCozeAudio`, sandbox)
    await sandbox.generate()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].endpoint, '/api/audio/generate')
    assert.deepEqual(calls[0].body, {
      model: `rh-${mode}`, spaceType: 'team', teamId: 'team-1',
      ...buildRunningHubMusicInput(sandbox.currentMusicModelConfig.value, { prompt: '夜空的星光', title: '夜航', tags: 'pop,cinematic', makeInstrumental: true, webhookUrl: 'https://example.com/hook' })
    })
    assert.equal(updates.find(update => update.data.taskId)?.data.audioProvider, 'runninghub')
    assert.deepEqual(JSON.parse(JSON.stringify(updates[0].data.runninghubMusicResults)), [])
    assert.equal(sandbox.isGeneratingMusic.value, false)
  })
}

test('actual AudioNode estimate stays at 14 points even for 5000 lyrics characters', () => {
  const expression = source.slice(source.indexOf('const musicPointsCost = computed('), source.indexOf('function formatAudioErrorMessage('))
  const sandbox = { computed: getter => ({ get value() { return getter() } }), currentMusicModelConfig: reference({ pointsCost: 14 }),
    isRunningHubAudio: reference(true), isMiniMaxAudio: reference(false), isFishAudio: reference(false), audioCapability: reference('music'),
    musicPrompt: reference('x'.repeat(5000)), getUserNodeRate: () => 1, calculateAudioPointsCost }
  vm.runInNewContext(`${expression}\nglobalThis.cost = musicPointsCost.value`, sandbox)
  assert.equal(sandbox.cost, 14)
})

test('actual audio polling persists both RunningHub alternatives and the primary playable URL', async () => {
  const updates = []
  const sandbox = {
    apiClient: { get: async () => ({ status: 'completed', data: { capability: 'music', audio_url: 'https://example.com/a.mp3', results: [
      { task_id: 'task-1', audio_url: 'https://example.com/a.mp3', title: '晨光' }, { task_id: 'task-2', audio_url: 'https://example.com/b.mp3', title: '晨光备选' }
    ] } }) },
    canvasStore: { nodes: [{ id: 'audio-1', data: { audioProvider: 'runninghub', audioCapability: 'music', audioModel: 'rh-single' } }], updateNodeData: (nodeId, data) => updates.push({ nodeId, data }) },
    window: { dispatchEvent() {} }, CustomEvent: class {}, setTimeout: () => { throw new Error('unexpected polling retry') }
  }
  const handler = source.slice(source.indexOf('async function pollCozeAudioStatus('), source.indexOf('const isSavingDesignedVoice'))
  vm.runInNewContext(`${handler}\nglobalThis.poll = pollCozeAudioStatus`, sandbox)
  await sandbox.poll('audio-1', 'task-1')
  assert.equal(updates[0].data.audioUrl, 'https://example.com/a.mp3')
  assert.equal(updates[0].data.runninghubMusicResults.length, 2)
})

test('music parameter controls include title, custom styles, instrumental and persisted webhook', () => {
  for (const text of ['v-model="title"', 'v-model="tags"', 'v-model="makeInstrumental"', 'v-model="runninghubWebhookUrl"', 'watch(runninghubWebhookUrl', 'runninghubMusicResults']) assert.ok(source.includes(text), text)
})
