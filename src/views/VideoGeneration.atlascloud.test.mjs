import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./VideoGeneration.vue', import.meta.url), 'utf8')
test('AtlasCloud initial ratio is a string for both normalized and raw model options', () => {
  const expression = source.match(/seedanceRatio\.value = minimaxConfig\.ratio[^\n]+/)[0]
  const initialize = new Function('modelConfig', 'aspectValues', 'isAtlasCloudVideoModel', 'minimaxConfig', 'seedanceRatio', `${expression}; return seedanceRatio.value`)
  for (const aspectRatios of [['16:9'], [{ value: '16:9', label: '横屏' }]]) {
    assert.equal(initialize({ aspectRatios }, ['16:9'], { value: true }, {}, {}), '16:9')
  }
  assert.equal(initialize({ aspectRatios: ['adaptive'] }, ['adaptive'], { value: true }, {}, {}), 'adaptive')
  assert.equal(initialize({}, [], { value: false }, {}, {}), 'adaptive')
})
