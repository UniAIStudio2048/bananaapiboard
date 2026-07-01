import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

assert.match(
  source,
  /import\s*\{[^}]*SelectionMode[^}]*\}\s*from\s*['"]@vue-flow\/core['"]/,
  'CanvasBoard should import Vue Flow SelectionMode'
)

assert.match(
  source,
  /:selection-mode="SelectionMode\.Partial"/,
  'CanvasBoard drag selection should select nodes touched by the selection rectangle'
)
