import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'
import { createVideoEditDraftWriter } from '../../utils/videoEditDraftWriter.js'

const file = readFileSync(new URL('./FullVideoEditor.vue', import.meta.url), 'utf8')
const script = file.match(/<script setup>([\s\S]*?)<\/script>/)[1]
const body = parse(script, { sourceType: 'module' }).program.body.filter(node => node.type !== 'ImportDeclaration').map(node => script.slice(node.start, node.end)).join('\n')
function fixture(props = {}) {
  let mounted, unmount, current = { id: 'tab-a', workflowId: 'wf-a', savedNodeVersions: { source: 3, other: 2 } }, resolveUpload
  const calls = { bind: 0, saved: 0, added: [] }
  const store = {
    getCurrentTab: () => current, nodes: [{ id: 'source', position: { x: 0, y: 0 } }],
    addNode(node) { calls.added.push(node) },
    applyWorkflowSaveVersions(workflow) { current.savedNodeVersions = { ...workflow.node_versions } }
  }
  const state = runInNewContext(`${body}\n;({ status, error, createResult, setActiveTab: value => { activeTab = value } })`, {
    ref: value => ({ value }), onMounted: callback => { mounted = callback }, onBeforeUnmount: callback => { unmount = callback },
    defineProps: () => ({ nodeId: 'source', initialSource: { url: '/video.mp4' }, saveDraft: async () => {}, ...props }), defineEmits: () => () => {},
    useCanvasStore: () => store, createVideoEditDraftWriter,
    bindEditorStorage: () => { calls.bind++; return () => {} },
    uploadCanvasMedia: () => new Promise(resolve => { resolveUpload = resolve }), postWorkflowOps: async () => { calls.saved++ },
    crypto: { randomUUID: () => 'result-id' }, window: { dispatchEvent() {} }, CustomEvent: class {}
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
