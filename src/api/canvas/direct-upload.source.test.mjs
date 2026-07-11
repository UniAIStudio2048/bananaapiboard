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
const canvasStore = read('../../stores/canvas/canvasStore.js')
const uploadManager = read('../../stores/canvas/uploadManager.js')
const canvasView = read('../../views/Canvas.vue')
const canvasBoard = read('../../components/canvas/CanvasBoard.vue')
const nodeSelector = read('../../components/canvas/NodeSelector.vue')
const imageNode = read('../../components/canvas/nodes/ImageNode.vue')
const audioNode = read('../../components/canvas/nodes/AudioNode.vue')

assert.match(direct, /createCanvasDirectUploader/)
assert.match(direct, /JSON\.stringify\(options\.body\)/)
assert.match(direct, /credentials:\s*['"]omit['"]/)
assert.doesNotMatch(direct, /Authorization[^\n]+directFetch|directFetch[^\n]+Authorization/)
assert.match(direct, /createCanvasUploadCancellationRegistry/)
assert.match(direct, /export function cancelCanvasUpload/)
assert.match(direct, /export function cancelAllCanvasUploads/)

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

assert.match(canvasStore, /function removeNode\(nodeId\)[\s\S]*cancelCanvasUpload\(nodeId, activeTabId\.value\)/)
assert.match(canvasStore, /function removeNodesBatch\(nodeIds\)[\s\S]*cancelCanvasUpload\(nodeId, activeTabId\.value\)/)
assert.doesNotMatch(canvasStore.match(/function switchToTab\(tabId\)[\s\S]*?\n  \}/)?.[0] || '', /cancelCanvasUpload/)
assert.match(canvasView, /cancelAllCanvasUploads/)
assert.match(canvasView.match(/onUnmounted\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || '', /cancelAllCanvasUploads\(\)/)
assert.doesNotMatch(uploadManager.match(/async function updateNodeWithCloudUrl\(task\)[\s\S]*?^  \}/m)?.[0] || '', /canvasStore\.nodes\.find/)

for (const [source, functionName] of [
  [canvasBoard, 'uploadFilesToCloud'],
  [nodeSelector, 'uploadFileToCloud'],
  [imageNode, 'uploadImageFileAsync'],
  [videoNode, 'uploadImageFileAsync'],
  [videoNode, 'uploadVideoFileAsync'],
  [videoNode, 'uploadAudioFileAsync'],
  [audioNode, 'uploadAudioFileAsync']
]) {
  const start = source.indexOf(`function ${functionName}`)
  const nextFunction = source.indexOf('\nfunction ', start + 1)
  const body = source.slice(start, nextFunction === -1 ? source.length : nextFunction)
  assert.match(body, /const tabId = canvasStore\.activeTabId/, `${functionName} captures tabId`)
  assert.match(body, /uploadCanvasMedia\([^\n]+\{\s*nodeId,\s*tabId\s*\}/, `${functionName} passes upload identity`)
  assert.match(body, /commitMediaUpload\(\{[\s\S]*?tabId/, `${functionName} commits to captured tab`)
  assert.match(body, /catch \(error\) \{\s*if \(error\?\.name === 'AbortError'\) return/, `${functionName} ignores intentional aborts`)
}

console.log('canvas direct upload source tests passed')
