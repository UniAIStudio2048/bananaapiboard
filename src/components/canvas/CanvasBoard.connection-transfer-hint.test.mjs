import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

test('node connection buttons show transfer shortcuts after a one-second hover delay', () => {
  assert.match(source, /\.canvas-board :deep\(\.vue-flow__node:hover \.node-add-btn\)::after/)
  assert.match(source, /transition-delay:\s*1s/)
  assert.match(source, /Shift \+ 左键拖动：迁移全部连线/)
  assert.match(source, /Ctrl \+ 左键拖动：复制全部连线/)
})

test('transfer hint does not intercept pointer events', () => {
  const hintRule = source.match(/\.canvas-board :deep\(\.vue-flow__node \.node-add-btn\)::after\s*\{([\s\S]*?)\n\s*\}/)
  assert.ok(hintRule, 'connection transfer hint rule should exist')
  assert.match(hintRule[1], /pointer-events:\s*none/)
})
