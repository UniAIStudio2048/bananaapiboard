import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'Canvas.vue'), 'utf8')

test('portrait tablet canvas top controls avoid overlapping workflow tabs', () => {
  assert.match(
    source,
    /@media\s*\(orientation:\s*portrait\)\s*and\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\.tabs-container\s*\{[\s\S]*?top:\s*60px;[\s\S]*?left:\s*16px;[\s\S]*?right:\s*16px;[\s\S]*?max-width:\s*calc\(100vw - 32px\);/,
    'Portrait tablet layout should move workflow tabs below the top-right controls with viewport-bounded width'
  )

  assert.match(
    source,
    /@media\s*\(orientation:\s*portrait\)\s*and\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\.canvas-top-right-controls\s*\{[\s\S]*?left:\s*16px;[\s\S]*?right:\s*16px;[\s\S]*?max-width:\s*calc\(100vw - 32px\);[\s\S]*?overflow-x:\s*auto;/,
    'Portrait tablet top-right controls should remain inside the viewport and scroll horizontally if needed'
  )

  assert.match(
    source,
    /@media\s*\(orientation:\s*portrait\)\s*and\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\.canvas-top-right-controls\s*:deep\(\.space-label\)\s*\{[\s\S]*?max-width:\s*56px;/,
    'Portrait tablet space switcher label should shrink to preserve room for icon controls'
  )
})
