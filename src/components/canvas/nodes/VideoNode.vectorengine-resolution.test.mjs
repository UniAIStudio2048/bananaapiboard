import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const source = readFileSync(join(import.meta.dirname, 'VideoNode.vue'), 'utf8')

test('VideoNode exposes VectorEngine JSON resolution modes and persists selection', () => {
  assert.match(source, /const vectorengineResolution = ref\(props\.data\.vectorengineResolution \|\| '480p'\)/)
  assert.match(source, /const isVectorEngineJsonModel = computed/)
  assert.match(source, /const vectorengineResolutionOptions = computed/)
  assert.match(source, /vectorengineResolutionOptions\.value/)
  assert.match(source, /vectorengineResolution:\s*veResolution/)
})

test('VideoNode submits selected VectorEngine JSON resolution to video generation', () => {
  assert.match(source, /if \(isVectorEngineJsonModel\.value\) \{[\s\S]*?formData\.append\('resolution', capturedState\.videoResolution \|\| vectorengineResolution\.value\)/)
  assert.match(source, /if \(isVectorEngineJsonModel\.value\) return vectorengineResolutionOptions\.value/)
  assert.match(source, /:resolution-options="videoParameterResolutionOptions"/)
  assert.match(source, /else if \(isVectorEngineJsonModel\.value\) vectorengineResolution\.value = value/)
})
