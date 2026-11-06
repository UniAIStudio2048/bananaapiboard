import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { parse } from '@babel/parser'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8').match(/<script setup>([\s\S]*?)<\/script>/)[1]
const ast = parse(source, { sourceType: 'module' })

function getFunction(name, context) {
  const declaration = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === name)
  assert.ok(declaration, `${name} should exist`)
  return runInNewContext(`${source.slice(declaration.start, declaration.end)}\n;${name}`, context)
}

test('frame crop persists a connected result node and updates it with the exported video', async () => {
  const calls = []
  const sourceNode = { id: 'source', position: { x: 10, y: 20 }, data: { width: 420 } }
  const context = {
    props: { id: 'source', data: { output: { url: 'https://cdn.example.com/source.mp4' } } },
    frameCropSelection: { value: { x: 10, y: 8, width: 80, height: 50 } },
    frameCropSubmitting: { value: false }, showFrameCrop: { value: true },
    canvasStore: { nodes: [sourceNode], getCurrentTab: () => ({ id: 'tab', workflowId: 'workflow' }), addNode: value => calls.push(['node', value]), addEdge: value => calls.push(['edge', value]), updateNodeData: (id, data) => calls.push(['update', id, data]) },
    getWorkflowNodesBatch: async () => ({ nodes: [{ id: 'source' }] }),
    postWorkflowOps: async (id, ops) => calls.push(['ops', id, ops]),
    patchWorkflowNode: async (id, node, patch) => calls.push(['patch', id, node, patch]),
    cropVideoFrame: async input => { calls.push(['crop', input]); return { url: 'https://cdn.example.com/result.mp4', width: 80, height: 50, duration: 3 } },
    globalThis: { crypto: { randomUUID: () => 'uuid' } },
    window: { dispatchEvent() {} }, CustomEvent: class {}, showToast: message => { throw new Error(message) }
  }
  context.closeFrameCrop = () => { context.showFrameCrop.value = false }
  await getFunction('confirmFrameCrop', context)()
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find(call => call[0] === 'crop')[1])), { videoUrl: 'https://cdn.example.com/source.mp4', crop: { x: 10, y: 8, width: 80, height: 50 } })
  const ops = calls.find(call => call[0] === 'ops')[2]
  assert.equal(ops.length, 2)
  assert.equal(ops[1].payload.source, 'source')
  assert.equal(calls.find(call => call[0] === 'patch')[3].data.output.url, 'https://cdn.example.com/result.mp4')
  assert.equal(context.showFrameCrop.value, false)
  assert.equal(context.frameCropSubmitting.value, false)
})

test('frame crop saves a source node missing from the stored workflow before connecting the result', async () => {
  const calls = []
  const context = {
    props: { id: 'source', data: { output: { url: 'https://cdn.example.com/source.mp4' } } },
    frameCropSelection: { value: { x: 0, y: 0, width: 20, height: 20 } },
    frameCropSubmitting: { value: false }, showFrameCrop: { value: true },
    canvasStore: { nodes: [{ id: 'source', position: { x: 0, y: 0 }, data: {} }], getCurrentTab: () => ({ id: 'tab', workflowId: 'workflow' }), addNode() {}, addEdge() {}, updateNodeData() {} },
    getWorkflowNodesBatch: async () => ({ nodes: [] }),
    ensureCanvasWorkflowForVideoSubmission: async () => { calls.push('save-source'); return { workflowId: 'workflow' } },
    postWorkflowOps: async () => calls.push('add-result'), patchWorkflowNode: async () => {},
    cropVideoFrame: async () => ({ url: 'https://cdn.example.com/result.mp4' }),
    globalThis: { crypto: { randomUUID: () => 'uuid' } }, window: { dispatchEvent() {} }, CustomEvent: class {}, showToast: message => { throw new Error(message) }
  }
  context.closeFrameCrop = () => { context.showFrameCrop.value = false }
  await getFunction('confirmFrameCrop', context)()
  assert.deepEqual(calls, ['save-source', 'add-result'])
})

test('exiting frame crop stops the preview and closes the selection', () => {
  let paused = 0
  const context = { showFrameCrop: { value: true }, isVideoPreviewActive: { value: true }, videoPlayerRef: { value: { pause() { paused++ } } } }
  getFunction('closeFrameCrop', context)()
  assert.equal(paused, 1)
  assert.equal(context.showFrameCrop.value, false)
  assert.equal(context.isVideoPreviewActive.value, false)
})
