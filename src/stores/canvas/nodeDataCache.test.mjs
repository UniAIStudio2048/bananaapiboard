/**
 * NodeDataCache 单元测试
 *
 * 覆盖：
 *   - set / get 基本读写 + LRU touch
 *   - 按条目数驱逐（maxEntries）
 *   - 按字节数驱逐（maxBytes）
 *   - pin / unpin 防止驱逐
 *   - touchMany 刷新顺序
 *   - onEvict 回调
 *
 * 运行：node bananaapiboard/src/stores/canvas/nodeDataCache.test.mjs
 */
import { strict as assert } from 'node:assert'
import { NodeDataCache } from './nodeDataCache.js'

function makeNode(id, dataSizeChars = 100) {
  return { id, type: 'image', data: { id, payload: 'x'.repeat(dataSizeChars) }, version: 1 }
}

// 1) 基本 set/get/has
{
  const c = new NodeDataCache()
  c.set('a', makeNode('a'))
  assert.equal(c.has('a'), true)
  assert.equal(c.get('a').id, 'a')
  assert.equal(c.size, 1)
}

// 2) 按 maxEntries 驱逐：写入 5 个，maxEntries=3 -> 留下最新 3 个
{
  const c = new NodeDataCache({ maxEntries: 3, maxBytes: 1e9 })
  for (let i = 0; i < 5; i++) c.set(`n${i}`, makeNode(`n${i}`))
  assert.equal(c.size, 3)
  assert.equal(c.has('n0'), false)
  assert.equal(c.has('n1'), false)
  assert.equal(c.has('n4'), true)
}

// 3) LRU 顺序：get 后再写新节点，被驱逐的应该是最旧的"非 get"节点
{
  const c = new NodeDataCache({ maxEntries: 3, maxBytes: 1e9 })
  c.set('a', makeNode('a'))
  c.set('b', makeNode('b'))
  c.set('c', makeNode('c'))
  // touch a -> a 变最新
  c.get('a')
  c.set('d', makeNode('d'))
  // 现在应该驱逐 b（最旧未被 touch）
  assert.equal(c.has('a'), true)
  assert.equal(c.has('b'), false)
  assert.equal(c.has('c'), true)
  assert.equal(c.has('d'), true)
}

// 4) peek 不影响 LRU 顺序
{
  const c = new NodeDataCache({ maxEntries: 2, maxBytes: 1e9 })
  c.set('a', makeNode('a'))
  c.set('b', makeNode('b'))
  c.peek('a') // peek 不刷新
  c.set('c', makeNode('c'))
  // a 仍是最旧 -> 应被驱逐
  assert.equal(c.has('a'), false)
  assert.equal(c.has('b'), true)
  assert.equal(c.has('c'), true)
}

// 5) 按字节驱逐：单个节点数据 ~1KB，maxBytes=2.5KB
{
  const big = 1024
  const c = new NodeDataCache({ maxEntries: 1000, maxBytes: 2500 })
  c.set('a', makeNode('a', big))
  c.set('b', makeNode('b', big))
  c.set('c', makeNode('c', big))
  c.set('d', makeNode('d', big))
  // 总字节超出 2500 -> 应保留最新的子集
  assert.ok(c.size <= 3, '按字节驱逐后条目数受限')
  assert.ok(c.getBytesUsed() <= 2500, '字节占用不超过上限')
  assert.equal(c.has('d'), true, '最新写入应保留')
}

// 6) pin 保护节点不被驱逐
{
  const c = new NodeDataCache({ maxEntries: 2, maxBytes: 1e9 })
  c.set('a', makeNode('a'))
  c.pin('a')
  c.set('b', makeNode('b'))
  c.set('c', makeNode('c'))
  c.set('d', makeNode('d'))
  assert.equal(c.has('a'), true, 'pinned 节点应保留')
  // a 被 pin 占一位；剩下一位反复被新写入挤掉，最终留下 [a, d]
  assert.equal(c.size, 2, 'maxEntries=2 时即使有 pin，总条目数仍不超过 2')
  assert.equal(c.has('d'), true, '最新写入应保留')
}

// 7) unpin 后可被驱逐
{
  const c = new NodeDataCache({ maxEntries: 2, maxBytes: 1e9 })
  c.set('a', makeNode('a'))
  c.pin('a')
  c.set('b', makeNode('b'))
  c.set('c', makeNode('c'))
  c.unpin('a')
  c.set('d', makeNode('d'))
  // 现在 a 可被驱逐 -> 留下 c, d
  assert.equal(c.has('a'), false)
  assert.equal(c.size, 2)
}

// 8) touchMany 刷新顺序
{
  const c = new NodeDataCache({ maxEntries: 3, maxBytes: 1e9 })
  c.set('a', makeNode('a'))
  c.set('b', makeNode('b'))
  c.set('c', makeNode('c'))
  c.touchMany(['a', 'b']) // a,b 变最新；c 反成最旧
  c.set('d', makeNode('d'))
  assert.equal(c.has('c'), false, 'touchMany 之后 c 应当被驱逐')
  assert.equal(c.has('a'), true)
  assert.equal(c.has('b'), true)
  assert.equal(c.has('d'), true)
}

// 9) onEvict 回调被触发
{
  const evicted = []
  const c = new NodeDataCache({
    maxEntries: 2,
    maxBytes: 1e9,
    onEvict(node) { evicted.push(node.id) }
  })
  c.set('a', makeNode('a'))
  c.set('b', makeNode('b'))
  c.set('c', makeNode('c'))
  assert.deepEqual(evicted, ['a'])
}

// 10) delete 释放字节占用
{
  const c = new NodeDataCache()
  c.set('a', makeNode('a', 500))
  const beforeBytes = c.getBytesUsed()
  c.delete('a')
  assert.equal(c.getBytesUsed(), 0)
  assert.equal(c.has('a'), false)
  assert.ok(beforeBytes > 0)
}

// 11) set 同一 id 不会累积字节占用
{
  const c = new NodeDataCache()
  c.set('a', makeNode('a', 100))
  const after1 = c.getBytesUsed()
  c.set('a', makeNode('a', 100)) // 同 id 覆盖
  const after2 = c.getBytesUsed()
  assert.equal(after1, after2, '同 id 覆盖应替换而不是累加')
  assert.equal(c.size, 1)
}

console.log('nodeDataCache unit tests passed')
