import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRunningHubMusicInput } from './runningHubMusic.js'

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
