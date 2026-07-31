import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./Canvas.vue', import.meta.url), 'utf8')

test('assistant writeback falls back to the currently selected canvas node', () => {
  assert.match(source, /canvasStore\.selectedNodeIds\?\.length/)
  assert.match(source, /canvasStore\.selectedNodeId/)
  assert.match(source, /const nodeId = payload\.node_id \|\| payload\.nodeId \|\| selectedNodeIds\[0\]/)
  assert.match(source, /schedulePersistAfterTask\('ai-assistant-skill-writeback'\)/)
})
