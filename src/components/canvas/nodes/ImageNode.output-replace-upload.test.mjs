import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./ImageNode.vue', import.meta.url), 'utf8')
const commitSource = readFileSync(new URL('../../../stores/canvas/mediaUploadCommit.js', import.meta.url), 'utf8')

test('generated output preview exposes an icon-only replace upload button', () => {
  const outputPreviewMatch = source.match(
    /<div\s+v-else-if="hasOutput"[\s\S]*?class="preview-images"[\s\S]*?<\/div>\s*<!-- 有上游连接时/
  )
  assert.ok(outputPreviewMatch, 'output preview block should exist')
  const outputPreview = outputPreviewMatch[0]

  assert.match(outputPreview, /class="[^"]*\breplace-output-image-btn\b[^"]*"/)
  assert.match(outputPreview, /title="替换图片"/)
  assert.match(outputPreview, /aria-label="替换图片"/)
  assert.match(outputPreview, /@click\.stop="triggerReplaceOutputUpload"/)
})

test('generated output preview exposes an icon-only full preview button', () => {
  const outputPreviewMatch = source.match(
    /<div\s+v-else-if="hasOutput"[\s\S]*?class="preview-images"[\s\S]*?<\/div>\s*<!-- 有上游连接时/
  )
  assert.ok(outputPreviewMatch, 'output preview block should exist')
  const outputPreview = outputPreviewMatch[0]

  assert.match(outputPreview, /class="[^"]*\bpreview-output-image-btn\b[^"]*"/)
  assert.match(outputPreview, /title="全图预览"/)
  assert.match(outputPreview, /aria-label="全图预览"/)
  assert.match(outputPreview, /@click\.stop="handleToolbarPreview"/)
})

test('output replace upload action swaps the displayed output to the local blob immediately', () => {
  assert.match(source, /const REPLACE_OUTPUT_IMAGE_ACTION = 'replace-output-image'/)
  assert.match(source, /function triggerReplaceOutputUpload\(\)/)
  assert.match(source, /pendingAction\.value = REPLACE_OUTPUT_IMAGE_ACTION/)

  const handleFileUploadMatch = source.match(/async function handleFileUpload\(event\) \{[\s\S]*?\n\}/)
  assert.ok(handleFileUploadMatch, 'handleFileUpload should exist')
  assert.match(handleFileUploadMatch[0], /actionType === REPLACE_OUTPUT_IMAGE_ACTION/)
  assert.match(handleFileUploadMatch[0], /handleReplaceOutputImageFlow\(blobUrl\)/)

  const replaceFlowMatch = source.match(/function handleReplaceOutputImageFlow\(blobUrl\) \{[\s\S]*?\n\}/)
  assert.ok(replaceFlowMatch, 'handleReplaceOutputImageFlow should exist')
  assert.match(replaceFlowMatch[0], /status: 'success'/)
  assert.match(replaceFlowMatch[0], /output:\s*\{[\s\S]*url: blobUrl,[\s\S]*urls: \[blobUrl\]/)
  assert.match(replaceFlowMatch[0], /uploadId: null/)
  assert.match(replaceFlowMatch[0], /assetId: null/)
  assert.match(replaceFlowMatch[0], /isUploading: false/)
})

test('source image replacement clears the previous upload identity before uploading', () => {
  const updateSourceMatch = source.match(/async function updateSourceImage\(event\) \{[\s\S]*?\n\}/)
  assert.ok(updateSourceMatch, 'updateSourceImage should exist')
  assert.match(updateSourceMatch[0], /uploadId: null/)
  assert.match(updateSourceMatch[0], /assetId: null/)
  assert.match(updateSourceMatch[0], /isUploading: true/)
})

test('background upload replacement keeps output url and urls fields in sync', () => {
  const uploadAsyncMatch = source.match(/async function uploadImageFileAsync\(file, blobUrl, nodeId\) \{[\s\S]*?\n\}/)
  assert.ok(uploadAsyncMatch, 'uploadImageFileAsync should exist')
  assert.match(uploadAsyncMatch[0], /canvasStore\.commitMediaUpload\(/)
  assert.match(uploadAsyncMatch[0], /mediaType: 'image'/)
  assert.match(commitSource, /next\.url === from/)
  assert.match(commitSource, /replaceArray\(next\.urls, from, to\)/)
})
