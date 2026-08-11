/**
 * 节点左侧 + 号「Reference Image」直接上传原图并创建带图上游节点连线。
 *
 * 缺陷：左侧 + 号菜单的 Reference Image 走 createUpstreamNode('image-input')
 * 创建的是**空** image-input 节点（无图），用户期望「上传原图 → 创建带图
 * 上游节点 → 连线作为参考图」一步到位。
 *
 * Run: cd bananapiboard && node --test src/components/canvas/nodes/ImageNode.left-add-ref.source.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./ImageNode.vue', import.meta.url), 'utf8')

test('左侧 + 号 Reference Image 触发文件上传（复用上传逻辑），而非创建空节点', () => {
  // 菜单项 action：Reference Image → triggerRefImageUpload（弹文件选择器）
  assert.match(source, /icon: '◫', labelKey: 'canvas\.imageNode\.refImage', action: \(\) => triggerRefImageUpload\(\)/)
})

test('上传后复用 createUpstreamImageNode 创建带图上游节点并连线', () => {
  // handleRefImageUpload 上传成功后调用 createUpstreamImageNode
  assert.match(source, /createUpstreamImageNode\(imageUrl\)/)
  // createUpstreamImageNode：创建 image-input 带 sourceImages + addEdge 连线 + 更新 imageOrder
  assert.match(source, /canvasStore\.addNode\(\{[\s\S]*?type: 'image-input',[\s\S]*?sourceImages: \[imageUrl\]/)
  assert.match(source, /canvasStore\.addEdge\(\{[\s\S]*?source: newNodeId,[\s\S]*?target: props\.id/)
  assert.match(source, /imageOrder: \[\.\.\.currentOrder, imageUrl\]/)
})
