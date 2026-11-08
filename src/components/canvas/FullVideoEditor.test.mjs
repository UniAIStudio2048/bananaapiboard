import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'
import { webcrypto } from 'node:crypto'
import { createVideoEditDraftWriter } from '../../utils/videoEditDraftWriter.js'
import { bindAccountEditorStorage, editorStorage } from './editor/storage.js'

const file = readFileSync(new URL('./FullVideoEditor.vue', import.meta.url), 'utf8')
const script = file.match(/<script setup>([\s\S]*?)<\/script>/)[1]
const body = parse(script, { sourceType: 'module' }).program.body.filter(node => node.type !== 'ImportDeclaration').map(node => script.slice(node.start, node.end)).join('\n').replace("import('./editor/mount')", 'mountModule()')
function fixture(props = {}) {
  let mounted, unmount, current = { id: 'tab-a', workflowId: 'wf-a', savedNodeVersions: { source: 3, other: 2 } }, resolveUpload
  const calls = { bind: 0, saved: 0, added: [], preferences: [], closed: 0 }
  const store = {
    getCurrentTab: () => current, nodes: [{ id: 'source', position: { x: 0, y: 0 } }],
    addNode(node) { calls.added.push(node) },
    applyWorkflowSaveVersions(workflow) { current.savedNodeVersions = { ...workflow.node_versions } }
  }
  const state = runInNewContext(`${body}\n;({ status, error, createResult, close, retrySave, setActiveTab: value => { activeTab = value } })`, {
    ref: value => ({ value }), onMounted: callback => { mounted = callback }, onBeforeUnmount: callback => { unmount = callback },
    defineProps: () => ({ nodeId: 'source', initialSource: { url: '/video.mp4' }, loadDraft: async () => null, saveDraft: async () => {}, ...props }), defineEmits: () => () => { calls.closed++ },
    useCanvasStore: () => store, createVideoEditDraftWriter,
    bindAccountEditorStorage: (...args) => { calls.bind++; return bindAccountEditorStorage(...args) },
    createBananaEditorApi: () => ({ preferences: async () => ({ namespace: 'a'.repeat(64), values: {} }), config: async () => ({}), async savePreferences(values) { if (calls.failPreferences) throw new Error('preferences unavailable'); calls.preferences.push(values) } }),
    createBananaEditorLibrary: () => ({}), getMediaUrl: value => value,
    mountModule: async () => ({ mountVideoEditor(_host, options) { calls.options = options; return () => {} } }), TextEncoder,
    uploadCanvasMedia: () => new Promise(resolve => { resolveUpload = resolve }), postWorkflowOps: async () => { calls.saved++ },
    crypto: { randomUUID: () => 'result-id', subtle: webcrypto.subtle }, window: { dispatchEvent() {} }, CustomEvent: class {}
  })
  return { state, calls, get tab() { return current }, activate() { state.setActiveTab({ ...current }) }, mount: () => mounted(), unmount: () => unmount(), switchTab() { current = { id: 'tab-b', workflowId: 'wf-b' } }, finishUpload() { resolveUpload({ url: '/export.mp4' }) } }
}

test('加载草稿时关闭编辑器，不在卸载后绑定存储或更新错误状态', async () => {
  let resolveDraft
  const h = fixture({ loadDraft: () => new Promise(resolve => { resolveDraft = resolve }) })
  const pending = h.mount()
  h.unmount(); resolveDraft(null); await pending
  assert.equal(h.calls.bind, 0)
  assert.equal(h.state.error.value, '')
})

test('桥接使用认证账号共享预设及剪贴板，偏好保存失败时保留编辑器并允许重试', async () => {
  const h = fixture()
  await h.mount()
  assert.equal(h.calls.options.clipboardNamespace, 'a'.repeat(64))
  assert.equal(h.calls.options.preferenceNamespace, `media-canvas-preferences:v1:${'a'.repeat(64)}`)
  h.calls.failPreferences = true
  editorStorage.setItem(`media-video-timeline-preferences:v1:${h.calls.options.preferenceNamespace}`, '3')
  await h.state.close()
  assert.equal(h.calls.closed, 0)
  assert.match(h.state.error.value, /preferences unavailable/)
  h.calls.failPreferences = false
  await h.state.retrySave(); await h.state.close()
  assert.deepEqual(h.calls.preferences, [{ timeline: '3' }])
  assert.equal(h.calls.closed, 1)
  h.unmount()
})

test('升级账号命名空间时保留旧节点草稿和未完成字幕任务，旧片段格式也使用编辑器实际读取的键', async () => {
  const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode('wf-a:source'))).toString('hex')
  const oldKey = `media-video-draft:wf-a:/video.mp4:identity:${hash}`
  const key = `media-video-draft:wf-a:/video.mp4:identity:${'a'.repeat(64)}`
  const draft = JSON.stringify({ clips: [{ resource_uuid: '/video.mp4', start: 2, end: 3, rate: 1, volume_db: 0 }], exportTitle: '旧剪辑' })
  const oldPresetKey = `media-video-text-presets:v1:media-canvas-preferences:v1:${hash}`
  const saved = []
  const h = fixture({ loadDraft: async () => ({ editorStorage: { [oldKey]: draft, [oldKey + ':subtitle']: 'pending-job', [oldPresetKey]: '[]' } }), saveDraft: async value => saved.push(value) })
  await h.mount(); await editorStorage.flush()
  assert.equal(editorStorage.getItem(key), draft)
  assert.equal(editorStorage.getItem(key + ':subtitle'), 'pending-job')
  assert.equal(editorStorage.getItem(oldKey), null)
  assert.equal(saved.at(-1).editorStorage[key], draft)
  assert.equal(saved.at(-1).editorStorage[oldPresetKey], undefined)
  h.unmount()
  const legacy = fixture({ loadDraft: async () => ({ clips: [{ url: '/video.mp4', startTime: 2, endTime: 3, playbackRate: 1, volumeDb: 0 }] }) })
  await legacy.mount()
  assert.equal(JSON.parse(editorStorage.getItem(key)).clips[0].start, 2)
  legacy.unmount()
})

test('加载期间切换画布会中止挂载，不绑定到切换后的画布', async () => {
  let resolveDraft
  const h = fixture({ loadDraft: () => new Promise(resolve => { resolveDraft = resolve }) })
  const pending = h.mount()
  h.switchTab(); resolveDraft(null); await pending
  assert.match(h.state.error.value, /画布已切换/)
  assert.equal(h.calls.bind, 0)
})

test('导出结果写入画布后同步新增节点版本，后续整张画布保存不冲突', async () => {
  const h = fixture()
  h.activate()
  const pending = h.state.createResult({ file: {}, modality: 'video', name: '剪辑结果', offset: { y: 0 } })
  h.finishUpload(); await pending
  assert.equal(h.calls.saved, 1)
  assert.equal(h.calls.added.length, 1)
  assert.deepEqual(h.tab.savedNodeVersions, { source: 3, other: 2, 'video_edit_result-id': 1 })
})

for (const action of ['switchTab', 'unmount']) {
  test(`结果上传期间${action}，不向新的画布写入节点`, async () => {
    const h = fixture()
    h.activate()
    const pending = h.state.createResult({ file: {}, modality: 'video', name: '剪辑结果', offset: { y: 0 } })
    h[action](); h.finishUpload()
    await assert.rejects(pending, /画布已切换/)
    assert.equal(h.calls.saved, 0)
    assert.equal(h.calls.added.length, 0)
  })
}
