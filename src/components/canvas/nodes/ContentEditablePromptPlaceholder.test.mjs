import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readNode(name) {
  return readFileSync(join(__dirname, name), 'utf8')
}

function cssBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Expected ${selector} block to exist`)
  return match[1]
}

test('contenteditable prompt placeholders are overlays so the caret starts in the editable text area', () => {
  for (const [file, inputSelector, placeholderSelector] of [
    ['ImageNode.vue', '.prompt-input', '.prompt-input.is-empty::before'],
    ['VideoNode.vue', '.prompt-input', '.prompt-input.is-empty::before'],
    ['TextNode.vue', '.editor-content', '.editor-content:empty:before'],
    ['TextNode.vue', '.llm-input', '.llm-input.is-empty::before'],
    ['AudioNode.vue', '.prompt-textarea', '.prompt-textarea.is-empty::before']
  ]) {
    const source = readNode(file)
    const input = cssBlock(source, inputSelector)
    const placeholder = cssBlock(source, placeholderSelector)

    assert.match(input, /position:\s*relative;/, `${file} editor should position its placeholder overlay`)
    assert.match(placeholder, /position:\s*absolute;/, `${file} placeholder should not participate in text layout`)
    assert.match(placeholder, /pointer-events:\s*none;/, `${file} placeholder should not intercept clicks`)
  }
})
