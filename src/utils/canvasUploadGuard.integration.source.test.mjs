import assert from 'node:assert/strict'
import fs from 'node:fs'

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

const canvasSource = fs.readFileSync(new URL('../views/Canvas.vue', import.meta.url), 'utf8')
const quickSaveSource = extractFunction(canvasSource, 'quickSaveWorkflow')
assert.match(quickSaveSource, /findBlockingCanvasUploads\(canvasStore\.nodes, canvasStore\.edges\)/)
assert.ok(
  quickSaveSource.indexOf('findBlockingCanvasUploads(') < quickSaveSource.indexOf("import('@/api/canvas/workflow')"),
  'quick save must stop before loading or calling the durable save API'
)

const exitPersistSource = extractFunction(canvasSource, 'persistCurrentWorkflowOnExit')
assert.match(exitPersistSource, /findBlockingCanvasUploads\(canvasStore\.nodes, canvasStore\.edges\)/)
assert.ok(
  exitPersistSource.indexOf('findBlockingCanvasUploads(') < exitPersistSource.indexOf('sendBeaconExitSave(payload)'),
  'exit persistence must stop before sendBeacon'
)
assert.ok(
  exitPersistSource.indexOf('findBlockingCanvasUploads(') < exitPersistSource.indexOf("import('@/api/canvas/workflow')"),
  'exit persistence must stop before loading or calling the durable save API'
)

assert.match(extractFunction(canvasSource, 'handleBeforeUnload'), /persistCurrentWorkflowOnExit\('beforeunload', \{ beaconOnly: true \}\)/)
assert.match(extractFunction(canvasSource, 'handlePageHide'), /persistCurrentWorkflowOnExit\('pagehide', \{ beaconOnly: true \}\)/)

const switcherSource = fs.readFileSync(new URL('../components/canvas/CanvasSpaceSwitcher.vue', import.meta.url), 'utf8')
assert.match(switcherSource, /import\s*\{[^}]*findBlockingCanvasUploads[^}]*\}\s*from\s*['"]@\/utils\/canvasUploadGuard['"]/s)
const saveTabsSource = extractFunction(switcherSource, 'saveAllTabsAndReset')
assert.match(saveTabsSource, /findBlockingCanvasUploads\(/)
assert.ok(
  saveTabsSource.indexOf('findBlockingCanvasUploads(') < saveTabsSource.indexOf("import('@/api/canvas/workflow')"),
  'space switching must preflight every dirty tab before the first durable save'
)
assert.ok(
  saveTabsSource.indexOf('findBlockingCanvasUploads(') < saveTabsSource.lastIndexOf('canvasStore.closeAllTabs()'),
  'space switching must preflight dirty tabs before closing them'
)

const selectSpaceSource = extractFunction(switcherSource, 'selectSpace')
assert.match(selectSpaceSource, /const reset = await saveAllTabsAndReset\(\)/)
assert.match(selectSpaceSource, /if \(!reset\) return/)
assert.ok(
  selectSpaceSource.indexOf('if (!reset) return') < selectSpaceSource.indexOf('teamStore.switchToPersonalSpace()'),
  'a blocked tab must cancel the actual space switch'
)

console.log('canvasUploadGuard integration source tests passed')
