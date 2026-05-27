/**
 * useCanvasVirtualization 单元测试
 * 运行：node bananaapiboard/src/composables/useCanvasVirtualization.test.mjs
 */
import { strict as assert } from 'node:assert'
import { ref, effectScope } from 'vue'
import { createCanvasVirtualization } from './useCanvasVirtualization.js'

function makeNode(id, x, y, type = 'image') {
  return { id, type, position: { x, y }, width: 200, height: 200 }
}

function withScope(fn) {
  const scope = effectScope()
  let result
  scope.run(() => { result = fn() })
  return { result, scope }
}

// --- 场景 1：节点数低于阈值，禁用虚拟化 ---
{
  const nodes = ref([makeNode('a', 0, 0), makeNode('b', 100, 100)])
  const viewport = ref({ x: 0, y: 0, zoom: 1 })
  const containerRef = ref({ getBoundingClientRect: () => ({ width: 800, height: 600 }) })
  const { result: v, scope } = withScope(() => createCanvasVirtualization({
    nodes, viewport, containerRef, threshold: 10
  }))
  v.recalculate()
  assert.equal(v.isEnabled.value, false, '节点数低于阈值时应禁用')
  assert.equal(v.shellIds.value.size, 0, '禁用时 shell 集合应为空')
  scope.stop()
}

// --- 场景 2：节点数超过阈值，视口外的节点进入 shell ---
{
  const nodes = ref([])
  // 视口在 (0,0)-(800,600)；buffer 1.2 时计算范围 (-160,-120) ~ (960,720)
  // 放 12 个视口内节点（3 列 × 4 行，每个 100×100）
  for (let i = 0; i < 12; i++) {
    nodes.value.push(makeNode(`in-${i}`, (i % 3) * 150, Math.floor(i / 3) * 120))
  }
  // 放 50 个远离视口的节点
  for (let i = 0; i < 50; i++) {
    nodes.value.push(makeNode(`out-${i}`, 10000 + i * 100, 0))
  }
  const viewport = ref({ x: 0, y: 0, zoom: 1 })
  const containerRef = ref({ getBoundingClientRect: () => ({ width: 800, height: 600 }) })
  const { result: v, scope } = withScope(() => createCanvasVirtualization({
    nodes, viewport, containerRef, threshold: 10, bufferRatio: 1.2
  }))
  v.recalculate()
  assert.equal(v.isEnabled.value, true, '节点超阈值应启用')
  assert.ok(v.shellIds.value.size >= 40, `远离视口的节点应大多数为 shell（当前 ${v.shellIds.value.size}）`)
  for (let i = 0; i < 12; i++) {
    assert.equal(v.shellIds.value.has(`in-${i}`), false, `视口内节点 in-${i} 不应是 shell`)
  }
  for (let i = 0; i < 50; i++) {
    assert.equal(v.shellIds.value.has(`out-${i}`), true, `远端节点 out-${i} 应是 shell`)
  }
  scope.stop()
}

// --- 场景 3：选中节点永远不进入 shell ---
{
  const nodes = ref([])
  for (let i = 0; i < 100; i++) {
    nodes.value.push(makeNode(`n-${i}`, 10000 + i * 100, 10000))
  }
  const viewport = ref({ x: 0, y: 0, zoom: 1 })
  const containerRef = ref({ getBoundingClientRect: () => ({ width: 800, height: 600 }) })
  const selectedIds = ref(new Set(['n-50']))
  const { result: v, scope } = withScope(() => createCanvasVirtualization({
    nodes, viewport, containerRef, selectedIds, threshold: 10
  }))
  v.recalculate()
  assert.equal(v.shellIds.value.has('n-50'), false, '选中节点必须保持渲染真组件')
  assert.equal(v.shellIds.value.has('n-49'), true, '非选中视口外节点应是 shell')
  scope.stop()
}

// --- 场景 4：编组节点不进入 shell ---
{
  const nodes = ref([])
  for (let i = 0; i < 50; i++) nodes.value.push(makeNode(`n-${i}`, 10000 + i * 100, 10000))
  nodes.value.push({ id: 'grp', type: 'group', position: { x: 9000, y: 9000 }, width: 1000, height: 1000 })
  const viewport = ref({ x: 0, y: 0, zoom: 1 })
  const containerRef = ref({ getBoundingClientRect: () => ({ width: 800, height: 600 }) })
  const { result: v, scope } = withScope(() => createCanvasVirtualization({
    nodes, viewport, containerRef, threshold: 10
  }))
  v.recalculate()
  assert.equal(v.shellIds.value.has('grp'), false, '编组节点不应是 shell')
  scope.stop()
}

// --- 场景 5：forceDisable 强制禁用 ---
{
  const nodes = ref([])
  for (let i = 0; i < 100; i++) nodes.value.push(makeNode(`n-${i}`, 10000 + i * 100, 10000))
  const viewport = ref({ x: 0, y: 0, zoom: 1 })
  const containerRef = ref({ getBoundingClientRect: () => ({ width: 800, height: 600 }) })
  const forceDisable = ref(true)
  const { result: v, scope } = withScope(() => createCanvasVirtualization({
    nodes, viewport, containerRef, threshold: 10, forceDisable
  }))
  v.recalculate()
  assert.equal(v.isEnabled.value, false, 'forceDisable=true 时必须禁用')
  assert.equal(v.shellIds.value.size, 0)
  scope.stop()
}

// --- 场景 6：缩放后视口范围相应缩放 ---
{
  const nodes = ref([])
  // 一个非常远的节点
  nodes.value.push(makeNode('far', 5000, 5000))
  // 一个近的节点
  nodes.value.push(makeNode('near', 100, 100))
  for (let i = 0; i < 100; i++) nodes.value.push(makeNode(`p-${i}`, 50 + i, 50 + i))
  const viewport = ref({ x: 0, y: 0, zoom: 0.1 }) // 缩到很小，视口画布范围放大 10x
  const containerRef = ref({ getBoundingClientRect: () => ({ width: 800, height: 600 }) })
  const { result: v, scope } = withScope(() => createCanvasVirtualization({
    nodes, viewport, containerRef, threshold: 10, bufferRatio: 1.5
  }))
  v.recalculate()
  // zoom=0.1，视口画布范围是 8000x6000，所以 (5000,5000) 应该可见（非 shell）
  assert.equal(v.shellIds.value.has('far'), false, '缩小视图后远点节点应该可见')
  scope.stop()
}

console.log('useCanvasVirtualization tests passed')
