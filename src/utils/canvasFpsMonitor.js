/**
 * canvasFpsMonitor
 *
 * 基于 requestAnimationFrame 的画布帧率监控器，配合 canvasStore.performanceMode
 * 实现自适应降级：
 *
 *   - 每帧累计 dt，1 秒为窗口算 FPS
 *   - FPS < 30 持续 N 个窗口（默认 3）→ 降一档
 *   - FPS > 55 持续 M 个窗口（默认 5）→ 自动恢复一档（不超过 store 计算出的"基线档"）
 *
 * 模块无 Vue 依赖，构造函数接受可选 onDegrade/onRecover 回调与 nowFn/rafFn/cancelFn，
 * 方便在 Node 环境单测时注入虚拟时钟。
 */

const TIER_ORDER = ['full', 'optimized', 'reduced', 'minimal']

function clampTier(tier) {
  return TIER_ORDER.includes(tier) ? tier : 'full'
}

function nextLowerTier(tier) {
  const idx = TIER_ORDER.indexOf(clampTier(tier))
  if (idx < 0) return 'minimal'
  return TIER_ORDER[Math.min(TIER_ORDER.length - 1, idx + 1)]
}

function nextHigherTier(tier) {
  const idx = TIER_ORDER.indexOf(clampTier(tier))
  if (idx <= 0) return TIER_ORDER[0]
  return TIER_ORDER[idx - 1]
}

function compareTier(a, b) {
  return TIER_ORDER.indexOf(clampTier(a)) - TIER_ORDER.indexOf(clampTier(b))
}

export function createCanvasFpsMonitor({
  windowMs = 1000,
  degradeThreshold = 30,
  recoverThreshold = 55,
  degradeWindows = 3,
  recoverWindows = 5,
  getBaselineTier = () => 'full',
  getCurrentTier = () => 'full',
  applyTier = () => {},
  onSample = null,
  nowFn = (typeof performance !== 'undefined' ? () => performance.now() : () => Date.now()),
  rafFn = (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : null),
  cancelFn = (typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : null)
} = {}) {
  let running = false
  let rafId = null
  let lastFrameTs = 0
  let windowStartTs = 0
  let frameCountInWindow = 0
  let lowFpsStreak = 0
  let highFpsStreak = 0
  let lastFps = 0
  let lastSampleAt = 0

  function reset() {
    lastFrameTs = 0
    windowStartTs = 0
    frameCountInWindow = 0
    lowFpsStreak = 0
    highFpsStreak = 0
    lastFps = 0
    lastSampleAt = 0
  }

  function processFrame(ts) {
    if (!running) return
    if (!lastFrameTs) {
      lastFrameTs = ts
      windowStartTs = ts
      frameCountInWindow = 0
    } else {
      frameCountInWindow++
      lastFrameTs = ts

      if (ts - windowStartTs >= windowMs) {
        const elapsed = ts - windowStartTs
        const fps = elapsed > 0 ? (frameCountInWindow * 1000) / elapsed : 0
        lastFps = fps
        lastSampleAt = ts

        if (fps < degradeThreshold) {
          lowFpsStreak++
          highFpsStreak = 0
        } else if (fps >= recoverThreshold) {
          highFpsStreak++
          lowFpsStreak = 0
        } else {
          lowFpsStreak = 0
          highFpsStreak = 0
        }

        const currentTier = clampTier(getCurrentTier())
        const baselineTier = clampTier(getBaselineTier())

        if (lowFpsStreak >= degradeWindows && currentTier !== 'minimal') {
          const target = nextLowerTier(currentTier)
          lowFpsStreak = 0
          applyTier(target, { reason: 'fps-degrade', fps, from: currentTier })
        } else if (
          highFpsStreak >= recoverWindows &&
          compareTier(currentTier, baselineTier) > 0
        ) {
          const target = nextHigherTier(currentTier)
          highFpsStreak = 0
          applyTier(target, { reason: 'fps-recover', fps, from: currentTier })
        }

        if (onSample) {
          try { onSample({ fps, currentTier, baselineTier, lowFpsStreak, highFpsStreak }) } catch (_) { /* noop */ }
        }

        windowStartTs = ts
        frameCountInWindow = 0
      }
    }

    if (rafFn) {
      rafId = rafFn(processFrame)
    }
  }

  function start() {
    if (running) return
    if (!rafFn) return
    running = true
    reset()
    rafId = rafFn(processFrame)
  }

  function stop() {
    running = false
    if (rafId != null && cancelFn) {
      try { cancelFn(rafId) } catch (_) { /* noop */ }
    }
    rafId = null
  }

  function tick(ts) {
    if (!running) running = true
    processFrame(ts)
  }

  function getStats() {
    return {
      running,
      lastFps,
      lastSampleAt,
      lowFpsStreak,
      highFpsStreak
    }
  }

  return { start, stop, tick, reset, getStats }
}

export const __test__ = { TIER_ORDER, nextLowerTier, nextHigherTier, clampTier }
