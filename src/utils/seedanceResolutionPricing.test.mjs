import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateSeedanceResolutionCost,
  getSeedanceResolutionOptions
} from './seedanceResolutionPricing.js'

test('Seedance 分辨率选项优先使用租户配置的显示分辨率', () => {
  assert.deepEqual(getSeedanceResolutionOptions({
    displayResolutions: ['480P', '1080p'],
    resolutionCosts: { '480p': 9, '720p': 15, '1080p': 21 },
    defaultResolution: '720p'
  }), ['480p', '1080p'])
})

test('Seedance 未配置显示分辨率时从按秒计费配置推导选项', () => {
  assert.deepEqual(getSeedanceResolutionOptions({
    resolutionCosts: { '480p': 9, '720p': 15, '1080p': 21 },
    defaultResolution: '720p'
  }), ['480p', '720p', '1080p'])
})

test('Seedance 按所选分辨率和时长计算积分', () => {
  assert.equal(calculateSeedanceResolutionCost({
    resolutionCosts: { '480p': 9, '720p': 15 },
    resolution: '480P',
    duration: 4
  }), 36)
})

test('Seedance 未配置所选分辨率单价时保留旧的按时长计费回退', () => {
  assert.equal(calculateSeedanceResolutionCost({
    resolutionCosts: { '480p': 9 },
    resolution: '720p',
    duration: 4
  }), null)
})
