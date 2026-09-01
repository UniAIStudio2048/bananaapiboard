import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('Seedance 2.0 画布节点显示分辨率选择并持久化选择值', () => {
  assert.match(source, /const seedanceResolutionOptions = computed\(\(\) =>/)
  assert.match(source, /if \(isSeedance2Model\.value\) return seedanceResolutionOptions\.value/)
  assert.match(source, /seedanceResolution: seedanceRes/)
})

test('Seedance 2.0 提交请求传递画布所选分辨率快照', () => {
  assert.match(source, /seedance_resolution', capturedState\.seedanceResolution \|\| seedanceResolution\.value/)
  assert.match(source, /seedanceResolution: isSeedance2Model\.value \? seedanceResolution\.value : ''/)
})

test('Seedance 2.0 以所选分辨率单价按秒计算后保留视频输入倍率', () => {
  assert.match(source, /calculateSeedanceResolutionCost\(/)
  assert.match(source, /shouldApplyVideoInputMultiplier\.value[\s\S]*?applyVideoInputMultiplier\(seedanceResolutionCost, videoInputMultiplier\.value\)/)
})
