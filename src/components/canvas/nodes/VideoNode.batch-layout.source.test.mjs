import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

test('video 2x/4x uses shared grid and visible group', () => {
  assert.match(source, /getBatchGridPositions/)
  assert.match(
    source,
    /canvasStore\.createVisibleGroup\(allNodeIds, `视频生成 ×\$\{generateCount\}`/
  )
  assert.match(source, /skipHistory:\s*true/)
})

test('video batch submits immediately after shared media preparation', () => {
  const activeBatch = source.slice(
    source.indexOf('// 提交所有任务'),
    source.indexOf("window.dispatchEvent(new CustomEvent('user-info-updated')")
  )

  assert.match(
    activeBatch,
    /allNodeIds\.map\(\(nodeId, index\) =>\s*executeNodeGeneration/
  )
  assert.doesNotMatch(activeBatch, /delay\(|CONCURRENT_INTERVAL/)
})

test('video batch history records both the pre-layout baseline and post-layout state', () => {
  const batchLayout = source.slice(
    source.indexOf('// 多批次生成时，创建网格输出节点并建立可视编组'),
    source.indexOf('// 立即设置节点为 processing 状态')
  )
  const baselineSave = batchLayout.indexOf('canvasStore.saveHistory({ force: true })')
  const groupCreate = batchLayout.indexOf('canvasStore.createVisibleGroup')
  const finalSave = batchLayout.indexOf('canvasStore.saveHistory({ force: true })', baselineSave + 1)

  assert.ok(baselineSave >= 0)
  assert.ok(groupCreate > baselineSave)
  assert.ok(finalSave > groupCreate)
})

test('video preprocessing failure terminates every unsubmitted batch node', () => {
  const processStart = source.indexOf('async function processGenerationInBackground')
  const processEnd = source.indexOf('// 轮询视频任务状态', processStart)
  const backgroundProcess = source.slice(processStart, processEnd)

  assert.match(backgroundProcess, /let submissionsStarted = false/)
  assert.match(backgroundProcess, /submissionsStarted = true/)
  assert.match(backgroundProcess, /if \(!submissionsStarted\)/)
  assert.match(backgroundProcess, /allNodeIds\.forEach\(nodeId =>/)
})

test('video batch surfaces partial structured safety failures', () => {
  assert.match(source, /findBatchSafetyError\(allNodeIds\.map/)
  assert.match(source, /successResults\.length > 0 && batchSafetyError/)
})
