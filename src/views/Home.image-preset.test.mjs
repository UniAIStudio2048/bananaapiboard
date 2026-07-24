import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./Home.vue', import.meta.url), 'utf8')

test('beginner mode loads the same image presets used by canvas image nodes', () => {
  assert.match(
    source,
    /import \{ getImagePresets, incrementPresetUseCount, normalizePresetPointsCost \} from '@\/api\/canvas\/image-presets'/
  )
  assert.match(source, /const tenantImagePresets = ref\(\[\]\)/)
  assert.match(source, /const userImagePresets = ref\(\[\]\)/)
  assert.match(
    source,
    /async function loadImagePresets\(\)[\s\S]*await getImagePresets\(\)[\s\S]*tenantImagePresets\.value = data\.tenant \|\| \[\][\s\S]*userImagePresets\.value = data\.user \|\| \[\]/
  )
})

test('beginner mode renders tenant and user presets in a select dropdown', () => {
  assert.match(source, /<select[\s\S]*v-model="selectedImagePresetId"[\s\S]*@change="handleImagePresetChange"/)
  assert.match(source, /<optgroup label="平台预设">[\s\S]*v-for="preset in tenantImagePresetOptions"/)
  assert.match(source, /<optgroup label="我的预设">[\s\S]*v-for="preset in userImagePresetOptions"/)
  assert.match(source, /incrementPresetUseCount\(selected\.rawId\)/)
})

test('beginner mode includes paid tenant preset cost in the displayed total', () => {
  assert.match(
    source,
    /const selectedImagePresetPointsCost = computed\(\(\) =>[\s\S]*selectedImagePreset\.value\?\.scope !== 'tenant'[\s\S]*normalizePresetPointsCost/
  )
  assert.match(
    source,
    /const totalPointsCost = computed\(\(\) => \{[\s\S]*currentPointsCost\.value \+ selectedImagePresetPointsCost\.value[\s\S]*\}\)/
  )
})

test('beginner generation references the preset prompt and sends tenant preset id for server billing', () => {
  assert.match(source, /const userPrompt = prompt\.value\.trim\(\)/)
  assert.match(source, /const finalPrompt = \[userPrompt, selectedImagePreset\.value\?\.prompt\][\s\S]*\.join\(', '\)/)
  assert.match(source, /prompt: finalPrompt,[\s\S]*user_prompt: userPrompt/)
  assert.match(
    source,
    /if \(selectedImagePreset\.value\?\.scope === 'tenant'\) \{[\s\S]*payload\.image_preset_id = selectedImagePreset\.value\.rawId/
  )
})
