import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('Wan animate mix canvas defaults use explicit model mode, no watermark, and 10 second reserve', () => {
  assert.match(source, /wanMode:\s*isWanModel\.value \? selectedWanMode\.value : ''/)
  assert.match(source, /wanAnimateMode:\s*isWanModel\.value && selectedWanMode\.value === 'animate_mix' \? selectedWanAnimateMode\.value : ''/)
  assert.match(source, /wanAnimateModeOptions/)
  assert.match(source, /formData\.append\('wan_animate_mode',\s*wanAnimateMode\)/)
  assert.match(source, /wanMode:\s*capturedState\.wanMode/)
  assert.match(source, /capturedState\.apiType,\s*\{\s*wanMode:\s*capturedState\.wanMode\s*\}/)
  assert.match(source, /wanMode === 'animate_mix'\s*\?\s*5 \* 1024 \* 1024/)
  assert.match(source, /seedance_watermark',\s*currentModelConfig\.value\?\.wanConfig\?\.watermark === true \? 'true' : 'false'/)
  assert.match(source, /currentModelConfig\.value\?\.wanConfig\?\.defaultDuration \|\| 10/)
  assert.match(source, /const wanAnimateCostPerSecond = computed/)
  assert.match(source, /isWanModel && selectedWanMode === 'animate_mix'[\s\S]*formatPoints\(wanAnimateCostPerSecond\)[\s\S]*积分\/s/)
})

test('Wan animate mode ref does not read currentModelConfig before initialization', () => {
  const declaration = source.match(/const selectedWanAnimateMode = ref\((.+)\)/)
  assert.ok(declaration, 'selectedWanAnimateMode ref should exist')
  assert.doesNotMatch(
    declaration[1],
    /currentModelConfig/,
    'selectedWanAnimateMode is created before currentModelConfig and must not read it synchronously'
  )
  assert.doesNotMatch(
    source,
    /if \(!props\.data\.wanAnimateMode && currentModelConfig\.value/,
    'currentModelConfig depends on models and must not be read synchronously during setup'
  )
})
