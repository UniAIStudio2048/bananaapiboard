import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { computed, ref } from 'vue'
import { getEnabledVideoResolutionOptions, calculateVideoResolutionPrice } from '../../../utils/videoResolutionPricing.js'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const filterStart = source.indexOf('function filterResolutionDisplay(options) {')
const filterEnd = source.indexOf('\nconst genericVideoResolution =', filterStart)
const start = source.indexOf('const minimaxH3ResolutionOptions = computed(() => {')
const end = source.indexOf('\n})', start) + '\n})'.length
assert.ok(filterStart >= 0 && start >= 0 && end > start)

function options(model) {
  return runInNewContext(`${source.slice(filterStart, filterEnd)}\n${source.slice(start, end)}; minimaxH3ResolutionOptions.value`, {
    computed, currentModelConfig: ref(model), isMinimaxH3Model: ref(true), isAtlasCloudVideoModel: ref(true), getEnabledVideoResolutionOptions
  })
}

const config = {
  displayResolutions: ['768P', '480p'],
  resolutionPricing: { '2k': { enabled: false, costPerSecond: 18 }, '480p': { enabled: true, costPerSecond: 3.2 }, '768P': { enabled: true, costPerSecond: 5 } }
}

test('AtlasCloud dropdown follows enabled pricing: 480P and 768P, no disabled 2K', () => {
  const result = options(config)
  assert.deepEqual(Array.from(result, r => r.value), ['480p', '768P'])
  assert.deepEqual(Array.from(result, r => r.label), ['480P', '768P'])
  assert.equal(calculateVideoResolutionPrice(config.resolutionPricing, result[0].value, 8), 26)
})

test('AtlasCloud respects hidden resolution choices and retains legacy defaults without pricing', () => {
  assert.deepEqual(Array.from(options({ ...config, displayResolutions: [] })), [])
  assert.deepEqual(Array.from(options({ ...config, displayResolutions: ['768P'] }), r => r.value), ['768P'])
  assert.deepEqual(Array.from(options({}), r => r.value), ['768P', '2K'])
})
