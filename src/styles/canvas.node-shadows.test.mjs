import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./canvas.css', import.meta.url), 'utf8')

test('canvas node surfaces do not render drop shadows', () => {
  assert.match(
    source,
    /\.canvas-page\s+\.vue-flow__node\s*>\s*:is\([\s\S]*?\.canvas-node-shell[\s\S]*?\)\s*,[\s\S]*?box-shadow:\s*none\s*!important;/,
    'Canvas node roots should have no shadow'
  )
  assert.match(
    source,
    /\.canvas-page\s+\.vue-flow__node\s*>\s*:is\([\s\S]*?\.node-card[\s\S]*?\)\s*\{[\s\S]*?box-shadow:\s*none\s*!important;/,
    'Canvas node cards and previews should have no shadow'
  )
})
