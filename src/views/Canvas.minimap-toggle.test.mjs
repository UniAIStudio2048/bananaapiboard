import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'Canvas.vue'), 'utf8')

assert.match(source, /const showCanvasMiniMap = ref\(false\)/, 'Canvas should own the minimap open state')
assert.match(source, /provide\('showCanvasMiniMap', showCanvasMiniMap\)/, 'Canvas should provide minimap state to CanvasBoard')
assert.match(source, /function toggleCanvasMiniMap\(\)/, 'Canvas should expose a minimap toggle handler')
assert.match(source, /showCanvasMiniMap\.value = !showCanvasMiniMap\.value/, 'Minimap toggle should open and collapse the map')
assert.match(source, /class="canvas-map-toggle-btn"/, 'Bottom-left controls should include a dedicated map button')
assert.match(source, /:class="\{ active: showCanvasMiniMap \}"/, 'Map button should expose active state for styling')
assert.match(source, /@click="toggleCanvasMiniMap"/, 'Map button should toggle the minimap')
assert.match(source, /title="地图"/, 'Map button should have a concise tooltip')

console.log('Canvas minimap toggle tests passed')
