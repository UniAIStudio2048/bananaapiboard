import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readNode(name) {
  return readFileSync(join(__dirname, name), 'utf8')
}

test('text and video thumbnail insertion replace an active @ query instead of appending @@', () => {
  for (const [file, stateName] of [
    ['TextNode.vue', 'llmInputText'],
    ['VideoNode.vue', 'promptText']
  ]) {
    const source = readNode(file)
    assert.match(
      source,
      new RegExp(`getActivePromptMentionRange\\(${stateName}\\.value,\\s*start\\)`),
      `${file} should detect the active @ query before thumbnail insertion`
    )
    assert.match(
      source,
      /const\s+replaceStart\s*=\s*activeMention\?\.start\s*\?\?\s*start[\s\S]*const\s+replaceEnd\s*=\s*activeMention\?\.end\s*\?\?\s*end/,
      `${file} should replace the active @ query range`
    )
  }
})
