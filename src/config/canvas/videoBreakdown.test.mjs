import test from 'node:test'
import assert from 'node:assert/strict'
import { NODE_TYPES, NODE_CATEGORIES, canConnect, getDownstreamOptions, getUpstreamOptions } from './nodeTypes.js'
test('逐帧拉片可从空白菜单及视频下游创建，接收视频并保持原连接规则',()=>{
  assert.equal(NODE_TYPES.VIDEO_BREAKDOWN,'video-breakdown')
  assert.ok(NODE_CATEGORIES.input.types.includes('video-breakdown'))
  for (const source of ['video','video-input','video-gen','text-to-video','image-to-video']) {
    assert.ok(canConnect(source,'video-breakdown'),source)
    assert.ok(getDownstreamOptions(source).some(item=>item.type==='video-breakdown'))
  }
  assert.ok(getUpstreamOptions('video-breakdown').some(item=>item.type==='video-input'))
  assert.equal(canConnect('image-input','video-breakdown'),false)
  assert.ok(canConnect('video','video-edit'))
})
