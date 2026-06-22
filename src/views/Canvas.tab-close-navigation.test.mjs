import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./Canvas.vue', import.meta.url), 'utf8')

const handleTabClose = source.match(/(?:async\s+)?function handleTabClose\(tabId\) \{([\s\S]*?)\n\}/)

assert.ok(handleTabClose, 'Canvas should define handleTabClose for workflow tab close events')
assert.match(
  handleTabClose[1],
  /canvasStore\.closeTab\(tabId\)/,
  'closing a workflow tab should still delegate tab removal to the canvas store'
)
assert.doesNotMatch(
  handleTabClose[1],
  /router\.(push|replace)\(/,
  'closing the last workflow tab should stay on the canvas empty state instead of navigating away'
)

console.log('Canvas tab close navigation tests passed')
