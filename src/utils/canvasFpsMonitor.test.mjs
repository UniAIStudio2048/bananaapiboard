/**
 * canvasFpsMonitor 单元测试
 * node bananaapiboard/src/utils/canvasFpsMonitor.test.mjs
 */
import { strict as assert } from 'node:assert'
import { createCanvasFpsMonitor, __test__ } from './canvasFpsMonitor.js'

// --- helper: 虚拟 raf，按"每帧 dtMs"步进 ---
function driveFrames(monitor, dtMs, totalMs, options = {}) {
  let now = options.start || 0
  monitor.tick(now)
  const target = now + totalMs
  while (now <= target) {
    now += dtMs
    monitor.tick(now)
  }
  return now
}

// --- 阶梯顺序基本工具 ---
assert.deepEqual(__test__.TIER_ORDER, ['full', 'optimized', 'reduced', 'minimal'])
assert.equal(__test__.nextLowerTier('full'), 'optimized')
assert.equal(__test__.nextLowerTier('optimized'), 'reduced')
assert.equal(__test__.nextLowerTier('reduced'), 'minimal')
assert.equal(__test__.nextLowerTier('minimal'), 'minimal')
assert.equal(__test__.nextHigherTier('minimal'), 'reduced')
assert.equal(__test__.nextHigherTier('full'), 'full')

// --- FPS < 30 持续 3 窗口 → 降一档 ---
{
  let currentTier = 'full'
  const applied = []
  const monitor = createCanvasFpsMonitor({
    windowMs: 1000,
    degradeThreshold: 30,
    recoverThreshold: 55,
    degradeWindows: 3,
    recoverWindows: 5,
    getBaselineTier: () => 'full',
    getCurrentTier: () => currentTier,
    applyTier: (tier, info) => {
      currentTier = tier
      applied.push({ tier, info })
    },
    rafFn: null // 我们用 tick 手动驱动
  })

  // 20 fps → 每帧 50ms，每窗口 ~20 帧
  driveFrames(monitor, 50, 3000)
  assert.equal(applied.length, 1, '低 fps 持续 3 窗口必须降级一次')
  assert.equal(applied[0].tier, 'optimized')
}

// --- 高 FPS 持续 5 窗口 → 升回 baseline ---
{
  let currentTier = 'reduced'
  const applied = []
  const monitor = createCanvasFpsMonitor({
    windowMs: 1000,
    recoverThreshold: 55,
    recoverWindows: 3,
    getBaselineTier: () => 'optimized', // baseline 是 optimized，不允许升到 full
    getCurrentTier: () => currentTier,
    applyTier: (tier, info) => {
      currentTier = tier
      applied.push({ tier, info })
    },
    rafFn: null
  })

  // 60 fps → 每帧 ~16.7ms
  driveFrames(monitor, 16.7, 4000)
  // 至少升到 optimized，但不应该越过 baseline 到 full
  const finalTier = applied[applied.length - 1]?.tier ?? currentTier
  assert.equal(finalTier, 'optimized', '恢复目标应停在 baseline=optimized')
  // 不允许在 baseline 之后继续升档
  for (const entry of applied) {
    assert.notEqual(entry.tier, 'full', '不允许跨越 baseline 升档到 full')
  }
}

// --- 中等 FPS (30 ≤ fps < 55) 不触发任何动作 ---
{
  let currentTier = 'optimized'
  const applied = []
  const monitor = createCanvasFpsMonitor({
    getCurrentTier: () => currentTier,
    getBaselineTier: () => 'optimized',
    applyTier: tier => { currentTier = tier; applied.push(tier) },
    rafFn: null
  })

  // 45 fps → 每帧 ~22ms
  driveFrames(monitor, 22, 6000)
  assert.equal(applied.length, 0, '45fps 区间不应触发降级或升级')
}

// --- 已经 minimal 不再继续降级 ---
{
  let currentTier = 'minimal'
  const applied = []
  const monitor = createCanvasFpsMonitor({
    getCurrentTier: () => currentTier,
    getBaselineTier: () => 'minimal',
    applyTier: tier => { currentTier = tier; applied.push(tier) },
    rafFn: null,
    degradeWindows: 2
  })
  driveFrames(monitor, 100, 5000) // 10fps
  assert.equal(applied.length, 0, 'minimal 档不再降级')
}

console.log('canvasFpsMonitor unit tests passed')
