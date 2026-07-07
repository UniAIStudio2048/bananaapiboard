import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('VideoNode recognizes Kling v3 Omni official models by apiType as well as explicit flag', () => {
  const marker = 'const isKlingV3OmniModel = computed(() => {'
  const start = source.indexOf(marker)
  assert.ok(start >= 0, 'isKlingV3OmniModel computed block should exist')
  const block = source.slice(start, start + 500)
  assert.match(block, /apiType\s*===\s*'kling-v3-omni'/)
  assert.match(block, /isKlingV3OmniModel/)
})

test('VideoNode normalizes Kling official duration options to every second from 3 to 15', () => {
  assert.match(source, /function isKlingOfficialDurationModel\(modelConfig = \{\}\)/)
  assert.match(source, /const klingOfficialDurationOptions = Array\.from\(\{ length: 13 \}, \(_, index\) => String\(index \+ 3\)\)/)

  const marker = 'const availableDurations = computed(() => {'
  const start = source.indexOf(marker)
  assert.ok(start >= 0, 'availableDurations computed block should exist')
  const block = source.slice(start, start + 1200)
  assert.match(block, /isKlingOfficialDurationModel\(currentModelConfig\.value\)/)
  assert.match(block, /return klingOfficialDurationOptions/)
})

test('VideoNode exposes Kling official quality choices and submits quality to video generation', () => {
  assert.match(source, /const selectedKlingOfficialQuality = ref\(/)
  assert.match(source, /const klingOfficialQualityOptions = computed/)
  assert.match(source, /function normalizeKlingOfficialQuality/)
  assert.match(source, /const klingOfficialRequestQuality = computed/)
  assert.match(source, /formData\.append\('quality', klingOfficialRequestQuality\.value\)/)
})

test('VideoNode derives split Kling v3 Omni request quality from the selected model config', () => {
  const marker = 'const klingOfficialRequestQuality = computed(() => {'
  const start = source.indexOf(marker)
  assert.ok(start >= 0, 'klingOfficialRequestQuality computed block should exist')
  const block = source.slice(start, start + 600)

  assert.match(block, /modelConfig\.apiType === 'kling-v3-omni'/)
  assert.match(block, /normalizeKlingOfficialQuality\(modelConfig\)/)
  assert.doesNotMatch(block, /selectedKlingOfficialQuality\.value[\s\S]*modelConfig\.apiType === 'kling-v3-omni'/)
})

test('VideoNode does not render an extra STD/pro/4K quality selector for split Kling v3 Omni models', () => {
  assert.doesNotMatch(source, /class="kling-quality-segment"/)
  assert.doesNotMatch(source, /v-if="isKlingOfficialDurationModel\(currentModelConfig\) && klingOfficialQualityOptions\.length > 1"/)
})

test('VideoNode displays selected Kling official second-based billing', () => {
  assert.match(source, /const klingOfficialSelectedDurationCost = computed/)
  assert.match(source, /klingOfficialSelectedDurationCost\.value \* selectedCount\.value/)
  assert.match(source, /selectedDuration\.value\s*\?\s*`\$\{selectedDuration\.value\}s = \$\{formatPoints\(klingOfficialSelectedDurationTotalCost\.value\)\}积分`/)
})

test('VideoNode submits split Kling v3 Omni model ids instead of generic mode actualModel', () => {
  const marker = 'const klingV3OmniActualModel = computed(() => {'
  const start = source.indexOf(marker)
  assert.ok(start >= 0, 'klingV3OmniActualModel computed block should exist')
  const block = source.slice(start, start + 500)

  assert.match(block, /currentModelConfig\.value\?\.value\s*\|\|\s*selectedModel\.value/)
  assert.doesNotMatch(block, /currentKlingV3OmniModeConfig\.value\?\.actualModel\s*\|\|\s*selectedModel\.value/)
})

test('VideoNode keeps Kling advanced controls hidden for split Kling v3 Omni models', () => {
  const marker = '<!-- Kling 高级选项 - 摄像机控制（动作迁移模型不显示） -->'
  const start = source.indexOf(marker)
  assert.ok(start >= 0, 'Kling advanced template block should exist')
  const block = source.slice(start, start + 500)

  assert.match(block, /v-if="isKlingModel && !isKlingMotionControl && !isKlingV3OmniModel"/)
})

test('VideoNode does not send Kling sound override for split Kling v3 Omni models', () => {
  const marker = '// Kling 2.6+ 模型特有参数：声音开关和音色'
  const start = source.indexOf(marker)
  assert.ok(start >= 0, 'Kling sound submission block should exist')
  const block = source.slice(start, start + 700)

  assert.match(block, /isKling26Plus\.value && !isKlingV3OmniModel\.value/)
  assert.match(block, /formData\.append\('kling_sound', klingSoundEnabled\.value \? 'on' : 'off'\)/)
})

test('VideoNode does not render or submit a v3 Omni sound preservation toggle', () => {
  const marker = '} else if (isKlingV3OmniModel.value) {'
  const start = source.indexOf(marker)
  assert.ok(start >= 0, 'Kling v3 Omni submission branch should exist')
  const block = source.slice(start, start + 1000)

  assert.doesNotMatch(block, /formData\.append\('kling_omni_keep_sound', v3OmniKeepSound\.value\)/)
  assert.doesNotMatch(source, /v3OmniKeepSound\s*=/)
  assert.doesNotMatch(source, /:class="\['sd2-mode-btn sd2-mode-btn-sm', \{ active: v3OmniKeepSound === 'yes' \}\]"/)
})

test('VideoNode defines models before computed values that read models', () => {
  const modelsIndex = source.indexOf('const models = computed(() => {')
  const selectedLabelIndex = source.indexOf('const selectedModelLabel = computed(() => {')
  const currentConfigIndex = source.indexOf('const currentModelConfig = computed(() => {')

  assert.ok(modelsIndex >= 0, 'models computed should exist')
  assert.ok(selectedLabelIndex >= 0, 'selectedModelLabel computed should exist')
  assert.ok(currentConfigIndex >= 0, 'currentModelConfig computed should exist')
  assert.ok(
    modelsIndex < selectedLabelIndex,
    'models must be initialized before selectedModelLabel reads models.value'
  )
  assert.ok(
    modelsIndex < currentConfigIndex,
    'models must be initialized before currentModelConfig reads models.value'
  )
})
