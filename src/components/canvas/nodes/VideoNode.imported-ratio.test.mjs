import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ref, computed } from 'vue'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} must exist`)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

function createNode(data = {}, ratios = ['16:9', '9:16', '1:1', '3:4', '4:3']) {
  const props = { id: 'imported-video', data: { aspectRatio: '16:9', detectAspectRatio: true, ...data } }
  const patches = []
  const persisted = []
  const state = {
    props, ref, computed,
    patchWorkflowNode: async (workflowId, nodeId, patch) => persisted.push({ workflowId, nodeId, patch }),
    selectedAspectRatio: ref(props.data.aspectRatio),
    availableAspectRatios: ref(ratios.map(value => ({ value }))),
    detectedVideoDimensions: ref(null),
    nodeWidth: ref(420), nodeHeight: ref(280),
    canvasStore: { updateNodeData(id, patch) {
      assert.equal(id, props.id)
      patches.push(patch)
      Object.assign(props.data, patch)
    } }
  }
  const styleStart = source.indexOf('const videoWrapperStyle = computed(')
  const styleEnd = source.indexOf('\n})', styleStart) + 3
  const methods = runInNewContext([
    extractFunction('parseAspectRatioValue'),
    extractFunction('applyDetectedVideoDimensions'),
    extractFunction('getCurrentNodeDisplayHeight'),
    source.slice(styleStart, styleEnd),
    ';({ detect: applyDetectedVideoDimensions, style: videoWrapperStyle, displayHeight: getCurrentNodeDisplayHeight })'
  ].join('\n'), state)
  return { ...state, ...methods, patches, persisted }
}

for (const [width, height, expected] of [
  [1080, 1920, '9:16'], [1920, 1080, '16:9'], [1080, 1080, '1:1'], [960, 1280, '3:4']
]) {
  test(`imported ${width}x${height} video selects ${expected} and displays its actual ratio`, () => {
    const node = createNode()
    node.detect(width, height)
    assert.equal(node.selectedAspectRatio.value, expected)
    assert.equal(node.props.data.aspectRatio, expected)
    assert.equal(node.props.data.detectAspectRatio, false)
    assert.equal(node.props.data.videoWidth, width)
    assert.equal(node.props.data.videoHeight, height)
    assert.equal(node.style.value.aspectRatio, `${width} / ${height}`)
    assert.equal(node.nodeWidth.value, height > width ? 280 : 420)
    assert.equal(node.nodeHeight.value, Math.round(node.nodeWidth.value * height / width))
    assert.ok(node.patches.some(patch => patch.aspectRatio === expected && patch.detectAspectRatio === false))
  })
}

test('unsupported source ratio selects the closest allowed ratio while preview stays exact', () => {
  const node = createNode({}, ['16:9', '3:4', '1:1'])
  node.detect(1080, 1920)
  assert.equal(node.props.data.aspectRatio, '3:4')
  assert.equal(node.style.value.aspectRatio, '1080 / 1920')
})

for (const ratios of [[], ['adaptive']]) {
  test(`imported portrait video respects ratio configuration ${JSON.stringify(ratios)}`, () => {
    const ratio = ratios[0] || ''
    const node = createNode({ aspectRatio: ratio }, ratios)
    node.detect(1080, 1920)
    assert.equal(node.selectedAspectRatio.value, ratio)
    assert.equal(node.props.data.aspectRatio, ratio)
    assert.equal(node.props.data.detectAspectRatio, false)
    assert.equal(node.style.value.aspectRatio, '1080 / 1920')
  })
}

test('repeat metadata and reloading a saved import preserve a subsequent manual choice', () => {
  const node = createNode()
  node.detect(1080, 1920)
  node.selectedAspectRatio.value = '16:9'
  node.props.data.aspectRatio = '16:9'
  node.detect(1080, 1920)
  const restored = createNode(JSON.parse(JSON.stringify(node.props.data)))
  restored.detect(1080, 1920)
  assert.equal(restored.selectedAspectRatio.value, '16:9')
  assert.equal(restored.style.value.aspectRatio, '1080 / 1920')
  assert.ok(restored.patches.every(patch => !Object.hasOwn(patch, 'aspectRatio')))
})

test('invalid dimensions keep the import pending until valid metadata arrives', () => {
  const node = createNode()
  for (const [width, height] of [[0, 0], [NaN, 1920], [1080, -1]]) node.detect(width, height)
  assert.equal(node.patches.length, 0)
  assert.equal(node.props.data.detectAspectRatio, true)
  node.detect(1080, 1920)
  assert.equal(node.props.data.aspectRatio, '9:16')
})

test('imported dimensions and detected ratio are immediately patched to the saved workflow', () => {
  const node = createNode()
  node.canvasStore.getCurrentTab = () => ({ workflowId: 'saved-workflow' })
  node.detect(1080, 1920)
  assert.equal(node.persisted.length, 1)
  const saved = node.persisted[0]
  assert.equal(saved.workflowId, 'saved-workflow')
  assert.equal(saved.nodeId, node.props.id)
  assert.equal(saved.patch.data.aspectRatio, '9:16')
  assert.equal(saved.patch.data.detectAspectRatio, false)
  assert.equal(saved.patch.data.videoWidth, 1080)
  assert.equal(saved.patch.data.videoHeight, 1920)
  assert.equal(saved.patch.data.width, 280)
})

test('generated video preview and downstream placement use media dimensions without resetting generation options', () => {
  const node = createNode({ detectAspectRatio: false, aspectRatio: '16:9' })
  node.detect(1080, 1920)
  assert.equal(node.selectedAspectRatio.value, '16:9')
  assert.equal(node.style.value.aspectRatio, '1080 / 1920')
  assert.equal(node.displayHeight({ data: node.props.data }), Math.ceil(420 * 1920 / 1080))
})
