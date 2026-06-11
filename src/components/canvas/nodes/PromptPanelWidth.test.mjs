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

test('ordinary image, text, and video prompt panels cap width at 1.5x before wrapping text', () => {
  for (const [file, panelSelector, inputSelector] of [
    ['ImageNode.vue', '.config-panel', '.prompt-input'],
    ['VideoNode.vue', '.config-panel', '.prompt-input'],
    ['TextNode.vue', '.llm-config-panel', '.llm-input']
  ]) {
    const source = readNode(file)
    const panel = cssBlock(source, panelSelector)
    const input = cssBlock(source, inputSelector)

    assert.match(
      panel,
      /width:\s*min\(max\(100%,\s*780px\),\s*90vw\);/,
      `${file} ordinary prompt panel should stop growing after the 1.5x width`
    )
    assert.match(panel, /min-width:\s*0;/, `${file} ordinary prompt panel should not keep the old 520px min-width rule`)
    assert.doesNotMatch(panel, /width:\s*max-content;/, `${file} ordinary prompt panel should not size to long prompt content`)
    assert.doesNotMatch(panel, /min-width:\s*max\(100%,\s*520px\);/, `${file} ordinary prompt panel should not use the old width`)
    assert.match(input, /white-space:\s*pre-wrap;/, `${file} prompt text should preserve line breaks while wrapping`)
    assert.match(input, /overflow-wrap:\s*break-word;/, `${file} prompt text should wrap long words inside the panel`)
    assert.match(input, /word-break:\s*break-word;/, `${file} prompt text should wrap long CJK or unspaced text`)
  }
})
