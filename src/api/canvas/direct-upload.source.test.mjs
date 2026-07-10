import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8')
const direct = read('./direct-upload.js')
const nodes = read('./nodes.js')
const workflow = read('./workflow.js')
const assistant = read('./ai-assistant.js')
const textNode = read('../../components/canvas/nodes/TextNode.vue')
const videoNode = read('../../components/canvas/nodes/VideoNode.vue')
const assetPanel = read('../../components/canvas/AssetPanel.vue')
const cameraPanel = read('../../components/canvas/Camera3DPanel.vue')

assert.match(direct, /createCanvasDirectUploader/)
assert.match(direct, /JSON\.stringify\(options\.body\)/)
assert.match(direct, /credentials:\s*['"]omit['"]/)
assert.doesNotMatch(direct, /Authorization[^\n]+directFetch|directFetch[^\n]+Authorization/)

assert.match(nodes, /uploadCanvasFile\(file,\s*['"]image['"]/)
assert.match(nodes, /files\.slice\(0,\s*9\)/)
assert.match(workflow, /uploadCanvasFile\(file,\s*type/)
assert.match(assistant, /uploadCanvasFile\(file,\s*fileType/)
assert.match(assistant, /storage:\s*['"]cos['"]/)

for (const source of [nodes, workflow, assistant]) {
  assert.doesNotMatch(source, /new FormData/)
  assert.doesNotMatch(source, /\/api\/images\/upload|\/api\/videos\/upload|\/api\/canvas\/upload-audio/)
}

assert.match(textNode, /uploadCanvasMedia\(file,\s*item\.type/)
assert.match(videoNode, /uploadCanvasMedia\(file,\s*['"]video['"]/)
assert.match(videoNode, /uploadCanvasMedia\(file,\s*['"]audio['"]/)
assert.match(assetPanel, /uploadCanvasMedia\(file,\s*fileType/)
assert.match(cameraPanel, /uploadCameraImageToCloud/)
assert.match(cameraPanel, /uploadCanvasMedia\(file,\s*['"]image['"]/)

for (const source of [textNode, videoNode, assetPanel, cameraPanel]) {
  assert.doesNotMatch(source, /getApiUrl\(['"]\/api\/images\/upload['"]\)/)
  assert.doesNotMatch(source, /getApiUrl\(['"]\/api\/videos\/upload['"]\)/)
  assert.doesNotMatch(source, /getApiUrl\(['"]\/api\/canvas\/upload-temp-image['"]\)/)
}

console.log('canvas direct upload source tests passed')
