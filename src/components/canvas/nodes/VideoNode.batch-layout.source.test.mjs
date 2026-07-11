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
