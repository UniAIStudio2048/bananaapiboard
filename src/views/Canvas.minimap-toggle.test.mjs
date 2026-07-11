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
assert.match(source, /class="map-icon"[\s\S]*M12 17s5-4\.35 5-9a5 5 0 0 0-10 0c0 4\.65 5 9 5 9Z/, 'Map button should use the location-pin silhouette')
assert.match(source, /<circle cx="12" cy="8" r="1\.75"\/>/, 'Map pin should include a center marker')
assert.match(source, /M8 14H6l-3 7h18l-3-7h-2/, 'Map pin should sit over a map base')

console.log('Canvas minimap toggle tests passed')
