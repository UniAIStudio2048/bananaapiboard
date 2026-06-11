import test from 'node:test'
import assert from 'node:assert/strict'

import {
  PROMPT_INPUT_FIXED_SCALE_KEY,
  buildPromptInputScaleStyle,
  getPromptInputFixedScaleDefault,
  resolvePromptInputFixedScalePreference
} from './canvasPromptInputScale.js'

test('prompt input fixed-scale defaults follow the selected interaction mode', () => {
  assert.equal(getPromptInputFixedScaleDefault('infinite-canvas'), true)
  assert.equal(getPromptInputFixedScaleDefault('comfyui'), false)
  assert.equal(getPromptInputFixedScaleDefault('unknown'), false)
})

test('prompt input fixed-scale preference only accepts stored booleans', () => {
  assert.equal(
    resolvePromptInputFixedScalePreference({ canvas: { [PROMPT_INPUT_FIXED_SCALE_KEY]: true } }, false),
    true
  )
  assert.equal(
    resolvePromptInputFixedScalePreference({ canvas: { [PROMPT_INPUT_FIXED_SCALE_KEY]: false } }, true),
    false
  )
  assert.equal(
    resolvePromptInputFixedScalePreference({ canvas: { [PROMPT_INPUT_FIXED_SCALE_KEY]: 'true' } }, false),
    false
  )
  assert.equal(resolvePromptInputFixedScalePreference({}, true), true)
})

test('prompt input fixed-scale style cancels the canvas zoom with an inverse scale', () => {
  assert.deepEqual(buildPromptInputScaleStyle({ enabled: false, zoom: 0.5 }), {})

  assert.deepEqual(buildPromptInputScaleStyle({ enabled: true, zoom: 0.5 }), {
    '--canvas-prompt-input-fixed-scale': '2',
    '--canvas-prompt-input-zoom': '0.5'
  })

  assert.deepEqual(buildPromptInputScaleStyle({ enabled: true, zoom: 2 }), {
    '--canvas-prompt-input-fixed-scale': '0.5',
    '--canvas-prompt-input-zoom': '2'
  })

  assert.deepEqual(buildPromptInputScaleStyle({ enabled: true, zoom: 0 }), {
    '--canvas-prompt-input-fixed-scale': '1',
    '--canvas-prompt-input-zoom': '1'
  })
})
