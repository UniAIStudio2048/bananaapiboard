import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SeedanceCharacterNode.vue', import.meta.url), 'utf8')

test('Seedance character canvas node shows download and preview top actions and keeps connection add button', () => {
  assert.match(source, /import\s+\{\s*smartDownload\s*\}\s+from\s+['"]@\/api\/client['"]/)
  assert.match(source, /function handlePreviewCharacter\(/)
  assert.match(source, /async function handleDownloadCharacter\(/)
  assert.match(source, /class="character-toolbar"/)
  assert.match(source, /title="下载"/)
  assert.match(source, /title="放大预览"/)
  assert.match(source, /class="node-add-btn node-add-btn-right nodrag"/)

  const toolbarMatch = source.match(/<div v-if="data\.assetUrl" class="character-toolbar">([\s\S]*?)<\/div>\n\s*<div class="character-preview">/)
  assert.ok(toolbarMatch, 'character toolbar template should be present')
  const toolbarButtonCount = (toolbarMatch[1].match(/class="character-toolbar-btn"/g) || []).length
  assert.equal(toolbarButtonCount, 2)
})
