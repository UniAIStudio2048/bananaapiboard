import { strict as assert } from 'node:assert'
import { selectLodWidth, PREVIEW_WIDTHS, ORIGINAL_THRESHOLD, MIN_CANVAS_PREVIEW_WIDTH } from './lodSelector.js'

// 1) 画布缩小，节点很小（远视图）→ 最小档位
assert.equal(
  selectLodWidth({ zoom: 0.3, nodeWidth: 380, devicePixelRatio: 1 }),
  384,
  'displayWidth=114 → 384 档位 (画布很多节点时，压缩力度大没事)'
)

// 2) 节点中等大小 → 768 档位
assert.equal(
  selectLodWidth({ zoom: 1.5, nodeWidth: 380, devicePixelRatio: 1 }),
  768,
  'displayWidth=570 → 768 档位'
)

// 3) 节点较大 → 1280 档位
assert.equal(
  selectLodWidth({ zoom: 2.5, nodeWidth: 380, devicePixelRatio: 1 }),
  1280,
  'displayWidth=950 → 1280 档位'
)

// 4) 节点很大但未到阈值 → 1920 档位
assert.equal(
  selectLodWidth({ zoom: 4, nodeWidth: 380, devicePixelRatio: 1 }),
  1920,
  'displayWidth=1520 → 1920 档位'
)

// 5) 节点接近屏幕大小（>= 1920）→ 0（用原图）—— 用户核心原则
assert.equal(
  selectLodWidth({ zoom: 5, nodeWidth: 400, devicePixelRatio: 1 }),
  0,
  'displayWidth=2000 → 用原图，杜绝模糊'
)
assert.equal(
  selectLodWidth({ zoom: 4.8, nodeWidth: 400, devicePixelRatio: 1 }),
  0,
  'displayWidth=1920 边界值 → 用原图'
)

// 6) 高分屏 DPR=2：同等 zoom 应升档以保持清晰
assert.equal(
  selectLodWidth({ zoom: 1.5, nodeWidth: 380, devicePixelRatio: 2 }),
  1280,
  'DPR=2 同等 zoom 应升档到 1280 (displayWidth=1140)'
)
assert.equal(
  selectLodWidth({ zoom: 2.6, nodeWidth: 400, devicePixelRatio: 2 }),
  0,
  'DPR=2 时较大节点也能触发原图回退 (displayWidth=2080)'
)

// 7) pan/zoom 移动期间 → 强制最小档位（即使节点很大）
assert.equal(
  selectLodWidth({ zoom: 5, nodeWidth: 400, preferLowQuality: true }),
  MIN_CANVAS_PREVIEW_WIDTH,
  'preferLowQuality 强制 384 档位用作低质量占位'
)

// 8) 边界值：恰好覆盖某档位
assert.equal(
  selectLodWidth({ zoom: 768 / 400, nodeWidth: 400, devicePixelRatio: 1 }),
  768,
  '边界值 displayWidth=768 → 768 档位'
)

// 9) 档位常量校验：确保未来不会被无意修改
assert.deepEqual(
  PREVIEW_WIDTHS,
  [384, 768, 1280, 1920],
  'LOD 档位策略：384/768/1280/1920，超出走原图'
)
assert.equal(ORIGINAL_THRESHOLD, 1920, '节点屏幕显示宽度阈值 1920')

// 10) 异常输入容错（默认 zoom=1 nodeWidth=400 → displayWidth=400 → 768 档）
assert.equal(selectLodWidth({}), 768, '空参数 zoom=1 nodeWidth=400 → 768 档位')
assert.equal(selectLodWidth({ zoom: 0 }), 768, 'zoom=0 时回退到 1，按 displayWidth=400 落 768')
assert.equal(selectLodWidth({ devicePixelRatio: 0.5 }), 768, 'DPR<1 时按 1 处理')

console.log('Canvas LOD selector tests passed')
