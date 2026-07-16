import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

assert.match(source, /const showCanvasMiniMap = inject\('showCanvasMiniMap', ref\(false\)\)/, 'CanvasBoard should consume the minimap toggle state')
assert.match(source, /function handleMiniMapClick\(/, 'CanvasBoard should handle minimap clicks')
assert.match(source, /setCenter\(position\.x,\s*position\.y,\s*\{ zoom: viewport\.zoom \}\)/, 'Minimap clicks should recenter the current viewport without changing zoom')
assert.match(source, /v-if="showCanvasMiniMap && !renderProjection\.enabled"/, 'CanvasBoard should render Vue Flow MiniMap only for normal-size workflows')
assert.match(source, /v-else-if="showCanvasMiniMap && renderProjection\.enabled"/, 'CanvasBoard should render the lightweight overview for high-count workflows')
assert.match(source, /<MiniMap[\s\S]*class="canvas-workflow-minimap"/, 'CanvasBoard should render a styled workflow minimap')
assert.match(source, /<CanvasMiniMapOverview[\s\S]*:items="renderProjection\.minimapItems"/, 'Large workflow overview should receive all minimap items')
assert.match(source, /:pannable="true"/, 'Minimap should support drag panning')
assert.match(source, /:zoomable="false"/, 'Minimap should not hijack wheel zoom')
assert.match(source, /@click="handleMiniMapClick"/, 'Minimap should support click-to-recenter')
assert.match(source, /:node-class-name="getMiniMapNodeClass"/, 'Minimap nodes should expose group-aware classes')
assert.match(source, /function getMiniMapNodeClass\(node\)/, 'Minimap should classify group containers and their children')
assert.match(source, /node\?\.type === 'group'/, 'Minimap should identify group containers')
assert.match(source, /node\?\.data\?\.groupId/, 'Minimap should identify nodes inside a group')
assert.match(source, /\.vue-flow__minimap-node\.is-group\)[^{]*\{[\s\S]*?fill:\s*transparent/, 'Group containers must not cover their child nodes')
assert.match(source, /\.vue-flow__minimap-node\.is-grouped\)[^{]*\{[\s\S]*?fill:\s*#[0-9a-fA-F]{6}/, 'Grouped nodes should use a distinct midtone fill')
assert.match(source, /mask-color="rgba\(9,\s*9,\s*9,\s*0\.52\)"/, 'Minimap should shade the area outside the current viewport')
assert.match(source, /mask-stroke-color="rgba\(190,\s*190,\s*190,\s*0\.68\)"/, 'Minimap should outline the current viewport with a visible guide')
assert.match(source, /:mask-stroke-width="2"/, 'Minimap viewport guide should remain visible at compact size')
assert.match(source, /border-radius:\s*14px/, 'Minimap panel should use the rounded reference shape')
assert.match(source, /:root\.canvas-theme-light[\s\S]*\.canvas-board :deep\(\.canvas-workflow-minimap\)/, 'Minimap should adapt to light canvas theme')

console.log('CanvasBoard minimap tests passed')
