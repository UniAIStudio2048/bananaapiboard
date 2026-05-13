import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readNode(name) {
  return readFileSync(join(__dirname, name), 'utf8')
}

test('text and video thumbnail insertion detect active @ query and use it for replacement', () => {
  for (const [file, stateName] of [
    ['TextNode.vue', 'llmInputText'],
    ['VideoNode.vue', 'promptText']
  ]) {
    const source = readNode(file)
    assert.match(
      source,
      /getActivePromptMentionRange\(currentText,\s*start\)/,
      `${file} should detect the active @ query before thumbnail insertion`
    )
    assert.match(
      source,
      /if\s*\(activeMention\)\s*\{[\s\S]*?mentionStart:\s*activeMention\.start[\s\S]*?caret:\s*activeMention\.end/,
      `${file} should replace the active @ query range when mention is active`
    )
    assert.match(
      source,
      /}\s*else\s*\{[\s\S]*?currentText\.slice\(0,\s*start\)/,
      `${file} should do plain insertion when no active mention`
    )
  }
})
