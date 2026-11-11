import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_MEDIA_NODE_SIZE, withDefaultNodeSize } from './canvasNodeDefaultSize.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MEDIA_TYPES = ['text-input', 'text', 'image-input', 'image', 'video-input', 'video', 'audio-input', 'audio']

test('new text, image, video and audio nodes default to the same 4:3 size', () => {
  assert.equal(DEFAULT_MEDIA_NODE_SIZE.width * 3, DEFAULT_MEDIA_NODE_SIZE.height * 4)
  for (const type of MEDIA_TYPES) {
    const data = withDefaultNodeSize(type, { title: 'x' })
    assert.equal(data.width, DEFAULT_MEDIA_NODE_SIZE.width, type)
    assert.equal(data.height, DEFAULT_MEDIA_NODE_SIZE.height, type)
    assert.equal(data.title, 'x')
  }
})

test('explicit sizes are kept, and a single given side keeps 4:3', () => {
  assert.deepEqual(withDefaultNodeSize('image', { width: 300, height: 520 }), { width: 300, height: 520 })
  assert.deepEqual(withDefaultNodeSize('video', { width: 480 }), { width: 480, height: 360 })
  assert.deepEqual(withDefaultNodeSize('text-input', { height: 240 }), { width: 320, height: 240 })
})

test('other node types are left untouched', () => {
  const data = { title: 'g' }
  for (const type of ['group', 'storyboard', 'llm', 'video-breakdown', 'director-studio']) {
    assert.equal(withDefaultNodeSize(type, data), data, type)
  }
  assert.deepEqual(withDefaultNodeSize('image', undefined), { width: 400, height: 300 })
})

test('store addNode applies the default size to new nodes', () => {
  const store = readFileSync(join(__dirname, '../stores/canvas/canvasStore.js'), 'utf8')
  assert.match(store, /import \{ withDefaultNodeSize \} from '@\/utils\/canvasNodeDefaultSize'/)
  const addNode = store.match(/function addNode\(node, skipHistory = false\) \{[\s\S]*?const newNode = \{/)
  assert.ok(addNode)
  assert.match(addNode[0], /\.\.\.withDefaultNodeSize\(node\.type, node\.data\)/)
})
