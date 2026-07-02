import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./CanvasContextMenu.vue', import.meta.url), 'utf8')

test('system clipboard menu only advertises Ctrl+V when node clipboard is empty', () => {
  assert.match(
    source,
    /<span class="shortcut">\{\{ hasClipboard \? '' : 'Ctrl\+V' \}\}<\/span>/,
    'system clipboard paste should not claim Ctrl+V when copied canvas nodes will be pasted'
  )
})
