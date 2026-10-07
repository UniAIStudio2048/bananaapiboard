import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ref } from 'vue'
import { buildNodeDataWithRememberedParameters } from '../../stores/canvas/nodeParameterMemory.js'

const board = readFileSync(new URL('./CanvasBoard.vue', import.meta.url), 'utf8')
const view = readFileSync(new URL('../../views/Canvas.vue', import.meta.url), 'utf8')

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`))
  assert.ok(start >= 0, `${name} must exist`)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

function createCanvas() {
  const nodes = [{ type: 'video', data: { aspectRatio: '16:9', model: 'remembered-model' } }]
  const created = []
  const state = {
    console: { log() {}, error(error) { throw error } },
    URL: { createObjectURL: () => 'blob:imported-video' },
    isFileDragOver: ref(false), fileDragCounter: ref(0),
    canvasBoardRef: ref({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    screenToFlowPosition: point => point,
    window: { innerWidth: 1200, innerHeight: 900 }, t: key => key,
    uploadFilesToCloud() {},
    canvasStore: {
      viewport: { x: 0, y: 0, zoom: 1 },
      addNode(node) {
        node.data = buildNodeDataWithRememberedParameters({ type: node.type, baseData: node.data, nodes })
        created.push(node)
        return node
      }
    }
  }
  const methods = runInNewContext([
    ...['getFileCategory', 'handleFileDrop', 'handleClipboardFiles'].map(name => extractFunction(board, name)),
    ...['handleAssetInsert', 'handleHistoryApply'].map(name => extractFunction(view, name)),
    '({ drop: handleFileDrop, paste: handleClipboardFiles, asset: handleAssetInsert, history: handleHistoryApply })'
  ].join('\n'), state)
  return { ...methods, created }
}

for (const [name, json] of [
  ['local file', null],
  ['asset', { type: 'asset-insert', asset: { type: 'video', url: 'https://example.test/portrait.mp4' } }],
  ['AI attachment', { type: 'ai-chat-attachment', attachment: { type: 'video', url: 'https://example.test/portrait.mp4' } }]
]) {
  test(`dropping a ${name} video detects its ratio even when a previous node remembers 16:9`, async () => {
    const canvas = createCanvas()
    await canvas.drop({
      preventDefault() {}, stopPropagation() {}, clientX: 100, clientY: 100,
      dataTransfer: { getData: () => json ? JSON.stringify(json) : '', files: [{ type: 'video/mp4', name: 'portrait.mp4' }] }
    })
    assert.equal(canvas.created.length, 1)
    assert.equal(canvas.created[0].data.detectAspectRatio, true)
    assert.equal(canvas.created[0].data.model, 'remembered-model')
  })
}

for (const mode of ['paste', 'asset', 'history']) {
  test(`${mode} video insertion also initializes ratio from the media`, () => {
    const canvas = createCanvas()
    if (mode === 'paste') canvas.paste([{ type: 'video/mp4', name: 'portrait.mp4' }], { x: 100, y: 100 })
    else canvas[mode]({ type: 'video', url: 'https://example.test/portrait.mp4' })
    assert.equal(canvas.created.length, 1)
    assert.equal(canvas.created[0].data.detectAspectRatio, true)
  })
}
