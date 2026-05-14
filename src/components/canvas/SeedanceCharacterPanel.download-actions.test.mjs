import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./SeedanceCharacterPanel.vue', import.meta.url), 'utf8')

test('Seedance character assets expose image download from the context menu', () => {
  assert.match(source, /import\s+\{\s*smartDownload\s*\}\s+from\s+['"]@\/api\/client['"]/)
  assert.match(source, /async function handleDownloadAsset\(/)
  assert.match(source, /@click="handleDownloadAsset\(contextMenuAsset\)"/)
  assert.match(source, />\s*下载图片\s*</)
})
