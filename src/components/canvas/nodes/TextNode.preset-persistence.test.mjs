import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'TextNode.vue'), 'utf8')

test('text node hydrates llm preset state from persisted node data', () => {
  assert.match(
    source,
    /const selectedPreset = ref\(props\.data\?\.selectedPreset \|\| ''\)/,
    'selected llm preset should survive workflow reload'
  )
  assert.match(
    source,
    /const tempCustomPrompt = ref\([\s\S]*props\.data\?\.selectedPresetPrompt[\s\S]*\)/,
    'temporary custom preset prompt should hydrate from the persisted prompt snapshot'
  )
})

test('text node persists preset id and prompt snapshot when the selection changes', () => {
  assert.match(source, /function persistSelectedPreset\(presetId, preset = null\)/)
  assert.match(source, /selectedPreset:\s*selectedPreset\.value/)
  assert.match(source, /selectedPresetPrompt:\s*presetPrompt/)
  assert.match(source, /selectedPresetName:\s*presetName/)
  assert.match(source, /selectedPresetType:\s*presetType/)
  assert.match(source, /tempCustomPrompt:\s*selectedPreset\.value === 'temp-custom' \? tempCustomPrompt\.value : ''/)
  assert.match(source, /persistSelectedPreset\(presetId, preset\)/)
  assert.match(source, /persistSelectedPreset\('temp-custom'/)
  assert.match(source, /persistSelectedPreset\(`user-\$\{result\.preset\.id\}`,/)
})

test('text node uses persisted preset snapshot when the preset cannot be resolved', () => {
  assert.match(
    source,
    /return props\.data\?\.selectedPresetName \|\| '通用对话'/,
    'the preset dropdown should show the saved preset name after reload or community clone'
  )
})
