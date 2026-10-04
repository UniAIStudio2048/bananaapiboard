import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { resolveVideoResolutionPricing, calculateVideoResolutionPrice } from './videoResolutionPricing.js'

test('canvas and generation page preserve Siray fractional input seconds and five-second cap', () => {
  for (const [file, name, endMarker] of [
    ['../components/canvas/nodes/VideoNode.vue', 'basePointsCost', '  // VEO 模型'],
    ['../views/VideoGeneration.vue', 'currentPointsCost', '  const seedanceResolutionCost']
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    const start = source.indexOf(`const ${name} = computed(() => {`) + `const ${name} = computed(() => {`.length
    const body = source.slice(start, source.indexOf(endMarker, start))
    for (const [rate, input, expected] of [[6, 0, 24], [9, 0, 36], [6, 1.25, 31.5], [9, 1.25, 47.25], [6, 5, 54]]) {
      const refs = { currentModelConfig: { value: { apiType: 'siray-wan3', resolutionPricing: { '480p': { enabled: true, costPerSecond: rate } } } },
        selectedDuration: { value: 4 }, genericVideoResolution: { value: '480p' }, waveSpeedReferenceVideoDuration: { value: input },
        resolution: { value: '480p' }, wan3Duration: { value: 4 }, wan3Mode: { value: 'multimodal_ref' }, seedanceRefVideoPreviews: { value: [{ duration: input }] }, resolveVideoResolutionPricing, calculateVideoResolutionPrice,
        shouldApplyVideoInputMultiplier: { value: false }, isReferenceVideoModel: { value: false }, isWan3Model: { value: true } }
      assert.equal(runInNewContext(`(() => {${body}})()`, refs), expected, `${name}, rate ${rate}, input ${input}`)
    }
  }
})

test('canvas final estimate keeps fractional Siray points after applying the user rate', () => {
  const source = readFileSync(new URL('../components/canvas/nodes/VideoNode.vue', import.meta.url), 'utf8')
  const marker = 'const pointsCost = computed(() => {'
  const start = source.indexOf(marker) + marker.length
  const body = source.slice(start, source.indexOf('\n})', start))
  const context = { currentModelConfig: { value: { apiType: 'siray-wan3' } }, basePointsCost: { value: 47.25 }, getUserNodeRate: () => 1 }
  assert.equal(runInNewContext(`(() => {${body}})()`, context), 47.25)
})
