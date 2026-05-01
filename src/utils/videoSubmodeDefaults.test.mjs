import assert from 'node:assert/strict'
import { pickConfiguredSubmode, pickInitialSubmode } from './videoSubmodeDefaults.js'

const modes = [
  { value: 'text2video' },
  { value: 'image2video_first' },
  { value: 'multimodal_ref' }
]

assert.equal(
  pickConfiguredSubmode('multimodal_ref', modes),
  'multimodal_ref',
  'uses configured default when present'
)

assert.equal(
  pickConfiguredSubmode('video_edit', modes),
  'text2video',
  'falls back to first available mode when configured default is unavailable'
)

assert.equal(
  pickConfiguredSubmode('', modes, 'text2video'),
  'text2video',
  'uses first available mode when configured default is empty'
)

assert.equal(
  pickConfiguredSubmode('multimodal_ref', [], 'text2video'),
  'text2video',
  'uses fallback when no mode list is available'
)

assert.equal(
  pickInitialSubmode('image2video_first', 'multimodal_ref', modes),
  'image2video_first',
  'keeps a saved node mode when it is available'
)

assert.equal(
  pickInitialSubmode('', 'multimodal_ref', modes),
  'multimodal_ref',
  'uses configured default for new nodes without a saved mode'
)

assert.equal(
  pickInitialSubmode('video_edit', 'multimodal_ref', modes),
  'multimodal_ref',
  'falls back to configured default when saved mode is unavailable'
)

console.log('videoSubmodeDefaults tests passed')
