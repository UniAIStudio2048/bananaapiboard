import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')

// 防回归：当源图 URL 失效时，必须给用户提供重新上传入口，不能让用户只能删除节点。
// 该 bug 起因是 v-if="!isFromHistoryOrAsset" 把"上传"按钮隐藏了，加上没有 @error 兜底。

test('ImageNode declares sourceImageLoadFailed state and error handler', () => {
  assert.match(source, /const sourceImageLoadFailed = ref\(false\)/)
  assert.match(source, /function handleSourceImageError\(\)/)
  // 必须重置：sourceImages[0] 变化时清掉失败标志，否则换图后仍显示失败覆盖层
  assert.match(
    source,
    /watch\(\(\) => sourceImages\.value\[0\][\s\S]*?sourceImageLoadFailed\.value = false/
  )
})

test('ImageNode binds @error on source CanvasNodeImage so failures flip the state', () => {
  // 必须给源图绑定 handleSourceImageError，否则失败状态永远不会被置位
  const sourceTemplateMatch = source.match(
    /<template v-if="isSourceNode && hasSourceImage">([\s\S]*?)<\/template>/
  )
  assert.ok(sourceTemplateMatch, 'source template block should exist')
  const sourceTemplate = sourceTemplateMatch[1]
  assert.match(
    sourceTemplate,
    /<CanvasNodeImage[\s\S]*?@error="handleSourceImageError"/
  )
})

test('ImageNode upload-overlay-btn 显示条件覆盖加载失败场景', () => {
  // 关键回归点：原 v-if="!isFromHistoryOrAsset" 会让历史/资产节点失效图片彻底无法重传。
  // 修复后必须在 sourceImageLoadFailed 时也强制显示，且按钮文案切换为"重新上传"。
  assert.match(
    source,
    /v-if="!isFromHistoryOrAsset \|\| sourceImageLoadFailed"\s+class="upload-overlay-btn"/
  )
  assert.match(
    source,
    /sourceImageLoadFailed \? '重新上传' : '上传'/
  )
})

test('ImageNode renders 加载失败覆盖层 instead of broken image', () => {
  // 失败时不再渲染裂图 <CanvasNodeImage>，改成可点击重新上传的提示层
  const sourceTemplateMatch = source.match(
    /<template v-if="isSourceNode && hasSourceImage">([\s\S]*?)<\/template>/
  )
  assert.ok(sourceTemplateMatch)
  const sourceTemplate = sourceTemplateMatch[1]
  assert.match(
    sourceTemplate,
    /v-if="sourceImageLoadFailed"[\s\S]*?class="source-image-failed"[\s\S]*?@click="handleReupload"/
  )
  assert.match(
    sourceTemplate,
    /<CanvasNodeImage\s+v-else-if="isNodeVisible"/
  )
})

test('ImageNode 加载失败覆盖层有对应样式', () => {
  assert.match(source, /\.source-image-failed\s*\{/)
})
