import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { effectScope, nextTick, reactive, ref, watch } from 'vue'

const source = readFileSync(new URL('./TextNode.vue', import.meta.url), 'utf8')
const storeSource = readFileSync(new URL('../../../stores/canvas/canvasStore.js', import.meta.url), 'utf8')
const presets = [
  { id: 'image-describe', name: '图片反推', systemPrompt: 'Default image prompt' },
  { id: 'image-description', name: '图像描述', systemPrompt: 'Selected image prompt' },
  { id: 'video-describe', name: '视频反推', systemPrompt: 'Selected video prompt' },
  { id: 'user-7', name: '我的预设', type: 'user-custom', systemPrompt: 'User prompt' },
  { id: 'temp-custom', name: '临时自定义', type: 'temp-custom' }
]

function extractFunction(text, name, indent = '') {
  const start = text.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} must exist`)
  const end = text.indexOf(`\n${indent}}`, start)
  assert.ok(end > start, `${name} must have a closing brace`)
  return text.slice(start, end + indent.length + 2)
}

function createNode(t, data = {}, configuredPresets = presets) {
  const props = reactive({ id: 'text-node', data: { ...data } })
  const patches = []
  const nodes = ref([{ id: props.id, type: 'text-input', data: props.data }])
  const state = {
    props, nodes, watch,
    edges: ref([]),
    selectedPreset: ref(props.data.selectedPreset || ''),
    tempCustomPrompt: ref(props.data.tempCustomPrompt || ''),
    availablePresets: ref(presets),
    llmConfig: ref({ presets: configuredPresets }),
    showPresetDropdown: ref(false),
    canvasStore: { updateNodeData(id, patch) {
      assert.equal(id, props.id)
      patches.push({ ...patch })
      Object.assign(props.data, patch)
    } }
  }
  state.updateNodeData = state.canvasStore.updateNodeData
  const watcherStart = source.indexOf('watch(() => props.data.autoPreset,')
  const watcherEnd = source.indexOf('\n// 监听节点选中状态变化', watcherStart)
  assert.ok(watcherStart >= 0 && watcherEnd > watcherStart)
  const scope = effectScope()
  t.after(() => scope.stop())
  const methods = scope.run(() => runInNewContext([
    extractFunction(source, 'buildSelectedPresetDataPatch'),
    extractFunction(source, 'persistSelectedPreset'),
    extractFunction(source, 'selectPreset'),
    extractFunction(source, 'tryApplyAutoPreset'),
    extractFunction(storeSource, 'propagateData', '  '),
    source.slice(watcherStart, watcherEnd),
    ';({ select: selectPreset, propagate: propagateData })'
  ].join('\n'), state))
  return {
    ...state, ...methods, patches,
    async connect(type, data = {}) {
      nodes.value = [nodes.value[0], { id: 'upstream', type, data }]
      methods.propagate('upstream', props.id)
      await nextTick()
    }
  }
}

function selectionData(data) {
  return Object.fromEntries([
    'selectedPreset', 'selectedPresetPrompt', 'selectedPresetName',
    'selectedPresetType', 'tempCustomPrompt'
  ].map(key => [key, data[key]]))
}

for (const presetId of ['image-description', 'video-describe', 'user-7', 'temp-custom', '']) {
  test(`manual preset ${presetId || 'general chat'} survives image/video connections and reload`, async t => {
    const node = createNode(t, { tempCustomPrompt: 'Temporary prompt' })
    node.select(presetId)
    const expected = selectionData(node.props.data)

    for (const [type, mediaData] of [
      ['video', { sourceVideo: '/video.mp4' }],
      ['image', { sourceImages: ['/image.png'] }],
      ['video-input', { output: { type: 'video', url: '/generated.mp4' } }],
      ['image-gen', { output: { type: 'image', urls: ['/generated.png'] } }],
      ['text-input', { text: 'Upstream text' }]
    ]) {
      await node.connect(type, mediaData)
      assert.deepEqual(selectionData(node.props.data), expected, `${type} must preserve the manual preset`)
      assert.equal(node.selectedPreset.value, presetId)
    }
    assert.equal(node.props.data.autoPreset, null, 'the automatic switch must be consumed')
    const restored = createNode(t, JSON.parse(JSON.stringify(node.props.data)))
    await restored.connect('image-input', { sourceImages: ['/replacement.png'] })
    assert.deepEqual(selectionData(restored.props.data), expected)
    assert.equal(restored.selectedPreset.value, presetId)
  })
}

test('saved preset remains selected when config arrives after an image connection', async t => {
  const node = createNode(t, {
    selectedPreset: 'image-description',
    selectedPresetPrompt: 'Saved prompt',
    selectedPresetName: '图像描述',
    selectedPresetType: 'snapshot'
  }, [])
  const expected = selectionData(node.props.data)
  await node.connect('image-input', { sourceImages: ['/image.png'] })
  node.llmConfig.value.presets = presets
  await nextTick()
  assert.deepEqual(selectionData(node.props.data), expected)
  assert.equal(node.selectedPreset.value, 'image-description')
  assert.equal(node.props.data.autoPreset, null)
})

for (const presetId of ['video-describe', '']) {
  test(`manual ${presetId || 'general chat'} cancels a pending switch before config loads`, async t => {
    const node = createNode(t, {}, [])
    await node.connect('image-input', { sourceImages: ['/image.png'] })
    assert.equal(node.props.data.autoPreset, 'image-describe')
    node.select(presetId)
    const expected = selectionData(node.props.data)
    node.llmConfig.value.presets = presets
    await nextTick()
    assert.deepEqual(selectionData(node.props.data), expected)
    assert.equal(node.selectedPreset.value, presetId)
    assert.equal(node.props.data.autoPreset, null)
  })
}

test('users can manually change a preset again after connecting media', async t => {
  const node = createNode(t)
  node.select('image-description')
  await node.connect('image', { sourceImages: ['/image.png'] })
  node.select('video-describe')
  assert.equal(node.selectedPreset.value, 'video-describe')
  assert.equal(node.props.data.selectedPreset, 'video-describe')
  assert.equal(node.props.data.selectedPresetPrompt, 'Selected video prompt')
  await node.connect('image', { sourceImages: ['/replacement.png'] })
  assert.equal(node.selectedPreset.value, 'video-describe')
})

test('an untouched new node retains its initial image quick-action default', async t => {
  const node = createNode(t)
  await node.connect('image-input', { sourceImages: ['/image.png'] })
  assert.equal(node.selectedPreset.value, 'image-describe')
  assert.equal(node.props.data.selectedPreset, 'image-describe')
  assert.equal(node.props.data.selectedPresetPrompt, 'Default image prompt')
  assert.equal(node.props.data.autoPreset, null)
})
