import test from 'node:test'
import assert from 'node:assert/strict'

import {
  resolveVideoInputMultiplier,
  applyVideoInputMultiplier,
  formatVideoInputMultiplier,
  resolveBilledReferenceVideoCount
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

test('applyVideoInputMultiplier 应用倍率并与后端 roundPoints 一致保留两位小数', () => {
  assert.equal(applyVideoInputMultiplier(100, 1), 100)
  assert.equal(applyVideoInputMultiplier(100, 1.5), 150)
  assert.equal(applyVideoInputMultiplier(13, 1.5), 19.5) // 后端 roundPoints(13 × 1.5) = 19.5
  assert.equal(applyVideoInputMultiplier(2470, 1.5), 3705)
  assert.equal(applyVideoInputMultiplier(166.65, 1.25), 208.31)
  assert.equal(applyVideoInputMultiplier(1.005, 1), 1.01) // 与后端 Number.EPSILON 舍入一致
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

test('resolveBilledReferenceVideoCount：万相 3.0 仅参考/编辑/延长模式提交视频，并受 maxVideos 限制', () => {
  const config = { apiType: 'wan3', wan3Config: {} }
  assert.equal(resolveBilledReferenceVideoCount({ config, mode: 'multimodal_ref', referenceVideoCount: 1 }), 1)
  assert.equal(resolveBilledReferenceVideoCount({ config, mode: 'video_edit', referenceVideoCount: 2 }), 2)
  assert.equal(resolveBilledReferenceVideoCount({ config, mode: 'video_extend', referenceVideoCount: 1 }), 1)
  assert.equal(resolveBilledReferenceVideoCount({ config, mode: 'multimodal_ref', referenceVideoCount: 8 }), 5)
  assert.equal(resolveBilledReferenceVideoCount({ config: { apiType: 'wan3', wan3Config: { maxVideos: 2 } }, mode: 'multimodal_ref', referenceVideoCount: 3 }), 2)
  // 首帧/首尾帧/文生模式不提交视频，后端不乘倍率
  assert.equal(resolveBilledReferenceVideoCount({ config, mode: 'image2video_first', referenceVideoCount: 1 }), 0)
  assert.equal(resolveBilledReferenceVideoCount({ config, mode: 'text2video', referenceVideoCount: 1 }), 0)
  // grsai-wan3 不提交参考视频
  assert.equal(resolveBilledReferenceVideoCount({ config: { apiType: 'grsai-wan3' }, mode: 'multimodal_ref', referenceVideoCount: 1 }), 0)
})

test('resolveBilledReferenceVideoCount：RouterBee 万相 / Wan 按提交规则计数，其他模型取上游视频数', () => {
  assert.equal(resolveBilledReferenceVideoCount({ config: { apiType: 'routerbee-wan3' }, mode: 'multimodal_ref', referenceVideoCount: 7 }), 5)
  assert.equal(resolveBilledReferenceVideoCount({ config: { apiType: 'routerbee-wan3' }, mode: 'image2video', referenceVideoCount: 1 }), 0)
  assert.equal(resolveBilledReferenceVideoCount({ config: { apiType: 'wan' }, mode: 'r2v', referenceVideoCount: 6 }), 5)
  assert.equal(resolveBilledReferenceVideoCount({ config: { apiType: 'wan' }, mode: 'videoedit', referenceVideoCount: 3 }), 1)
  assert.equal(resolveBilledReferenceVideoCount({ config: { apiType: 'wan' }, mode: 't2v', referenceVideoCount: 1 }), 0)
  assert.equal(resolveBilledReferenceVideoCount({ config: { apiType: 'seedance-2.0' }, mode: 'multimodal_ref', referenceVideoCount: 2 }), 2)
  assert.equal(resolveBilledReferenceVideoCount({ config: {}, referenceVideoCount: undefined }), 0)
})

test('画布 XIP5.0-PRO 场景：显示值与后端扣费一致（19s × 130 × 1.5）', () => {
  const config = { apiType: 'wan3', videoInputMultipliers: [1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10] }
  const count = resolveBilledReferenceVideoCount({ config, mode: 'multimodal_ref', referenceVideoCount: 1 })
  assert.equal(applyVideoInputMultiplier(130 * 19, resolveVideoInputMultiplier(config, count)), 3705)
})
