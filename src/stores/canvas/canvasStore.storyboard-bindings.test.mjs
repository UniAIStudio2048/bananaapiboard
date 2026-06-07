import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvasStore.js'), 'utf8')

assert.match(
  source,
  /function syncOutgoingStoryboardBindings\(\s*sourceId\s*\)/,
  'canvasStore should resync storyboard cell bindings when an upstream image node changes'
)

assert.match(
  source,
  /function getNodeImageUrlForPropagation\(sourceNode\)[\s\S]*sourceNode\.data\?\.nodeRole === 'source'[\s\S]*sourceNode\.data\.sourceImages\?\.\[0\]/,
  'storyboard propagation should prefer sourceImages for source-role image nodes'
)

assert.match(
  source,
  /function updateNodeData\(nodeId, data, options = \{\}\)[\s\S]*syncOutgoingStoryboardBindings\(nodeId\)/,
  'updateNodeData should propagate changed source image data to already-connected storyboard cells'
)

assert.match(
  source,
  /const removedCellIndex = getStoryboardCellIndexFromHandle\(edge\.targetHandle\)/,
  'removeEdge should derive the removed storyboard cell from the deleted edge handle'
)

assert.doesNotMatch(
  source,
  /aliveHandles[\s\S]*for \(let i = 0; i < nextImages\.length; i\+\+\)/,
  'removeEdge should not clear every storyboard image that lacks a surviving per-cell edge'
)

console.log('canvasStore storyboard binding tests passed')
