import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

test('web search defaults to enabled when tenant config enables it', () => {
  assert.match(source, /if \(config\.value\.web_search\?\.enabled\) \{\n\s+webSearchEnabled\.value = true\n\s+\}/)
})

test('selecting a mode with web_search tool turns on web search', () => {
  assert.match(source, /if \(mode\.tools\?\.includes\('web_search'\)\) \{\n\s+webSearchEnabled\.value = true\n\s+\}/)
})
