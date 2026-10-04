import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { calculateVideoResolutionPrice, resolveVideoResolutionPricing } from '../utils/videoResolutionPricing.js'

const pageSource = readFileSync(new URL('./VideoGeneration.vue', import.meta.url), 'utf8')
const nodeSource = readFileSync(new URL('../components/canvas/nodes/VideoNode.vue', import.meta.url), 'utf8')
const ref = value => ({ value })
const computed = callback => ({ get value() { return callback() } })
const model = apiType => ref({ apiType, resolutionPricing: { '480p': { enabled: true, costPerSecond: 7.13 } } })

function pagePrice(apiType, inputDurations, mode = 'multimodal_ref') {
  const start = pageSource.indexOf('const currentPointsCost = computed(() => {')
  const end = pageSource.indexOf('if (configuredResolutionPrice !== null)', start)
  return runInNewContext(`${pageSource.slice(start, end)} return configuredResolutionPrice\n}); currentPointsCost.value`, {
    computed, calculateVideoResolutionPrice, resolveVideoResolutionPricing,
    currentModelConfig: model(apiType), resolution: ref('480p'), duration: ref('4'),
    isReferenceVideoModel: ref(false), seedanceDuration: ref('4'), isWan3Model: ref(true),
    wan3Duration: ref('4'), wan3Mode: ref(mode), seedanceRefVideoPreviews: ref(inputDurations.map(duration => ({ duration })))
  })
}

function nodePrice(apiType, inputDuration, rate = 1) {
  const start = nodeSource.indexOf('const basePointsCost = computed(() => {')
  const end = nodeSource.indexOf('if (genericResolutionPrice !== null)', start)
  const pointsStart = nodeSource.indexOf('const pointsCost = computed(() => {')
  const pointsEnd = nodeSource.indexOf('\n})', pointsStart) + 3
  return runInNewContext(`${nodeSource.slice(start, end)} return genericResolutionPrice\n});\n${nodeSource.slice(pointsStart, pointsEnd)}; pointsCost.value`, {
    computed, calculateVideoResolutionPrice, resolveVideoResolutionPricing,
    currentModelConfig: model(apiType), genericVideoResolution: ref('480p'), selectedDuration: ref('4'),
    waveSpeedReferenceVideoDuration: ref(inputDuration), getUserNodeRate: () => rate
  })
}

test('WaveSpeed video page bills the full rounded-up reference duration with decimal rates', () => {
  assert.equal(pagePrice('wavespeed-wan3', []), 28.52)
  assert.equal(pagePrice('wavespeed-wan3', [1.1, 2.2]), 57.04)
  assert.equal(pagePrice('wavespeed-wan3', [6.1]), 78.43)
  assert.equal(pagePrice('wavespeed-wan3', [6.1], 'text2video'), 28.52)
})

test('WaveSpeed canvas preserves decimal totals and applies user rates', () => {
  assert.equal(nodePrice('wavespeed-wan3', 0), 28.52)
  assert.equal(nodePrice('wavespeed-wan3', 3.3), 57.04)
  assert.equal(nodePrice('wavespeed-wan3', 0, 1.5), 42.78)
})

test('existing integer pricing remains while Siray capped billing preserves decimal points', () => {
  assert.equal(pagePrice('wan3', [6.1]), 29)
  assert.equal(pagePrice('siray-wan3', [6.1]), 64.17)
  assert.equal(nodePrice('wan3', 0), 29)
})
