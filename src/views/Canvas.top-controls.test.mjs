import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const canvasSource = await readFile(new URL('./Canvas.vue', import.meta.url), 'utf8')

test('画布顶部组件共享统一的 40px 高度规范', () => {
  assert.match(canvasSource, /--canvas-top-control-height:\s*40px;/)
  assert.match(canvasSource, /\.mode-switch-icon\s*\{[\s\S]*?height:\s*var\(--canvas-top-control-height\);/)
  assert.match(canvasSource, /\.tabs-container\s+:deep\(\.workflow-tabs\)\s*\{[\s\S]*?height:\s*var\(--canvas-top-control-height\);/)
  assert.match(canvasSource, /\.canvas-points-display\s*\{[\s\S]*?height:\s*var\(--canvas-top-control-height\);/)
  assert.match(canvasSource, /\.canvas-icon-btn\s*\{[\s\S]*?height:\s*var\(--canvas-top-control-height\);/)
  assert.match(canvasSource, /:deep\(\.space-trigger\)[\s\S]*?:deep\(\.lang-trigger\)[\s\S]*?height:\s*var\(--canvas-top-control-height\);/)
})

test('顶部组件共享顶边基线并保持垂直居中', () => {
  assert.match(canvasSource, /\.tabs-container\s*\{[\s\S]*?top:\s*16px;/)
  assert.match(canvasSource, /\.mode-switch-wrapper\s*\{[\s\S]*?top:\s*16px;/)
  assert.match(canvasSource, /\.canvas-top-right-controls\s*\{[\s\S]*?top:\s*16px;[\s\S]*?align-items:\s*center;/)
})
