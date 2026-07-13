import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvas.css'), 'utf8')

assert.match(source, /--canvas-scrollbar-size:\s*10px/)
assert.match(source, /--canvas-scrollbar-thumb:\s*rgba\(255,\s*255,\s*255,\s*0\.24\)/)
assert.match(source, /scrollbar-width:\s*thin/)
assert.match(source, /scrollbar-color:\s*var\(--canvas-scrollbar-thumb\)\s+var\(--canvas-scrollbar-track\)/)
assert.match(source, /body:has\(\.canvas-page\)\s+\*::-webkit-scrollbar/)
assert.match(source, /\.canvas-page\s+\*::-webkit-scrollbar/)
assert.match(source, /\.canvas-page\s+\*::-webkit-scrollbar-button[\s\S]*?display:\s*none\s*!important/)
assert.match(source, /\.canvas-page\s+\*::-webkit-scrollbar-thumb[\s\S]*?background-clip:\s*content-box\s*!important/)
assert.match(source, /\.asset-panel\s+\*::-webkit-scrollbar/)
assert.match(source, /\.asset-preview-overlay\s+\*::-webkit-scrollbar/)
assert.match(source, /:root\.canvas-theme-light[\s\S]*--canvas-scrollbar-thumb:\s*rgba\(28,\s*25,\s*23,\s*0\.24\)/)

console.log('Canvas scrollbar source tests passed')
