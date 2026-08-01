import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateVideoResolutionPrice,
  getEnabledVideoResolutionOptions,
  resolveVideoResolutionPricing
} from './videoResolutionPricing.js'

const pricing = {
  '720p': { enabled: true, costPerSecond: 6 },
  '1080P': { enabled: true, costPerSecond: 10 },
  '4K': { enabled: false, costPerSecond: 20 }
}

test('只返回管理员启用的通用视频分辨率', () => {
  assert.deepEqual(getEnabledVideoResolutionOptions(pricing), ['720p', '1080P'])
})

test('分辨率不区分大小写匹配并按秒计算积分', () => {
  assert.deepEqual(resolveVideoResolutionPricing(pricing, '1080p'), {
    resolution: '1080P',
    costPerSecond: 10
  })
  assert.equal(calculateVideoResolutionPrice(pricing, '1080p', 5), 50)
})

test('未启用或没有有效单价时不覆盖原有计费', () => {
  assert.equal(resolveVideoResolutionPricing(pricing, '4k'), null)
  assert.equal(calculateVideoResolutionPrice({ '720p': { enabled: true } }, '720p', 5), null)
})
