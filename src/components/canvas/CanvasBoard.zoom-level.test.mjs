import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const boardSrc = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')
const cssSrc = readFileSync(join(__dirname, '..', '..', 'styles', 'canvas.css'), 'utf8')

// ============================================================
// P1-3：低 zoom 极简显示模式
// ============================================================

// CanvasBoard 必须暴露 canvasZoomLevel computed
assert.match(
  boardSrc,
  /const canvasZoomLevel = computed\(\(\) => \{/,
  'CanvasBoard must expose canvasZoomLevel computed for CSS density switching'
)

// 必须包含三档判定阈值
assert.match(
  boardSrc,
  /if \(z < 0\.4\) return 'tiny'/,
  'zoom < 0.4 应映射到 tiny 档（节点显示宽度 < 160px，用户看的是全局）'
)
assert.match(
  boardSrc,
  /if \(z < 0\.75\) return 'small'/,
  '0.4 <= zoom < 0.75 应映射到 small 档'
)

// 根容器必须绑定 data-zoom-level
assert.match(
  boardSrc,
  /:data-zoom-level="canvasZoomLevel"/,
  'canvas-board 根容器必须绑定 :data-zoom-level，CSS 选择器靠它生效'
)

// CSS 必须有 tiny 档对应规则，且必须豁免选中节点
assert.match(
  cssSrc,
  /\.canvas-board\[data-zoom-level="tiny"\] \.vue-flow__node:not\(\.selected\)/,
  'tiny 档 CSS 规则必须 :not(.selected) 豁免选中节点，保护用户正在操作的节点'
)

// ============================================================
// P1-4：视口外节点 content-visibility 虚拟化
// ============================================================

assert.match(
  cssSrc,
  /\.vue-flow__node\[data-node-visible="false"\]:not\(\.selected\)/,
  'content-visibility 规则必须基于 data-node-visible 且 :not(.selected) 豁免选中节点'
)
assert.match(
  cssSrc,
  /content-visibility: auto/,
  '视口外节点应使用 content-visibility: auto 让浏览器跳过 paint'
)
assert.match(
  cssSrc,
  /contain-intrinsic-size:/,
  '必须给浏览器尺寸暗示 (contain-intrinsic-size) 避免滚动条抖动'
)

// 保留 P0-4 的 contain 隔离（不应该被无意删除）
assert.match(
  cssSrc,
  /\.vue-flow__node \{[\s\S]*?contain: layout style;/,
  'P0-4 的 contain: layout style 必须保留，不能因后续改动被破坏'
)

// ============================================================
// 闪烁优化：stableZoom 去抖
// ============================================================

// CanvasBoard 必须暴露 stableZoom ref 并 provide 给子节点
assert.match(
  boardSrc,
  /const stableZoom = ref\(canvasStore\.viewport\?\.zoom \|\| 1\)/,
  'CanvasBoard must expose stableZoom ref initialized from current viewport zoom'
)
assert.match(
  boardSrc,
  /provide\('canvasStableZoom', stableZoom\)/,
  'stableZoom must be provided to descendants for de-bounced LOD calculation'
)

// 220ms 去抖：避免连续滚轮缩放时 LOD URL 在多档之间反复切换
assert.match(
  boardSrc,
  /stableZoomTimer = setTimeout\([\s\S]*?stableZoom\.value = z[\s\S]*?\}, 220\)/,
  'stableZoom must use 220ms debounce to coalesce rapid zoom changes'
)

console.log('CanvasBoard zoom-level / virtualization tests passed')
