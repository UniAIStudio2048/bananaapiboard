import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvasStore.js'), 'utf8')

test('selected node flags survive Vue Flow node-array refreshes during background generation', () => {
  const body = source.match(/function setSelectedNodeIds\(ids\) \{([\s\S]*?)\n  \}/)?.[1] || ''

  assert.match(body, /const selectedIds = new Set\(ids\)/)
  assert.match(body, /node\.selected = selectedIds\.has\(node\.id\)/)
  assert.ok(
    body.indexOf('node.selected = selectedIds.has(node.id)') < body.indexOf('selectedNodeIds.value = ids'),
    'node flags must be synchronized before publishing the selected id list'
  )
})
