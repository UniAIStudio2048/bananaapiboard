import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { resolveVideoResolutionPricing, calculateVideoResolutionPrice } from './videoResolutionPricing.js'
import { applyNodeRateToPoints } from './userGroupRate.js'
import { estimateWan3Points } from './wan3Billing.js'

test('canvas and generation page bill full input seconds with the rate for the submitted video count', () => {
  for (const [file, name, endMarker] of [
    ['../components/canvas/nodes/VideoNode.vue', 'basePointsCost', '  // VEO 模型'],
    ['../views/VideoGeneration.vue', 'currentPointsCost', '  const seedanceResolutionCost']
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    const start = source.indexOf(`const ${name} = computed(() => {`) + `const ${name} = computed(() => {`.length
    const body = source.slice(start, source.indexOf(endMarker, start))
    for (const apiType of ['wan3', 'wavespeed-wan3', 'siray-wan3', 'routerbee-wan3']) {
      for (const [durations, expected] of [[[], 24], [[1.25], 47.25], [[4.25, 2.125], 49.8]]) {
        const refs = {
          currentModelConfig: { value: { apiType, videoInputMultipliers: [1.5, 0.8], resolutionPricing: { '480p': { enabled: true, costPerSecond: 6 } } } },
          isMotionTransferModel: { value: false }, isLongCatModel: { value: false },
          selectedDuration: { value: 4 }, genericVideoResolution: { value: '480p' }, wan3QuoteReady: { value: true },
          wan3ReferenceDurations: { value: durations }, resolution: { value: '480p' },
          wan3Duration: { value: 4 }, wan3Mode: { value: 'multimodal_ref' },
          wan3UrlDurations: { value: [] }, seedanceRefVideoUrls: { value: [] },
          seedanceRefVideoPreviews: { value: durations.map(duration => ({ duration })) },
          isWan3Model: { value: true }, isRouterBeeWan3Model: { value: apiType === 'routerbee-wan3' },
          me: { value: null }, estimateWan3Points, resolveVideoResolutionPricing, calculateVideoResolutionPrice, applyNodeRateToPoints
        }
        const value = runInNewContext(`(() => {${body}})()`, refs)
        assert.equal(applyNodeRateToPoints(value, 1), expected, `${name}, ${apiType}, ${durations}`)
      }
    }
  }
})

test('canvas final estimate keeps fractional Siray points after applying the user rate', () => {
  const source = readFileSync(new URL('../components/canvas/nodes/VideoNode.vue', import.meta.url), 'utf8')
  const marker = 'const pointsCost = computed(() => {'
  const start = source.indexOf(marker) + marker.length
  const body = source.slice(start, source.indexOf('\n})', start))
  const context = { currentModelConfig: { value: { apiType: 'siray-wan3' } }, basePointsCost: { value: 47.25 }, getUserNodeRate: () => 1, applyNodeRateToPoints, userGroupRateVersion: { value: 0 } }
  assert.equal(runInNewContext(`(() => {${body}})()`, context), 47.25)
})
