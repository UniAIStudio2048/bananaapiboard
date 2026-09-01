import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('画布 MiniMax H3 读取统一视频输入倍率并提供应用判定', () => {
  assert.match(source, /const videoInputMultiplier = computed\(\(\) => \{[\s\S]*?resolveVideoInputMultiplier\(currentModelConfig\.value, referenceVideos\.value\.length\)/)
  assert.match(source, /const shouldApplyVideoInputMultiplier = computed\(\(\) => \{[\s\S]*?videoInputMultiplier\.value <= 1[\s\S]*?isSeedanceVideoInputMultiplierModel\.value \|\| isMinimaxH3Model\.value/)
})

test('画布通用分辨率按秒计费路径也应用视频输入倍率（与服务端一致）', () => {
  assert.match(source, /if \(genericResolutionPrice !== null\) \{[\s\S]*?if \(shouldApplyVideoInputMultiplier\.value\)[\s\S]*?applyVideoInputMultiplier\(genericResolutionPrice, videoInputMultiplier\.value\)[\s\S]*?return genericResolutionPrice/)
})

test('画布 MiniMax H3 分辨率每秒计费分支复用视频输入倍率判定', () => {
  assert.match(source, /if \(isMinimaxH3Model\.value\) \{[\s\S]*?if \(shouldApplyVideoInputMultiplier\.value\) \{[\s\S]*?h3Cost = applyVideoInputMultiplier\(h3Cost, videoInputMultiplier\.value\)/)
})

test('画布 MiniMax H3 有视频输入倍率时显示倍率标识', () => {
  assert.match(source, /v-if="shouldApplyVideoInputMultiplier"[\s\S]*?points-multiplier-chip[\s\S]*?formatVideoInputMultiplier\(videoInputMultiplier\)/)
})
