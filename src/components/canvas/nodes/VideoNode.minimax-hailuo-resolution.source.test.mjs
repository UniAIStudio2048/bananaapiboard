import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('./VideoNode.vue', import.meta.url)), 'utf8')
const tenantSource = readFileSync(fileURLToPath(new URL('../../../config/tenant.js', import.meta.url)), 'utf8')

test('画布 MiniMax 海螺官方直连节点提供分辨率选择并持久化', () => {
  assert.match(source, /const isMinimaxHailuoModel = computed\(/)
  assert.match(source, /const minimaxHailuoResolution = ref\(props\.data\.minimaxHailuoResolution \|\| ''\)/)
  assert.match(source, /const minimaxHailuoResolutionOptions = computed\(/)
  assert.match(source, /currentModelConfig\.value\?\.resolutionCosts/)
  assert.match(source, /currentModelConfig\.value\?\.minimaxConfig\?\.resolution/)
  assert.match(source, /const videoParameterResolutionOptions = computed\(\(\) => \{[\s\S]*isMinimaxHailuoModel\.value[\s\S]*minimaxHailuoResolutionOptions\.value\.map/)
  assert.match(source, /const selectedVideoParameterResolution = computed\(\{[\s\S]*isMinimaxHailuoModel\.value\) return minimaxHailuoResolution\.value[\s\S]*isMinimaxHailuoModel\.value\) minimaxHailuoResolution\.value = value/)
  assert.match(source, /canvasStore\.updateNodeData\(props\.id, \{ minimaxHailuoResolution: resolution \}\)/)
})

test('画布 MiniMax 海螺 1080P 仅提供 6 秒时长（与 9000 后台矩阵一致）', () => {
  assert.match(source, /const minimaxHailuoDurationsByResolution = \{[\s\S]*?'1080P': \[6\]/)
  assert.match(source, /minimaxHailuoDurationsByResolution\[minimaxHailuoResolution\.value\]/)
})

test('画布 MiniMax 海螺视频请求携带所选分辨率', () => {
  assert.match(source, /formData\.append\('resolution', capturedState\.videoResolution \|\| capturedState\.minimaxHailuoResolution \|\| minimaxHailuoResolution\.value\)/)
  assert.match(source, /minimaxHailuoResolution: isMinimaxHailuoModel\.value \? minimaxHailuoResolution\.value : ''/)
})

test('画布 MiniMax 海螺成本预估按分辨率计费并回退 pointsCost', () => {
  assert.match(source, /isMinimaxHailuoModel\.value\) \{\n    const resCosts = currentModelConfig\.value\?\.resolutionCosts\?\.\[minimaxHailuoResolution\.value\]/)
  assert.match(source, /resCosts\?\.\[durationKey\]/)
})

test('租户公开视频模型配置向画布公开 MiniMax 海螺分辨率计费', () => {
  assert.match(tenantSource, /minimaxConfig: modelConfig\.minimaxConfig,\n\s*resolutionCosts: modelConfig\.resolutionCosts,\n\s*hasResolutionPricing: modelConfig\.hasResolutionPricing === true/)
  assert.match(tenantSource, /minimaxConfig: modelFullConfig\.minimaxConfig,\n\s*resolutionCosts: modelFullConfig\.resolutionCosts,\n\s*hasResolutionPricing: modelFullConfig\.hasResolutionPricing === true/)
})
