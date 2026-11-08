import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { resolveVideoResolutionPricing } from './videoResolutionPricing.js'
import { formatVideoNodePoints } from './canvasVideoPointsDisplay.js'

test('video node deduction display keeps up to two fractional digits', () => {
  for (const [value, expected] of [[12.85, '12.85'], [2.142, '2.14'], [10, '10'], [0, '0'], [1.25, '1.25'], [0.1, '0.1'], [null, '0'], [NaN, '0']]) assert.equal(formatVideoNodePoints(value), expected)
})

test('GK canvas estimate preserves per-second precision and group-rate precision until display', () => {
  const source = readFileSync(new URL('../components/canvas/nodes/VideoNode.vue', import.meta.url), 'utf8')
  const marker = 'const basePointsCost = computed(() => {'
  const start = source.indexOf(marker) + marker.length
  const body = source.slice(start, source.indexOf('  const genericResolutionPrice', start))
  const refs = { currentModelConfig: { value: { apiType: 'heizhu-video', resolutionPricing: { '720p': { enabled: true, costPerSecond: 2.142 } } } },
    genericVideoResolution: { value: '720p' }, selectedDuration: { value: 6 }, waveSpeedReferenceVideoDuration: { value: 0 }, resolveVideoResolutionPricing }
  const base = runInNewContext(`(() => {${body}})()`, refs)
  assert.equal(base, 12.85)
  const rateMarker = 'const pointsCost = computed(() => {'
  const rateStart = source.indexOf(rateMarker) + rateMarker.length
  const rateBody = source.slice(rateStart, source.indexOf('\n})', rateStart))
  const cost = runInNewContext(`(() => {${rateBody}})()`, { ...refs, basePointsCost: { value: base }, getUserNodeRate: () => 1 })
  assert.equal(cost, 12.85)
  assert.equal(formatVideoNodePoints(cost), '12.85')
})

test('GK beginner generation page also preserves fractional quote', () => {
  const source = readFileSync(new URL('../views/VideoGeneration.vue', import.meta.url), 'utf8')
  const marker = 'const currentPointsCost = computed(() => {'
  const start = source.indexOf(marker) + marker.length
  const body = source.slice(start, source.indexOf('  const seedanceResolutionCost', start))
  const refs = { currentModelConfig: { value: { apiType: 'heizhu-video', resolutionPricing: { '720p': { enabled: true, costPerSecond: 2.142 } } } },
    resolution: { value: '720p' }, duration: { value: 6 }, resolveVideoResolutionPricing,
    isReferenceVideoModel: { value: false }, isWan3Model: { value: false }, calculateVideoResolutionPrice: () => 13 }
  assert.equal(runInNewContext(`(() => {${body}})()`, refs), 12.85)
})

test('GK canvas keeps all five configured aspect ratio choices', () => {
  const source = readFileSync(new URL('../components/canvas/nodes/VideoNode.vue', import.meta.url), 'utf8')
  const start = source.indexOf('const aspectRatios = [')
  const end = source.indexOf('// ========== 厂商分组', start)
  const result = runInNewContext(`${source.slice(start, end)};availableAspectRatios`, {
    computed: fn => fn(), currentLanguage: { value: 'zh-CN' }, seedance25ModeConstraints: { value: null },
    currentModelConfig: { value: { aspectRatios: ['16:9', '9:16', '1:1', '3:2', '2:3'] } }
  })
  assert.deepEqual(Array.from(result, option => option.value).sort(), ['16:9', '9:16', '1:1', '3:2', '2:3'].sort())
})
