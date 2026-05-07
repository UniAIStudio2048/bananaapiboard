import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeCommunityWorkflowPreviewNodes } from './communityWorkflowPreview.js'

test('保留历史 group 节点 type 并补齐 dimensions 尺寸到 data', () => {
  const raw = [
    {
      id: 'group-1777152320604',
      type: 'group',
      position: { x: 720, y: 280 },
      dimensions: { width: 930, height: 7913 },
      style: { zIndex: -1000 },
      data: { title: '节点' }
    }
  ]

  const out = normalizeCommunityWorkflowPreviewNodes(raw)

  assert.equal(out.length, 1)
  const g = out[0]
  assert.equal(g.type, 'group')
  assert.equal(g.data.width, 930)
  assert.equal(g.data.height, 7913)
})

test('group 节点 data.groupName 从 data.groupName / title / label 依次补齐', () => {
  const fromGroupName = normalizeCommunityWorkflowPreviewNodes([
    { id: 'g1', type: 'group', dimensions: { width: 100, height: 100 }, data: { groupName: '组A', title: '忽略', label: '忽略' } }
  ])[0]
  assert.equal(fromGroupName.data.groupName, '组A')

  const fromTitle = normalizeCommunityWorkflowPreviewNodes([
    { id: 'g2', type: 'group', dimensions: { width: 100, height: 100 }, data: { title: '组B', label: '忽略' } }
  ])[0]
  assert.equal(fromTitle.data.groupName, '组B')

  const fromLabel = normalizeCommunityWorkflowPreviewNodes([
    { id: 'g3', type: 'group', dimensions: { width: 100, height: 100 }, data: { label: '组C' } }
  ])[0]
  assert.equal(fromLabel.data.groupName, '组C')
})

test('group 节点 data.width/height 也支持顶层 width/height', () => {
  const out = normalizeCommunityWorkflowPreviewNodes([
    {
      id: 'g-top',
      type: 'group',
      width: 555,
      height: 666,
      data: {}
    }
  ])[0]
  assert.equal(out.data.width, 555)
  assert.equal(out.data.height, 666)
})

test('group 节点必须从负 z-index 归一化为可见但低于普通节点的层级', () => {
  const out = normalizeCommunityWorkflowPreviewNodes([
    {
      id: 'group-x',
      type: 'group',
      dimensions: { width: 200, height: 200 },
      style: { zIndex: -1000 },
      data: {}
    }
  ])[0]
  assert.equal(out.zIndex, 0)
  assert.equal(out.style.zIndex, 0)
})

test('group 节点也应被标记为 readonly 且不可拖拽连线', () => {
  const out = normalizeCommunityWorkflowPreviewNodes([
    { id: 'g1', type: 'group', dimensions: { width: 100, height: 100 }, data: { title: '组' } }
  ])[0]
  assert.equal(out.draggable, false)
  assert.equal(out.connectable, false)
  assert.equal(out.data.readonly, true)
})

test('普通非 group 节点保持只读、保留原 data，且层级高于 group', () => {
  const raw = [
    {
      id: 'text-1',
      type: 'text-input',
      position: { x: 0, y: 0 },
      data: { text: 'hello', foo: 'bar' }
    }
  ]
  const out = normalizeCommunityWorkflowPreviewNodes(raw)[0]
  assert.equal(out.type, 'text-input')
  assert.equal(out.data.text, 'hello')
  assert.equal(out.data.foo, 'bar')
  assert.equal(out.data.readonly, true)
  assert.equal(out.draggable, false)
  assert.equal(out.connectable, false)
  assert.equal(out.selectable, true)
  assert.equal(out.zIndex, 1)
  assert.equal(out.style.zIndex, 1)
})

test('普通节点没有 data 时也不会爆炸', () => {
  const out = normalizeCommunityWorkflowPreviewNodes([
    { id: 'n1', type: 'image-input', position: { x: 0, y: 0 } }
  ])[0]
  assert.equal(out.data.readonly, true)
  assert.equal(out.zIndex, 1)
  assert.equal(out.style.zIndex, 1)
})

test('空输入或 null 输入返回空数组', () => {
  assert.deepEqual(normalizeCommunityWorkflowPreviewNodes([]), [])
  assert.deepEqual(normalizeCommunityWorkflowPreviewNodes(null), [])
  assert.deepEqual(normalizeCommunityWorkflowPreviewNodes(undefined), [])
})

test('普通节点已有 style 时保留原字段并合并 zIndex', () => {
  const out = normalizeCommunityWorkflowPreviewNodes([
    {
      id: 'n2',
      type: 'image-input',
      style: { opacity: 0.8 },
      data: {}
    }
  ])[0]
  assert.equal(out.style.opacity, 0.8)
  assert.equal(out.style.zIndex, 1)
})
