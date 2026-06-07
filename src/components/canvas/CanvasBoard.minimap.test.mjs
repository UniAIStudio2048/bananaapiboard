import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

assert.match(source, /const showCanvasMiniMap = inject\('showCanvasMiniMap', ref\(false\)\)/, 'CanvasBoard should consume the minimap toggle state')
assert.match(source, /function handleMiniMapClick\(/, 'CanvasBoard should handle minimap clicks')
assert.match(source, /setCenter\(position\.x,\s*position\.y,\s*\{ zoom: viewport\.zoom \}\)/, 'Minimap clicks should recenter the current viewport without changing zoom')
assert.match(source, /v-if="showCanvasMiniMap"/, 'CanvasBoard should only render the minimap when the toggle is open')
assert.match(source, /<MiniMap[\s\S]*class="canvas-workflow-minimap"/, 'CanvasBoard should render a styled workflow minimap')
assert.match(source, /:pannable="true"/, 'Minimap should support drag panning')
assert.match(source, /:zoomable="false"/, 'Minimap should not hijack wheel zoom')
assert.match(source, /@click="handleMiniMapClick"/, 'Minimap should support click-to-recenter')
assert.match(source, /node-color="#f5f5f5"/, 'Minimap should use black and white node colors')
assert.match(source, /node-stroke-color="#111111"/, 'Minimap should use black and white node outlines')
assert.match(source, /mask-color="rgba\(0,\s*0,\s*0,\s*0\.28\)"/, 'Minimap viewport mask should be monochrome')
assert.match(source, /:root\.canvas-theme-light[\s\S]*\.canvas-board :deep\(\.canvas-workflow-minimap\)/, 'Minimap should adapt to light canvas theme')

console.log('CanvasBoard minimap tests passed')
