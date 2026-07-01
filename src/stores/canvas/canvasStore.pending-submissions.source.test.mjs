import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvasStore.js'), 'utf8')

test('canvas node deletion marks pending generation submissions as user-deleted', () => {
  assert.match(source, /markNodeGenerationSubmissionsDeleted/)

  const removeNodeSource = source.match(/function removeNode\(nodeId\) \{[\s\S]*?\n  \}/)?.[0] || ''
  assert.match(
    removeNodeSource,
    /markNodeGenerationSubmissionsDeleted\(nodeId/,
    'single node deletion should mark pending submissions deleted before recovery can revive them'
  )

  const removeBatchSource = source.match(/function removeNodesBatch\(nodeIds\) \{[\s\S]*?\n  \}/)?.[0] || ''
  assert.match(
    removeBatchSource,
    /for \(const nodeId of nodeIdSet\)[\s\S]*markNodeGenerationSubmissionsDeleted\(nodeId/,
    'batch deletion should mark each pending submission deleted'
  )
})
