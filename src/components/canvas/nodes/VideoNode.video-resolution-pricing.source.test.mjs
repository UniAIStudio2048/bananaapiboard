import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('画布视频节点支持通用分辨率按秒价格的选择、预估和提交', () => {
  assert.match(source, /const genericVideoResolution = ref\(props\.data\.videoResolution \|\| ''\)/)
  assert.match(source, /getEnabledVideoResolutionOptions\(currentModelConfig\.value\?\.resolutionPricing\)/)
  assert.match(source, /calculateVideoResolutionPrice\(\s*currentModelConfig\.value\?\.resolutionPricing,\s*genericVideoResolution\.value,\s*selectedDuration\.value\s*\)/)
  assert.match(source, /formData\.append\('resolution', capturedState\.videoResolution \|\| genericVideoResolution\.value\)/)
})
