import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const videoNodeSource = readFileSync(new URL('./nodes/VideoNode.vue', import.meta.url), 'utf8')
const tenantConfigSource = readFileSync(new URL('../../config/tenant.js', import.meta.url), 'utf8')

function sliceAround(source, needle, length = 2600) {
  const start = source.indexOf(needle)
  assert.ok(start >= 0, `${needle} should exist`)
  return source.slice(start, start + length)
}

test('tenant video model mapping exposes Coze video swap billing metadata', () => {
  const mappedModelBlock = sliceAround(tenantConfigSource, 'costPerSecond: modelConfig.costPerSecond')

  assert.match(mappedModelBlock, /prePaidDuration:\s*modelConfig\.prePaidDuration/)
  assert.match(mappedModelBlock, /isMotionControl:\s*modelConfig\.isMotionControl/)
  assert.match(mappedModelBlock, /cozeConfig:\s*modelConfig\.cozeConfig/)
})

test('VideoNode treats Coze video swap as a per-second video swap model', () => {
  assert.match(videoNodeSource, /const isCozeVideoSwapModel = computed/)

  const detectionBlock = sliceAround(videoNodeSource, 'const isKlingMotionControl = computed')
  assert.match(detectionBlock, /isCozeVideoSwapModel\.value/)
  assert.match(detectionBlock, /currentModelConfig\.value\?\.isMotionControl/)

  const costBlock = sliceAround(videoNodeSource, 'const motionCostPerSecond = computed')
  assert.match(costBlock, /typeof costPerSecond === 'number'/)
  assert.match(costBlock, /costPerSecond\.coze/)
})

test('VideoNode submits upstream video url and duration for Coze settlement', () => {
  const submitBlock = sliceAround(videoNodeSource, 'if (isKlingMotionControl.value)', 1700)

  assert.match(submitBlock, /kling_motion_video_url/)
  assert.match(submitBlock, /source_video_duration/)
  assert.match(submitBlock, /isCozeVideoSwapModel\.value/)
  assert.match(submitBlock, /Coze 视频换人/)
})

test('Coze video swap submits the uploaded accessible reference video url', () => {
  const backgroundBlock = sliceAround(videoNodeSource, 'const shouldPrepareReferenceVideos = capturedState.isSeedance2', 1000)
  assert.match(backgroundBlock, /capturedState\.motionVideoUrl\s*=\s*accessibleReferenceVideos\?\.\[0\]/)

  const submitBlock = sliceAround(videoNodeSource, 'const motionVideoUrl =', 700)
  assert.match(submitBlock, /capturedState\?\.motionVideoUrl/)
  assert.match(submitBlock, /upstreamVideoUrl\.value/)
})
