import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('画布 MiniMax H3 读取视频输入倍率并提供应用判定', () => {
  assert.match(source, /const minimaxH3VideoInputMultiplier = computed\(\(\) => \{[\s\S]*?currentModelConfig\.value\?\.minimaxConfig[\s\S]*?videoInputMultiplier[\s\S]*?\|\| 1/)
  assert.match(source, /const shouldApplyMinimaxH3VideoInputMultiplier = computed\(\(\) => \{[\s\S]*?isMinimaxH3Model\.value[\s\S]*?minimaxH3VideoInputMultiplier\.value > 1[\s\S]*?referenceVideos\.value\.length > 0/)
})

test('画布通用分辨率按秒计费路径也应用视频输入倍率（与服务端一致）', () => {
  assert.match(source, /if \(genericResolutionPrice !== null\) \{[\s\S]*?applySeedanceVideoInputMultiplier\(genericResolutionPrice, seedanceVideoInputMultiplier\.value, true\)[\s\S]*?Math\.round\(genericResolutionPrice \* minimaxH3VideoInputMultiplier\.value\)[\s\S]*?return genericResolutionPrice/)
})

test('画布 MiniMax H3 分辨率每秒计费分支复用视频输入倍率判定', () => {
  assert.match(source, /if \(shouldApplyMinimaxH3VideoInputMultiplier\.value\) \{[\s\S]*?h3Cost = Math\.round\(h3Cost \* minimaxH3VideoInputMultiplier\.value\)/)
})

test('画布 MiniMax H3 有视频输入倍率时显示倍率标识', () => {
  assert.match(source, /v-if="shouldApplyMinimaxH3VideoInputMultiplier"[\s\S]*?points-multiplier-chip[\s\S]*?formatPoints\(minimaxH3VideoInputMultiplier\)/)
})
