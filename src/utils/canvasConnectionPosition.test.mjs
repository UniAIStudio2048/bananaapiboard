import test from 'node:test'
import assert from 'node:assert/strict'
import { findConnectionSnapTarget, getElementCenterFlowPosition } from './canvasConnectionPosition.js'

function createElementWithRect(rect) {
  return {
    getBoundingClientRect: () => rect,
    closest: (selector) => {
      if (selector !== '.vue-flow') return null
      return {
        getBoundingClientRect: () => ({ left: 100, top: 50 })
      }
    }
  }
}

test('getElementCenterFlowPosition uses screenToFlowPosition when provided', () => {
  const element = createElementWithRect({ left: 210, top: 120, width: 36, height: 36 })
  const seen = []

  const result = getElementCenterFlowPosition(element, {
    screenToFlowPosition(position) {
      seen.push(position)
      return { x: position.x / 5, y: position.y / 5 }
    },
    viewport: { x: 9999, y: 9999, zoom: 0.01 }
  })

  assert.deepEqual(seen, [{ x: 228, y: 138 }])
  assert.deepEqual(result, { x: 45.6, y: 27.6 })
})

test('getElementCenterFlowPosition falls back to viewport math for legacy callers', () => {
  const element = createElementWithRect({ left: 210, top: 120, width: 36, height: 36 })

  const result = getElementCenterFlowPosition(element, {
    viewport: { x: 50, y: 25, zoom: 5 }
  })

  assert.deepEqual(result, { x: 15.6, y: 12.6 })
})

// ========== findConnectionSnapTarget ==========

const SNAP_VIEWPORT = { x: 0, y: 0, zoom: 1 }

// 简化端口模型：input 端口固定在节点左缘外 34px、垂直居中
function makeGetHandlePosition(nodes) {
  return (nodeId, handleType) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return { x: 0, y: 0 }
    const x = handleType === 'output'
      ? node.position.x + node.width + 34
      : node.position.x - 34
    return { x, y: node.position.y + node.height / 2 }
  }
}

test('findConnectionSnapTarget returns nearest node within snap radius', () => {
  const nodes = [
    { id: 'source', type: 'text', position: { x: 0, y: 0 }, width: 400, height: 280 },
    { id: 'far', type: 'image', position: { x: 800, y: 0 }, width: 380, height: 320 },
    { id: 'near', type: 'image', position: { x: 600, y: 100 }, width: 380, height: 320 }
  ]
  // near 节点 input 端口 flow 坐标为 (600-34, 100+160) = (566, 260)，屏幕坐标相同
  // 鼠标距其 30px，距 far 节点端口 (766, 160) 更远
  const mouse = { x: 596, y: 290 }

  const result = findConnectionSnapTarget({
    screenPosition: mouse,
    sourceNodeId: 'source',
    nodes,
    getHandlePosition: makeGetHandlePosition(nodes),
    viewport: SNAP_VIEWPORT,
    snapRadius: 60
  })

  assert.deepEqual(result, { nodeId: 'near', position: { x: 566, y: 260 } })
})

test('findConnectionSnapTarget returns null when beyond snap radius', () => {
  const nodes = [
    { id: 'source', type: 'text', position: { x: 0, y: 0 }, width: 400, height: 280 },
    { id: 'target', type: 'image', position: { x: 600, y: 100 }, width: 380, height: 320 }
  ]
  // 鼠标距 input 端口 (566, 260) 61px
  const mouse = { x: 627, y: 260 }

  const result = findConnectionSnapTarget({
    screenPosition: mouse,
    sourceNodeId: 'source',
    nodes,
    getHandlePosition: makeGetHandlePosition(nodes),
    viewport: SNAP_VIEWPORT,
    snapRadius: 60
  })

  assert.equal(result, null)
})

test('findConnectionSnapTarget excludes source node and group nodes', () => {
  const nodes = [
    { id: 'source', type: 'text', position: { x: 0, y: 0 }, width: 400, height: 280 },
    { id: 'group-1', type: 'group', position: { x: 600, y: 100 }, width: 380, height: 320 }
  ]
  // 鼠标正好压在 source 自身 input 端口上，也不得命中 group
  const mouse = { x: -34, y: 140 }

  const result = findConnectionSnapTarget({
    screenPosition: mouse,
    sourceNodeId: 'source',
    nodes,
    getHandlePosition: makeGetHandlePosition(nodes),
    viewport: SNAP_VIEWPORT,
    snapRadius: 60
  })

  assert.equal(result, null)
})

test('findConnectionSnapTarget radius is screen-based regardless of zoom', () => {
  const nodes = [
    { id: 'source', type: 'text', position: { x: 0, y: 0 }, width: 400, height: 280 },
    { id: 'target', type: 'image', position: { x: 600, y: 100 }, width: 380, height: 320 }
  ]
  const viewport = { x: 0, y: 0, zoom: 0.5 }
  // input 端口 flow (566, 260) → 屏幕 (283, 130)；鼠标屏幕距离 30px（flow 距离 60px）
  const mouse = { x: 283, y: 160 }

  const result = findConnectionSnapTarget({
    screenPosition: mouse,
    sourceNodeId: 'source',
    nodes,
    getHandlePosition: makeGetHandlePosition(nodes),
    viewport,
    snapRadius: 60
  })

  assert.deepEqual(result, { nodeId: 'target', position: { x: 566, y: 260 } })
})

test('findConnectionSnapTarget tolerates invalid input', () => {
  assert.equal(findConnectionSnapTarget({ screenPosition: null, sourceNodeId: 'a', nodes: [], getHandlePosition: () => ({ x: 0, y: 0 }), viewport: SNAP_VIEWPORT }), null)
  assert.equal(findConnectionSnapTarget({ screenPosition: { x: Number.NaN, y: 0 }, sourceNodeId: 'a', nodes: [{ id: 'b', type: 'image' }], getHandlePosition: () => ({ x: 0, y: 0 }), viewport: SNAP_VIEWPORT }), null)
  assert.equal(findConnectionSnapTarget({ screenPosition: { x: 0, y: 0 }, sourceNodeId: 'a', nodes: null, getHandlePosition: null, viewport: SNAP_VIEWPORT }), null)
})
