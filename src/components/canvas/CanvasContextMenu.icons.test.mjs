import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./CanvasContextMenu.vue', import.meta.url), 'utf8')
const template = source.slice(source.indexOf('<template>'), source.indexOf('<style scoped>'))

test('canvas context menu uses a consistent icon set instead of colored emoji', () => {
  assert.doesNotMatch(template, /\p{Extended_Pictographic}/u)
  assert.match(source, /from ['"]@lucide\/vue['"]/, 'menu icons should use the shared icon library')
  const icons = [...template.matchAll(/class="icon"/g)]
  assert.ok(icons.length >= 14, 'upload, edit and selection actions should each retain an icon')
})
