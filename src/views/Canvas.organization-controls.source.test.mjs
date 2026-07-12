import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'Canvas.vue'), 'utf8')
const canvasStyles = readFileSync(join(__dirname, '..', 'styles', 'canvas.css'), 'utf8')

assert.match(source, /from\s+['"]@\/utils\/canvasControlPreferences['"]/)
assert.match(source, /buildOrganizationSignature/)
assert.match(source, /:grid-snap-enabled="gridSnapEnabled"/)

const controlHooks = [
  'canvas-asset-toggle-btn',
  'canvas-organize-btn',
  'canvas-map-toggle-btn',
  'canvas-mode-switch-btn',
  'canvas-edge-toggle-btn',
  'canvas-grid-snap-btn',
  'canvas-zoom-trigger'
]
let previousIndex = -1
for (const hook of controlHooks) {
  const index = source.indexOf(hook)
  assert.ok(index > previousIndex, `${hook} should exist in the requested control order`)
  previousIndex = index
}

assert.match(source, /canvas-asset-toggle-btn[\s\S]*?@click="openAssetPanel"/)
assert.match(source, /canvas-asset-toggle-btn[\s\S]*?<span class="canvas-control-label">资产管理<\/span>/)
assert.match(source, /canvas-organize-btn[\s\S]*?@click="requestCanvasOrganization"/)
assert.match(source, /canvas-edge-toggle-btn[\s\S]*?@click="toggleEdgesHidden"/)
assert.match(source, /canvas-grid-snap-btn[\s\S]*?@click="toggleGridSnap"/)
assert.match(source, /gridSnapEnabled[\s\S]*resolveCanvasGridSnap/)
assert.match(source, /updateUserPreferences[\s\S]*gridSnap/)
assert.match(source, /lastVisibleEdgeStyle[\s\S]*canvas-edge-style-change/)

assert.match(source, /class="canvas-zoom-trigger"/)
assert.match(source, /v-if="showZoomMenu"[\s\S]*class="canvas-zoom-menu"/)
assert.match(source, /缩放至50%[\s\S]*缩放至100%[\s\S]*缩放至500%/)
assert.doesNotMatch(source, /class="canvas-zoom-slider"/)
assert.match(source, /function\s+commitZoomInput\s*\(/)
assert.match(source, /function\s+fitCanvasToScreen\s*\(/)
assert.match(source, /const MAX_ZOOM = 5\.0/)
assert.match(source, /Math\.min\(Math\.max\(Number\(newZoom\),\s*MIN_ZOOM\),\s*MAX_ZOOM\)/)
assert.match(source, /handleDocumentPointerDown/)

assert.match(source, /event\.shiftKey\s*&&\s*event\.altKey\s*&&\s*event\.key\.toLowerCase\(\)\s*===\s*'f'/)
assert.match(source, /isEditableShortcutTarget\(event\.target\)/)
assert.match(source, /async\s+function\s+requestCanvasOrganization\s*\(/)
assert.match(source, /function\s+keepOrganizedCanvas\s*\(/)
assert.match(source, /function\s+restoreOrganizedCanvas\s*\(/)
assert.match(source, /画布已整理[\s\S]*保留[\s\S]*恢复原样/)
assert.match(source, /buildOrganizationSignature\(canvasStore\.nodes,\s*canvasStore\.edges\)/)
assert.match(source, /canvasStore\.saveHistory\(\{\s*force:\s*true\s*\}\)/)
assert.match(source, /cancelHistory:\s*\(\)\s*=>\s*canvasStore\.cancelLatestHistory\(\)/)
assert.match(source, /organizationPreviewController\.cancel\(\)/)
assert.match(source, /function\s+handleOrganizationMutationStart[\s\S]*beginContinuousMutation/)
assert.match(source, /function\s+handleOrganizationMutationEnd[\s\S]*finishContinuousMutation/)
assert.match(source, /@organization-mutation-start="handleOrganizationMutationStart"/)
assert.match(source, /@organization-mutation-end="handleOrganizationMutationEnd"/)

assert.match(canvasStyles, /:root\.canvas-theme-light\s+\.canvas-zoom-menu/)
assert.match(canvasStyles, /@media\s*\(max-width:[\s\S]*canvas-bottom-left-controls/)
assert.match(canvasStyles, /--canvas-bottom-left-scale:\s*0\.75/, 'Bottom-left controls should render at three quarters scale')
assert.match(canvasStyles, /transform:\s*scale\(var\(--canvas-bottom-left-scale\)\)/, 'Bottom-left controls should scale as a single UI group')

console.log('Canvas organization controls source tests passed')
