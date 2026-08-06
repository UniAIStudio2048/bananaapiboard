import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('video model tab is shown when the tenant has enabled video models, not only from skill capabilities', () => {
  assert.match(source, /const modelPickerTypes = computed\(\(\) => \{[\s\S]*?tenantConfigVersion\.value/)
  assert.match(source, /hasConfiguredType = type => \{[\s\S]*?tenantConfig\.video_models[\s\S]*?tenantConfig\.image_models/)
  assert.match(source, /hasConfiguredType = type => \{[\s\S]*?models\.some\(item => item\?\.enabled !== false\)/)
  assert.match(source, /\['image', 'video'\]\.filter\(type => hasSkillType\(type\) \|\| hasConfiguredType\(type\)\)/)
})

test('video model list is built from tenant video_models and filters canvas_exposed !== false', () => {
  assert.match(source, /const configuredModels = pickerType === 'video' \? tenantConfig\.video_models : tenantConfig\.image_models/)
  assert.match(source, /if \(pickerType === 'video'\) \{[\s\S]*?getAvailableVideoModels\(\{ disableVeoMerge: true \}\)/)
  assert.match(source, /\.filter\(item => item\?\.enabled !== false && item\?\.canvas_exposed !== false\)/)
  assert.match(source, /label: cfg\.displayName \|\| cfg\.label \|\| meta\.label \|\| cfg\.name \|\| cfg\.id/)
  assert.match(source, /pointsCost: cfg\.pointsCost != null \? cfg\.pointsCost : meta\.pointsCost/)
})

test('selected video model keeps the configured model id instead of a shared actualModel', () => {
  assert.match(source, /const selectedValue = model\.veoModes\?\.find\(mode => mode\.value === model\.defaultVeoMode\)\?\.actualModel \|\|[\s\S]*?model\.value \|\| model\.actualModel/)
})

test('selected video model is sent as skill_model with skill_model_type video', () => {
  assert.match(source, /skill_model: turnModelValue \|\| undefined/)
  assert.match(source, /skill_model_type: turnModelType \|\| undefined/)
})

test('video model list is ordered by the grouped catalog order like the video node', () => {
  assert.match(source, /__catalogOrder: metaIndex >= 0 \? metaIndex : Number\.MAX_SAFE_INTEGER/)
  assert.match(source, /list\.sort\(\(left, right\) => left\.__catalogOrder - right\.__catalogOrder\)/)
  assert.match(source, /\.map\(\(\{ __catalogOrder, \.\.\.model \}\) => model\)/)
  assert.match(source, /getAvailableVideoModels\(\{ disableVeoMerge: true \}\)[\s\S]*?__catalogOrder/)
})
