import assert from 'node:assert/strict'
import test from 'node:test'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const nodeSource = readFileSync(join(here, 'VideoNode.vue'), 'utf8')
const dropdownPath = join(here, '../VideoParametersDropdown.vue')
const dropdownSource = existsSync(dropdownPath) ? readFileSync(dropdownPath, 'utf8') : ''

test('VideoNode routes every existing video resolution mapping through the unified dropdown', () => {
  assert.match(nodeSource, /const videoParameterResolutionOptions = computed\(\(\) => \{[\s\S]*viduDisplayResolutions[\s\S]*vectorengineResolutionOptions[\s\S]*runningHubResolutionOptions[\s\S]*minimaxHailuoResolutionOptions[\s\S]*availableVeoResolutions/)
  assert.match(nodeSource, /const selectedVideoParameterResolution = computed\(\{[\s\S]*viduResolution\.value[\s\S]*vectorengineResolution\.value[\s\S]*runningHubResolution\.value[\s\S]*minimaxHailuoResolution\.value[\s\S]*veoResolution\.value/)
  assert.match(nodeSource, /:duration="selectedDuration"[\s\S]*@update:duration="selectVideoDuration"/)
})

test('video parameter dropdown uses one trigger, aspect cards, and the requested duration controls', () => {
  assert.match(dropdownSource, /class="video-parameters-trigger"/)
  assert.match(dropdownSource, /class="video-parameters-panel"/)
  assert.match(dropdownSource, /class="video-aspect-ratio-grid"/)
  assert.match(dropdownSource, /v-if="durationOptions\.length <= 6"/)
  assert.match(dropdownSource, /v-else[\s\S]*type="range"/)
  assert.match(dropdownSource, /update:duration/)
})

test('Seedance 2.5 adaptive ratio keeps its request value but localizes its display label', () => {
  assert.match(nodeSource, /value: seedance25ModeConstraints\.value\.ratio,[\s\S]*displayLabel: currentLanguage\.value\?\.startsWith\('zh'\) \? '自适应' : 'Auto'/)
  assert.match(dropdownSource, /currentAspectRatio\.value\?\.displayLabel \|\| currentAspectRatio\.value\?\.value/)
  assert.match(dropdownSource, /option\.displayLabel \|\| option\.value/)
})
