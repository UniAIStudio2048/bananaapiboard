import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
function evaluateComputed(name, sandbox) {
  const start = source.indexOf(`const ${name} = computed(() => {`)
  const end = source.indexOf('\n})', start) + 3
  return new Function('sandbox', `with (sandbox) { ${source.slice(start, end)}; return ${name} }`)({ computed: fn => fn(), ...sandbox })
}

test('fixed-duration multimodal estimates match billing; auto/edit retain the 10-second prepayment', () => {
  const ref = value => ({ value })
  for (const [mode, duration, prepaid, cost] of [
    ['multimodal_ref', 5, false, 75],
    ['multimodal_ref', '-1', true, 150],
    ['video_edit', 5, true, 150]
  ]) {
    const state = {
      isSeedance2Model: ref(true), selectedSeedance2Mode: ref(mode), selectedDuration: ref(duration),
      seedance25ModeConstraints: ref({ duration: -1 }),
      currentModelConfig: ref({ seedanceConfig: { resolutionCosts: { '480p': 15 } } }),
      genericVideoResolution: ref(''), seedanceResolution: ref('480p'),
      calculateVideoResolutionPrice: () => null,
      calculateSeedanceResolutionCost: ({ resolutionCosts, resolution, duration }) => resolutionCosts[resolution] * duration,
      shouldApplyVideoInputMultiplier: ref(false), isVeoModel: ref(false), isKlingO1Model: ref(false), isKlingV3OmniModel: ref(false)
    }
    assert.equal(evaluateComputed('isSeedancePrePaidBilling', state), prepaid)
    assert.equal(evaluateComputed('basePointsCost', state), cost)
  }
})
