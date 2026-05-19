import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readComponent() {
  return readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')
}

function cssBlock(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `Expected ${selector} block to exist`)
  return match[1]
}

test('assistant input area lets toolbar dropdowns overflow without changing text scrolling', () => {
  const source = readComponent()
  const inputArea = cssBlock(source, '.input-area')
  const inputTextarea = cssBlock(source, '.input-textarea')

  assert.match(inputArea, /overflow:\s*visible;/)
  assert.match(inputTextarea, /max-height:\s*120px;/)
  assert.match(inputTextarea, /overflow-y:\s*auto;/)
})
