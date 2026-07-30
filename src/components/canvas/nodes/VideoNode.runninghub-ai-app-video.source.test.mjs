import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('./VideoNode.vue', import.meta.url)), 'utf8')
const tenantSource = readFileSync(fileURLToPath(new URL('../../../config/tenant.js', import.meta.url)), 'utf8')

test('画布 RunningHub 视频节点提供模型配置的分辨率选项，并默认 720p', () => {
  assert.match(source, /const isRunningHubAiAppVideoModel = computed\(/)
  assert.match(source, /const runningHubResolution = ref\(props\.data\.resolution \|\| '720p'\)/)
  assert.match(source, /const runningHubResolutionOptions = computed\(/)
  assert.match(source, /currentModelConfig\.value\?\.resolutionOptions/)
  assert.match(source, /v-if="isRunningHubAiAppVideoModel && runningHubResolutionOptions\.length > 1"/)
})

test('画布 RunningHub 视频请求与节点数据携带所选分辨率', () => {
  assert.match(source, /formData\.append\('resolution', capturedState\.resolution \|\| runningHubResolution\.value\)/)
  assert.match(source, /resolution: isRunningHubAiAppVideoModel\.value \? runningHubResolution\.value : ''/)
  assert.match(source, /canvasStore\.updateNodeData\(props\.id, \{ resolution \}\)/)
})

test('画布 RunningHub 视频成本预估使用固定积分、倍率与每秒积分', () => {
  assert.match(source, /resolutionFixedCosts/)
  assert.match(source, /resolutionMultipliers/)
  assert.match(source, /costPerSecond/)
})

test('租户公开视频模型配置向画布公开 RunningHub 固定积分', () => {
  assert.match(tenantSource, /resolutionFixedCosts: modelConfig\.resolutionFixedCosts/)
  assert.match(tenantSource, /resolutionFixedCosts: modelFullConfig\.resolutionFixedCosts/)
})
