import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'

const fullSource = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const source = fullSource.match(/<script setup>([\s\S]*?)<\/script>/)[1]
const ast = parse(source, { sourceType: 'module' })
function getFunction(name, context) {
  const declaration = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  assert.ok(declaration, `${name} should exist`)
  return runInNewContext(`${source.slice(declaration.start, declaration.end)}\n;${name}`, context)
}
function createContext() {
  const calls = []
  const tab = { id: 'tab-1', workflowId: 'workflow-1', savedNodeVersions: { 'video-1': 3 } }
  const props = { id: 'video-1', data: { output: { type: 'video', url: 'https://cdn.test/old.mp4' }, status: 'success' } }
  const canvasStore = {
    nodes: [{ id: props.id, data: props.data }],
    edges: [{ source: 'video-1', target: 'preview-1', targetHandle: 'input' }],
    getCurrentTab: () => tab,
    updateNodeData(id, data) { calls.push(['update', id, data]); Object.assign(props.data, data) },
    commitMediaUpload(value) { calls.push(['sync-media', value]) },
    propagateData(...args) { calls.push(['propagate', ...args]) },
    applyWorkflowSaveVersions(value) { calls.push(['version', value]) }
  }
  const context = {
    props, canvasStore, videoReplacementBusy: { value: false }, showVideoReplacementPicker: { value: true },
    isGenerating: { value: false },
    uploadCanvasMedia: async file => { calls.push(['upload', file.name]); return { url: 'https://cdn.test/new-upload.mp4', assetId: 'uploaded' } },
    ensureCanvasWorkflowForVideoSubmission: async () => { calls.push(['save']); return { workflowId: 'workflow-1' } },
    getWorkflowNodesBatch: async () => ({ nodes: [{ id: 'video-1', version: 3, data: { output: { url: 'https://cdn.test/old.mp4' } } }] }),
    patchWorkflowNode: async (...args) => { calls.push(['patch', ...args]); return { version: 4 } },
    showToast: (...args) => calls.push(['toast', ...args])
  }
  return { context, calls, tab, props }
}

test('单个替换按钮打开菜单并保留本地上传及素材选择入口', () => {
  assert.match(fullSource, /aria-label="替换素材"/)
  assert.match(fullSource, /本地上传/)
  assert.match(fullSource, /选择素材/)
  assert.doesNotMatch(fullSource, /@click\.stop="handleRegenerate" title="重新生成"/)
  assert.match(fullSource, /<VideoReplacementPicker/)
})

test('历史视频替换先保存数据库，再更新节点且清理旧视频元数据', async () => {
  const { context, calls } = createContext()
  await getFunction('replaceVideoOutput', context)({ source: 'history', id: 'h1', url: 'https://cdn.test/history.mp4', thumbnail_url: 'https://cdn.test/new.jpg', duration: 8 })
  const patch = calls.find(call => call[0] === 'patch')
  assert.equal(patch[1], 'workflow-1')
  assert.equal(patch[2], 'video-1')
  assert.equal(patch[4], 3)
  const data = patch[3].data
  assert.equal(data.output.url, 'https://cdn.test/history.mp4')
  assert.equal(data.output.thumbnailUrl, 'https://cdn.test/new.jpg')
  assert.equal(data.sourceVideo, data.output.url)
  assert.equal(data.historyId, 'h1')
  assert.equal(data.taskId, null)
  assert.equal(data.seedanceQuickAsset, null)
  assert.equal(data.videoEditDraft, null)
  assert.equal(data.isCharacterNode, false)
  assert.ok(calls.findIndex(call => call[0] === 'patch') < calls.findIndex(call => call[0] === 'update'))
  assert.equal(calls.find(call => call[0] === 'sync-media')[1].blobUrl, 'https://cdn.test/old.mp4')
  assert.equal(calls.find(call => call[0] === 'sync-media')[1].uploaded.url, data.output.url)
  assert.deepEqual(calls.find(call => call[0] === 'propagate').slice(1), ['video-1', 'preview-1', 'input'])
  assert.ok(calls.findIndex(call => call[0] === 'update') < calls.findIndex(call => call[0] === 'propagate'))
  assert.equal(context.videoReplacementBusy.value, false)
  assert.equal(context.showVideoReplacementPicker.value, false)
})

test('保存期间切换画布且原节点已变化时不覆盖旧标签的更新', async () => {
  const { context, calls, tab } = createContext()
  tab.nodes = [{ id: 'video-1', data: { output: { url: 'https://cdn.test/other.mp4' } } }]
  context.canvasStore.updateNodeDataForTab = (...args) => calls.push(['background-update', ...args])
  context.patchWorkflowNode = async () => {
    context.canvasStore.getCurrentTab = () => ({ id: 'tab-2' })
    return { version: 4 }
  }
  await getFunction('replaceVideoOutput', context)({ source: 'history', url: 'https://cdn.test/new.mp4' })
  assert.equal(calls.some(call => call[0] === 'sync-media' || call[0] === 'background-update'), false)
})

test('保存期间切换画布时同步原标签及其连线', async () => {
  const { context, calls, tab, props } = createContext()
  tab.nodes = [{ id: props.id, data: { output: { url: props.data.output.url } } }]
  context.canvasStore.updateNodeDataForTab = (...args) => calls.push(['background-update', ...args])
  context.patchWorkflowNode = async () => {
    context.canvasStore.getCurrentTab = () => ({ id: 'tab-2' })
    return { version: 4 }
  }
  await getFunction('replaceVideoOutput', context)({ source: 'history', url: 'https://cdn.test/new.mp4' })
  assert.equal(calls.find(call => call[0] === 'sync-media')[1].tabId, 'tab-1')
  assert.equal(calls.find(call => call[0] === 'background-update')[1], 'tab-1')
})

test('本地视频先上传，再将远程地址写入工作流', async () => {
  const { context, calls } = createContext()
  await getFunction('replaceVideoOutput', context)({ source: 'local', file: { name: 'clip.mp4', type: 'video/mp4', size: 1024 } })
  assert.equal(calls[0][0], 'upload')
  const data = calls.find(call => call[0] === 'patch')[3].data
  assert.equal(data.output.url, 'https://cdn.test/new-upload.mp4')
  assert.equal(data.assetId, 'uploaded')
  assert.equal(data.fromHistory, false)
})

test('资产视频替换关联所选资产并清除旧封面', async () => {
  const { context, calls } = createContext()
  await getFunction('replaceVideoOutput', context)({ source: 'asset', id: 'asset-2', url: 'https://cdn.test/asset.mp4' })
  const data = calls.find(call => call[0] === 'patch')[3].data
  assert.equal(data.output.url, 'https://cdn.test/asset.mp4')
  assert.equal(data.assetId, 'asset-2')
  assert.equal(data.fromAsset, true)
  assert.equal(data.thumbnailUrl, null)
  assert.equal(data.cover_url, null)
})

test('切换画布或上传失败时不写入节点', async () => {
  const { context, calls } = createContext()
  context.uploadCanvasMedia = async () => { context.canvasStore.getCurrentTab = () => ({ id: 'tab-2' }); return { url: 'https://cdn.test/new.mp4' } }
  await getFunction('replaceVideoOutput', context)({ source: 'local', file: { name: 'clip.mp4', type: 'video/mp4', size: 100 } })
  assert.equal(calls.some(call => call[0] === 'patch' || call[0] === 'update'), false)
  assert.equal(context.videoReplacementBusy.value, false)
  assert.ok(calls.some(call => call[0] === 'toast'))
})

test('上传失败及服务端素材已变化时保留原视频', async () => {
  const first = createContext()
  first.context.uploadCanvasMedia = async () => { throw new Error('上传失败') }
  await getFunction('replaceVideoOutput', first.context)({ source: 'local', file: { name: 'clip.mp4', type: 'video/mp4', size: 100 } })
  assert.equal(first.calls.some(call => call[0] === 'patch' || call[0] === 'update'), false)
  const second = createContext()
  second.context.getWorkflowNodesBatch = async () => ({ nodes: [{ id: 'video-1', version: 4, data: { output: { url: 'https://cdn.test/other.mp4' } } }] })
  await getFunction('replaceVideoOutput', second.context)({ source: 'history', url: 'https://cdn.test/new.mp4' })
  assert.equal(second.calls.some(call => call[0] === 'patch' || call[0] === 'update'), false)
  assert.ok(second.calls.some(call => call[0] === 'toast' && call[1].includes('其他位置')))
})
