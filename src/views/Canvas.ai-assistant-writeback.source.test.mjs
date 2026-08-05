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

test('assistant writeback auto-creates a canvas node when no node is selected', () => {
  assert.match(source, /if \(!targetNodeId\) \{[\s\S]*?canvasStore\.addNode\(\{[\s\S]*?type: mediaType,[\s\S]*?position: getVisibleCanvasFlowPosition\(\)/)
  assert.match(source, /displayToast\(`已加载到画布`, 'success'\)/)
  assert.match(source, /function getVisibleCanvasFlowPosition\(\) \{[\s\S]*?document\.querySelector\('\.canvas-board'\)/)
})

test('assistant video writeback does not replace a selected image node', () => {
  assert.match(source, /const selectedNode = canvasStore\.nodes\.find\(node => node\.id === nodeId\)/)
  assert.match(source, /const targetNodeId = selectedNode\?\.type === mediaType \? nodeId : null/)
  assert.match(source, /if \(!targetNodeId\) \{[\s\S]*?canvasStore\.addNode\(\{[\s\S]*?type: mediaType/)
})
