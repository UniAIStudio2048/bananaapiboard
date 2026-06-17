import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')

test('image node hydrates prompt preset state from persisted node data', () => {
  assert.match(
    source,
    /const selectedPreset = ref\(props\.data\?\.selectedPreset \|\| ''\)/,
    'selected prompt preset should survive workflow reload'
  )
  assert.match(
    source,
    /const tempCustomPrompt = ref\([\s\S]*props\.data\?\.selectedPresetPrompt[\s\S]*\)/,
    'temporary custom preset prompt should hydrate from the persisted prompt snapshot'
  )
})

test('image node persists preset id and prompt snapshot when the selection changes', () => {
  assert.match(source, /function persistSelectedPreset\(presetId, preset = null\)/)
  assert.match(source, /selectedPreset:\s*selectedPreset\.value/)
  assert.match(source, /selectedPresetPrompt:\s*presetPrompt/)
  assert.match(source, /selectedPresetName:\s*presetName/)
  assert.match(source, /selectedPresetType:\s*presetType/)
  assert.match(source, /tempCustomPrompt:\s*selectedPreset\.value === 'temp-custom' \? tempCustomPrompt\.value : ''/)
  assert.match(source, /persistSelectedPreset\(presetId, preset\)/)
  assert.match(source, /persistSelectedPreset\('temp-custom'/)
  assert.match(source, /persistSelectedPreset\(`user-\$\{preset\.id\}`,/)
})

test('image node uses persisted preset prompt snapshot when cloned users cannot resolve the source preset', () => {
  assert.match(
    source,
    /return preset\?\.prompt \|\| props\.data\?\.selectedPresetPrompt \|\| ''/,
    'generation should still append the saved preset prompt when the preset id is unavailable to the current user'
  )
  assert.match(
    source,
    /return props\.data\?\.selectedPresetName \|\| '无预设'/,
    'the preset dropdown should show the saved preset name after reload or community clone'
  )
})
