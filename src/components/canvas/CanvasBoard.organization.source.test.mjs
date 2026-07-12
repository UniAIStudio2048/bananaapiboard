import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

assert.match(source, /gridSnapEnabled:\s*\{[\s\S]*?type:\s*Boolean,[\s\S]*?default:\s*true/)
assert.match(source, /:snap-to-grid="gridSnapEnabled"/)
assert.match(source, /import\s*\{[\s\S]*organizeCanvasNodes[\s\S]*\}\s*from\s*['"]@\/utils\/canvasOrganization['"]/)
assert.match(source, /async\s+function\s+organizeCanvas\s*\(/)
assert.match(source, /if\s*\(canvasStore\.nodes\.length\s*===\s*0\)\s*return/)
assert.match(source, /organizeCanvasNodes\(canvasStore\.nodes/)
assert.match(source, /function\s+restoreOrganizedCanvas\s*\(/)
assert.match(source, /const\s+deltaX\s*=[\s\S]*child\.position[\s\S]*deltaX[\s\S]*deltaY/)
assert.match(source, /fitView\(\{\s*padding:\s*0\.2,\s*minZoom:\s*MIN_ZOOM,\s*maxZoom:\s*MAX_ZOOM\s*\}\)/)
assert.match(source, /function\s+clampCanvasZoom\s*\(/)
assert.match(source, /organizeCanvas,[\s\S]*restoreOrganizedCanvas,[\s\S]*fitCanvasToScreen/)

console.log('CanvasBoard organization source tests passed')
