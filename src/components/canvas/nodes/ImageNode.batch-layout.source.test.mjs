import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')

test('image 2x/4x uses shared grid and visible group', () => {
  assert.match(source, /getBatchGridPositions/)
  assert.match(
    source,
    /canvasStore\.createVisibleGroup\(allNodeIds, `图片生成 ×\$\{generateCount\}`/
  )
  assert.match(source, /skipHistory:\s*true/)
})

test('image batch submissions start without an index delay', () => {
  const activeBatch = source.slice(
    source.indexOf('// 提交所有任务（任务提交后立即返回'),
    source.indexOf('// 等待所有任务提交完成')
  )

  assert.match(
    activeBatch,
    /allNodeIds\.map\(\(nodeId, index\) =>\s*executeNodeGeneration/
  )
  assert.doesNotMatch(activeBatch, /delay\(|CONCURRENT_INTERVAL/)
})

test('image batch history includes processing-node duplication in one transaction', () => {
  const batchLayout = source.slice(
    source.indexOf('const generateCount = selectedCount.value'),
    source.indexOf('// 更新目标节点状态')
  )
  const baselineSave = batchLayout.indexOf('canvasStore.saveHistory({ force: true })')
  const duplicateCall = batchLayout.indexOf('canvasStore.duplicateNodeWithIncomingEdges')
  const groupCreate = batchLayout.indexOf('canvasStore.createVisibleGroup')
  const finalSave = batchLayout.indexOf('canvasStore.saveHistory({ force: true })', baselineSave + 1)

  assert.ok(baselineSave >= 0)
  assert.ok(duplicateCall > baselineSave)
  assert.ok(groupCreate > baselineSave)
  assert.ok(finalSave > groupCreate)
  assert.match(
    batchLayout,
    /duplicateNodeWithIncomingEdges\(props\.id, \{[\s\S]*?skipHistory: generateCount > 1[\s\S]*?\}\)/
  )
})

test('image batch persists and surfaces partial structured safety failures', () => {
  assert.match(source, /findBatchSafetyError\(failedResults\)/)
  assert.match(source, /safetyError:\s*\{/)
  assert.match(source, /successResults\.length > 0 && batchSafetyError/)
})
