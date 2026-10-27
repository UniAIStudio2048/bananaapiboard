import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRunningHubMusicInput, buildRunningHubSunoV6Input, RUNNINGHUB_SUNO6_OPERATIONS } from './runningHubMusic.js'

const single = { actualModel: 'rhart-audio/suno-v5.5/single' }
const custom = { actualModel: 'rhart-audio/suno-v5.5/custom' }

test('single sends the documented fields without legacy music or speech parameters', () => {
  assert.deepEqual(buildRunningHubMusicInput(single, { prompt: '晨光', title: '日出', makeInstrumental: true, webhookUrl: 'https://example.com/hook' }), {
    title: '日出', description: '晨光', make_instrumental: 'true', webhookUrl: 'https://example.com/hook'
  })
  assert.deepEqual(buildRunningHubMusicInput(single, { prompt: '晨光' }), { title: null, description: '晨光', make_instrumental: 'false' })
})

test('custom accepts all maximum lengths and requires title, lyrics and styles', () => {
  const input = { title: 'x'.repeat(80), prompt: 'x'.repeat(5000), tags: 'x'.repeat(1000) }
  assert.deepEqual(buildRunningHubMusicInput(custom, input), input)
  for (const field of ['title', 'prompt', 'tags']) {
    assert.throws(() => buildRunningHubMusicInput(custom, { ...input, [field]: '' }))
    assert.throws(() => buildRunningHubMusicInput(custom, { ...input, [field]: input[field] + 'x' }))
  }
})

test('single enforces description, title and secure webhook bounds', () => {
  assert.throws(() => buildRunningHubMusicInput(single, { prompt: '' }))
  assert.throws(() => buildRunningHubMusicInput(single, { prompt: 'x'.repeat(401) }))
  assert.throws(() => buildRunningHubMusicInput(single, { prompt: 'x', title: 'x'.repeat(81) }))
  assert.throws(() => buildRunningHubMusicInput(single, { prompt: 'x', webhookUrl: 'http://example.com/hook' }))
  assert.throws(() => buildRunningHubMusicInput({ actualModel: 'unknown' }, { prompt: 'x' }))
})

test('sounds exposes documented version and format, while long-form gender values are normalized', () => {
  const sounds = buildRunningHubSunoV6Input({ apiType: 'runninghub-audio', sunoV6: true, actualModel: 'rhart-audio/suno-v6/sounds' }, {
    operation: 'sounds', prompt: '玻璃破碎声', version: 'v6-mini', audioFormat: 'wav'
  })
  assert.equal(sounds.version, 'v6-mini')
  assert.equal(sounds.audioFormat, 'wav')
  const inspo = buildRunningHubSunoV6Input({ apiType: 'runninghub-audio', sunoV6: true, actualModel: 'rhart-audio/suno-v6/inspo' }, {
    operation: 'inspo', audioUrls: ['https://cdn.example.com/inspo.mp3'], vocalGender: 'm'
  })
  assert.equal(inspo.vocalGender, 'Male')
})

test('replace-section preserves the documented infill lyrics field', () => {
  const replace = buildRunningHubSunoV6Input({ apiType: 'runninghub-audio', sunoV6: true, actualModel: 'rhart-audio/suno-v6/replace-section' }, {
    operation: 'replace-section', sourceTaskId: '2013508786110730241', startS: '10', endS: '20', infillLyrics: '[Chorus] 新的副歌'
  })
  assert.equal(replace.infillLyrics, '[Chorus] 新的副歌')
})

test('Suno v6 exposes one canvas entry for all 19 operations', () => {
  assert.equal(RUNNINGHUB_SUNO6_OPERATIONS.length, 19)
  const model = { sunoV6: true, actualModel: 'rhart-audio/suno-v6/single', apiType: 'runninghub-audio' }
  assert.deepEqual(buildRunningHubMusicInput(model, { operation: 'single', prompt: '电影配乐' }), {
    operation: 'single', description: '电影配乐', make_instrumental: 'false'
  })
  assert.deepEqual(buildRunningHubSunoV6Input(model, { operation: 'sounds', prompt: '雨声', bpm: 90 }), {
    operation: 'sounds', prompt: '雨声', bpm: 90
  })
  assert.throws(() => buildRunningHubSunoV6Input(model, { operation: 'inspo', audioUrls: [] }))
  assert.throws(() => buildRunningHubSunoV6Input(model, { operation: 'mashup', sourceTaskIds: ['one'] }))
})
