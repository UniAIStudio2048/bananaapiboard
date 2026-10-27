import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./CanvasBoard.vue', import.meta.url), 'utf8')

test('画布 paste 事件支持系统纯文本并创建文本输入节点', () => {
  assert.match(source, /getClipboardText,\s*\n\s*isScreenPointInsideRect/)
  assert.match(source, /pasteSource === 'system-text'/)
  assert.match(source, /handleClipboardText\(getClipboardText\(clipboardData\)\)/)
  assert.match(source, /function handleClipboardText\(text, positionOverride\)/)
  assert.match(source, /canvasStore\.addNode\(\{\s*\n\s*type: 'text-input'/)
})

test('画布 paste 仍在输入控件内保留浏览器原生行为', () => {
  assert.match(source, /if \(isTextInputEventTarget\(target\)\) \{\s*\n\s*return\s*\n\s*\}/)
})
