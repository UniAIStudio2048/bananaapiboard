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

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} must exist`)
  const bodyStart = source.indexOf('{', source.indexOf(')', start))
  let depth = 0
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}') depth--
    if (depth === 0) return source.slice(start, index + 1)
  }
  assert.fail(`${name} must have a complete body`)
}

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
assert.match(canvasStore, /function removeNode\(nodeId\)[\s\S]*cancelNodeRetries\(nodeId, activeTabId\.value\)/)
assert.match(canvasStore, /function removeNodesBatch\(nodeIds\)[\s\S]*cancelCanvasUpload\(nodeId, activeTabId\.value\)/)
assert.match(canvasStore, /function removeNodesBatch\(nodeIds\)[\s\S]*cancelNodeRetries\(nodeId, activeTabId\.value\)/)
assert.doesNotMatch(canvasStore.match(/function switchToTab\(tabId\)[\s\S]*?\n  \}/)?.[0] || '', /cancelCanvasUpload/)
assert.match(canvasView, /cancelAllCanvasUploads/)
assert.match(canvasView.match(/onUnmounted\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || '', /cancelAllCanvasUploads\(\)/)
assert.match(canvasView.match(/onUnmounted\(\(\) => \{[\s\S]*?\n\}\)/)?.[0] || '', /uploadManager\.cancelAllRetries\(\)/)
assert.doesNotMatch(uploadManager.match(/async function updateNodeWithCloudUrl\(task\)[\s\S]*?^  \}/m)?.[0] || '', /canvasStore\.nodes\.find/)

for (const [source, functionName, abortAction] of [
  [canvasBoard, 'uploadFilesToCloud', 'continue'],
  [nodeSelector, 'uploadFileToCloud', 'return'],
  [imageNode, 'uploadImageFileAsync', 'return'],
  [videoNode, 'uploadImageFileAsync', 'return'],
  [videoNode, 'uploadVideoFileAsync', 'return'],
  [videoNode, 'uploadAudioFileAsync', 'return'],
  [audioNode, 'uploadAudioFileAsync', 'return']
]) {
  const body = extractFunction(source, functionName)
  assert.match(body, /const tabId = canvasStore\.activeTabId/, `${functionName} captures tabId`)
  assert.match(body, /uploadCanvasMedia\([^\n]+\{\s*nodeId,\s*tabId\s*\}/, `${functionName} passes upload identity`)
  assert.match(body, /commitMediaUpload\(\{[\s\S]*?tabId/, `${functionName} commits to captured tab`)
  assert.match(
    body,
    new RegExp(`catch \\(error\\) \\{\\s*if \\(error\\?\\.name === 'AbortError'\\) ${abortAction}`),
    `${functionName} handles intentional aborts without stopping unrelated uploads`
  )
  assert.match(body, /markMediaUploadFailed\(\{[\s\S]*?nodeId,[\s\S]*?tabId,[\s\S]*?error/, `${functionName} marks failure on the captured tab`)
  assert.match(body, /registerFailedUpload\([^,]+, \{[\s\S]*?nodeId, tabId,/, `${functionName} registers retry identity`)
  assert.doesNotMatch(body, /canvasStore\.nodes\.find/, `${functionName} must not require the failed tab to stay active`)
}

console.log('canvas direct upload source tests passed')
