import assert from 'node:assert/strict'
import fs from 'node:fs'

const files = [
  '../components/canvas/nodes/ImageNode.vue',
  '../components/canvas/nodes/VideoNode.vue',
  '../components/canvas/nodes/TextNode.vue',
  '../components/canvas/CanvasBottomPanel.vue',
  '../views/Canvas.vue',
  '../components/canvas/SaveWorkflowDialog.vue'
]

for (const file of files) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8')
  assert.match(source, /import\s*\{[^}]*findBlockingCanvasUploads[^}]*\}\s*from\s*['"]@\/utils\/canvasUploadGuard['"]/s, `${file} imports guard`)
  assert.match(source, /findBlockingCanvasUploads\(/, `${file} invokes guard`)
  assert.match(source, /素材仍在上传，请等待完成后重试/, `${file} shows stable blocking message`)
}

console.log('canvasUploadGuard integration source tests passed')
