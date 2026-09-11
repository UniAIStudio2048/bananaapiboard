import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('video clip export uses a bounded edge id independent of node ids', () => {
  assert.match(source, /const edge = \{ id: `edge_\$\{globalThis\.crypto\.randomUUID\(\)\}`/)
  assert.doesNotMatch(source, /const edge = \{ id: `edge_\$\{props\.id\}_\$\{nodeId\}`/)
})
