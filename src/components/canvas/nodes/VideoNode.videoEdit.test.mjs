import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
const declaration = parse(source, { sourceType: 'module' }).program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'saveVideoEditDraft')

test('剪辑草稿写库后同步画布保存基线，保留其他节点版本', async () => {
  const tab = { id: 'tab', workflowId: 'workflow', savedNodeVersions: { video: 2, other: 4 } }
  const calls = []
  const canvasStore = {
    getCurrentTab: () => tab,
    updateNodeData(...args) { calls.push(args) },
    applyWorkflowSaveVersions(workflow) { assert.equal(workflow.id, 'workflow'); tab.savedNodeVersions = { ...workflow.node_versions } }
  }
  const save = runInNewContext(`${source.slice(declaration.start, declaration.end)}\n;saveVideoEditDraft`, {
    canvasStore, props: { id: 'video' }, videoEditContext: { tabId: 'tab', workflowId: 'workflow', version: 2, sourceUrl: '/video.mp4' },
    videoToolInitialSource: { value: { url: '/video.mp4' } },
    patchWorkflowNode: async (workflow, id, patch, version) => {
      assert.equal(workflow, 'workflow'); assert.equal(id, 'video'); assert.equal(version, 2)
      assert.equal(patch.data.videoEditDraft.sourceUrl, '/video.mp4')
      return { version: 3 }
    }
  })
  await save({ version: 2, sourceUrl: '/video.mp4', editorStorage: {} })
  assert.deepEqual(tab.savedNodeVersions, { video: 3, other: 4 })
  assert.equal(calls.length, 1)
})
