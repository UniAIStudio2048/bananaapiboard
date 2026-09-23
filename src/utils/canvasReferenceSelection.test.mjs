import assert from 'node:assert/strict'
import test from 'node:test'
import { findCanvasReferenceAssetNode, isCanvasReferenceSource } from './canvasReferenceSelection.js'

test('参考来源只接受有实际媒体的图片、视频、音频节点', () => {
  assert.equal(isCanvasReferenceSource({ type: 'image-input', data: { sourceImages: ['a.png'] } }), true)
  assert.equal(isCanvasReferenceSource({ type: 'video', data: { output: { url: 'a.mp4' } } }), true)
  assert.equal(isCanvasReferenceSource({ type: 'audio-input', data: { audioUrl: 'a.mp3' } }), true)
  assert.equal(isCanvasReferenceSource({ type: 'image-input', data: {} }), false)
  assert.equal(isCanvasReferenceSource({ type: 'text-input', data: { text: 'hello' } }), false)
})

test('同一资产优先复用资产 ID，旧节点可按媒体 URL 复用', () => {
  const nodes = [
    { id: 'old', type: 'image-input', data: { sourceImages: ['same.png'] } },
    { id: 'exact', type: 'image-input', data: { assetId: 12, sourceImages: ['other.png'] } },
    { id: 'empty', type: 'image-input', data: { assetId: 13 } }
  ]
  assert.equal(findCanvasReferenceAssetNode(nodes, { id: 12, type: 'image', url: 'same.png' })?.id, 'exact')
  assert.equal(findCanvasReferenceAssetNode(nodes, { id: 14, type: 'image', url: 'same.png' })?.id, 'old')
  assert.equal(findCanvasReferenceAssetNode(nodes, { id: 13, type: 'image', url: 'new.png' }), null)
  assert.equal(findCanvasReferenceAssetNode(nodes, { id: 15, type: 'image', url: 'new.png' }), null)
})
