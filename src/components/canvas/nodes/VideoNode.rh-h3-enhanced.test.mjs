import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { computed, ref } from 'vue'
const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('RH H3 uses the three-mode H3 menu and retains the tenant model for billing', () => {
  const model = { apiType: 'rh-h3-enhanced', actualModel: 'minimax-h3-rh-enhanced', minimaxConfig: { defaultMode: 'text2video' } }
  const start = source.indexOf('const isAtlasCloudVideoModel =')
  const end = source.indexOf('// Wan 3.0 模式选择', start)
  const result = runInNewContext(`${source.slice(start, end)}; ({ enabled: isMinimaxH3Model.value, modes: minimaxH3Modes.value, defaultMode: minimaxH3DefaultMode.value })`, { computed, ref, currentModelConfig: ref(model), props: { data: {} } })
  assert.equal(result.enabled, true)
  assert.deepEqual(Array.from(result.modes, m => m.value), ['text2video', 'image2video_first', 'multimodal_ref'])
  assert.equal(result.defaultMode, 'text2video')
  assert.ok(source.includes("capturedState.apiType === 'rh-h3-enhanced'"))
})

test('shared display billing preserves exact fractional points at each resolution', () => {
  const pricing = { '480p': { enabled: true, costPerSecond: 2.7 }, '768p': { enabled: true, costPerSecond: 3.75 }, '1080p': { enabled: true, costPerSecond: 6.3 } }
  const start = source.indexOf('const basePointsCost = computed(() => {')
  const end = source.indexOf('  const genericResolutionPrice =', start)
  for (const [size, expected] of [['480p', 10.8], ['768p', 15], ['1080p', 25.2]]) {
    const body = source.slice(start, end) + '\n}) ; basePointsCost.value'
    const actual = runInNewContext(body, { computed, currentModelConfig: ref({ apiType: 'rh-h3-enhanced', resolutionPricing: pricing }), genericVideoResolution: ref(size), selectedDuration: ref(4), waveSpeedReferenceVideoDuration: ref(0), resolveVideoResolutionPricing: (p,r) => p[r] })
    assert.equal(actual, expected)
  }
})

test('final points display retains decimals after user-group pricing', () => {
  const start = source.indexOf('const pointsCost = computed(() => {')
  const end = source.indexOf('\nconst klingOfficialSelectedDurationCost', start)
  const actual = runInNewContext(source.slice(start, end) + '; pointsCost.value', { computed, basePointsCost: ref(10.8), currentModelConfig: ref({ apiType: 'rh-h3-enhanced' }), getUserNodeRate: () => 1 })
  assert.equal(actual, 10.8)
})
