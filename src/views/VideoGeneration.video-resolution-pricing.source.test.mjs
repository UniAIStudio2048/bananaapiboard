import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./VideoGeneration.vue', import.meta.url), 'utf8')

test('视频生成页只向用户展示管理员启用的通用分辨率', () => {
  assert.match(source, /getEnabledVideoResolutionOptions\(currentModelConfig\.value\?\.resolutionPricing\)/)
})

test('视频生成页优先按配置的分辨率积分每秒预估', () => {
  assert.match(source, /calculateVideoResolutionPrice\(\s*currentModelConfig\.value\?\.resolutionPricing,\s*resolution\.value,\s*isSeedanceModel\.value \? seedanceDuration\.value : duration\.value\s*\)/)
})

test('Seedance 请求在配置通用分辨率价格时使用当前通用分辨率', () => {
  assert.match(source, /const selectedSeedanceResolution = getEnabledVideoResolutionOptions\(currentModelConfig\.value\?\.resolutionPricing\)\.length > 0\s*\? resolution\.value\s*:\s*seedanceResolution\.value/)
  assert.match(source, /formData\.append\('seedance_resolution', selectedSeedanceResolution\)/)
})

test('Seedance 价格预估复用画布端的按分辨率每秒计费规则', () => {
  assert.match(source, /import \{ calculateSeedanceResolutionCost \} from '@\/utils\/seedanceResolutionPricing'/)
  assert.match(source, /const seedanceResolutionCost = calculateSeedanceResolutionCost\(\{\s*resolutionCosts: currentModelConfig\.value\?\.seedanceConfig\?\.resolutionCosts,\s*resolution: seedanceResolution\.value,\s*duration: seedanceDuration\.value\s*\}\)/)
  assert.match(source, /if \(seedanceResolutionCost !== null\) return seedanceResolutionCost/)
})

test('Seedance 只提交实际选择的 seedance_resolution，避免通用默认分辨率覆盖它', () => {
  assert.match(source, /if \(hasVideoResolutionSelection\.value && !isSeedanceModel\.value\) \{\s*formData\.append\('resolution', resolution\.value\)/)
})
