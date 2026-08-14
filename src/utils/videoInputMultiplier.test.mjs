import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveVideoInputMultiplier,
  applyVideoInputMultiplier,
  formatVideoInputMultiplier
} from './videoInputMultiplier.js'

// 1~10 档：下标 = 输入视频个数 - 1
const tenTierConfig = {
  videoInputMultipliers: [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6]
}

test('resolveVideoInputMultiplier 按个数取对应档位（1~10）', () => {
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 1), 1)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 2), 1.5)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 3), 2)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 4), 2.5)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 5), 3)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 6), 3.5)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 7), 4)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 8), 4.5)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 9), 5)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 10), 6)
})

test('resolveVideoInputMultiplier 超过 10 个取第 10 档（下标 9）', () => {
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 11), 6)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 20), 6)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 100), 6)
})

test('resolveVideoInputMultiplier 缺省为 1（无配置 / 数组全 1）', () => {
  assert.equal(resolveVideoInputMultiplier({}, 3), 1)
  assert.equal(resolveVideoInputMultiplier({ videoInputMultipliers: undefined }, 3), 1)
  assert.equal(resolveVideoInputMultiplier({ videoInputMultipliers: [] }, 3), 1)
  assert.equal(resolveVideoInputMultiplier({ videoInputMultipliers: [1, 1, 1] }, 5), 1)
})

test('resolveVideoInputMultiplier 旧字段回退（seedanceConfig / minimaxConfig / 顶层）', () => {
  assert.equal(
    resolveVideoInputMultiplier({ seedanceConfig: { videoInputMultiplier: 1.5 } }, 3),
    1.5
  )
  assert.equal(
    resolveVideoInputMultiplier({ minimaxConfig: { videoInputMultiplier: 2 } }, 3),
    2
  )
  assert.equal(
    resolveVideoInputMultiplier({ videoInputMultiplier: 3 }, 3),
    3
  )
  // seedanceConfig 优先于 minimaxConfig 与顶层
  assert.equal(
    resolveVideoInputMultiplier(
      { seedanceConfig: { videoInputMultiplier: 1.5 }, minimaxConfig: { videoInputMultiplier: 2 }, videoInputMultiplier: 3 },
      3
    ),
    1.5
  )
})

test('resolveVideoInputMultiplier 新数组字段优先于旧字段', () => {
  assert.equal(
    resolveVideoInputMultiplier(
      { videoInputMultipliers: [1, 2, 4], seedanceConfig: { videoInputMultiplier: 9 } },
      2
    ),
    2
  )
})

test('resolveVideoInputMultiplier 数组项非法时回退旧字段再回退 1', () => {
  // 下标项非法（0 / NaN / 越界）
  assert.equal(
    resolveVideoInputMultiplier({ videoInputMultipliers: [1, 0], seedanceConfig: { videoInputMultiplier: 1.5 } }, 2),
    1.5
  )
  assert.equal(
    resolveVideoInputMultiplier({ videoInputMultipliers: [1, 0], minimaxConfig: { videoInputMultiplier: 2 } }, 2),
    2
  )
  assert.equal(
    resolveVideoInputMultiplier({ videoInputMultipliers: [1, 0] }, 2),
    1
  )
})

test('resolveVideoInputMultiplier 0 / 负 / 非法 count 归一为 1（不乘）', () => {
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 0), 1)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, -1), 1)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, 'abc'), 1)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, NaN), 1)
  assert.equal(resolveVideoInputMultiplier(tenTierConfig, null), 1)
})

test('applyVideoInputMultiplier 应用倍率并四舍五入到整数积分', () => {
  assert.equal(applyVideoInputMultiplier(100, 1), 100)
  assert.equal(applyVideoInputMultiplier(100, 1.5), 150)
  assert.equal(applyVideoInputMultiplier(13, 1.5), 20) // 19.5 -> 20
  assert.equal(applyVideoInputMultiplier(100, 6), 600)
  // 倍率非法时按 1 处理
  assert.equal(applyVideoInputMultiplier(100, 0), 100)
  assert.equal(applyVideoInputMultiplier(100, NaN), 100)
})

test('formatVideoInputMultiplier 格式化倍率角标文本', () => {
  assert.equal(formatVideoInputMultiplier(1.5), '1.5x')
  assert.equal(formatVideoInputMultiplier(6), '6x')
  assert.equal(formatVideoInputMultiplier(0), '1x')
  assert.equal(formatVideoInputMultiplier(NaN), '1x')
})
