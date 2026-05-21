/**
 * 画布节点缩略图 LOD 档位选择器（纯函数，无任何依赖）
 *
 * 策略：
 *   - blob/data URI 由调用方处理
 *   - preferLowQuality（pan/zoom 移动中）→ 最小档位 384，保证滑动流畅
 *   - displayWidth = nodeWidth × zoom × devicePixelRatio
 *   - displayWidth >= ORIGINAL_THRESHOLD（1920）→ 返回 0，表示用原图（避免模糊）
 *   - 其余按 PREVIEW_WIDTHS 选最小覆盖档位
 *
 * 返回值含义：
 *   - 正整数：缩略图目标宽度（像素）
 *   - 0：直接使用原图
 */

export const MIN_CANVAS_PREVIEW_WIDTH = 384
export const PREVIEW_WIDTHS = Object.freeze([384, 768, 1280, 1920])
export const ORIGINAL_THRESHOLD = 1920

export function selectLodWidth({ zoom = 1, nodeWidth = 400, devicePixelRatio = 1, preferLowQuality = false } = {}) {
  if (preferLowQuality) return MIN_CANVAS_PREVIEW_WIDTH
  const dpr = Math.max(1, devicePixelRatio || 1)
  const displayWidth = Math.max(1, (nodeWidth || 400) * (zoom || 1) * dpr)
  if (displayWidth >= ORIGINAL_THRESHOLD) return 0
  return PREVIEW_WIDTHS.find(w => w >= displayWidth) || PREVIEW_WIDTHS[PREVIEW_WIDTHS.length - 1]
}
