import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const selector = readFileSync(new URL('./NodeSelector.vue', import.meta.url), 'utf8')
const contextMenu = readFileSync(new URL('./CanvasContextMenu.vue', import.meta.url), 'utf8')
const css = readFileSync(new URL('../../styles/canvas.css', import.meta.url), 'utf8')

test('node selector and context menu use the same image, video and audio icons', () => {
  for (const [name, component] of [['image', 'Image'], ['video', 'Film'], ['audio', 'AudioLines']]) {
    assert.match(selector, new RegExp(`\\b${name}:\\s*${component}\\b`))
    assert.match(contextMenu, new RegExp(`<${component}\\s+class="icon"`))
  }
  assert.match(selector, /from ['"]@lucide\/vue['"]/, 'node icons should use the same library as the context menu')
  assert.doesNotMatch(selector.slice(selector.indexOf('<template>'), selector.indexOf('<style scoped>')), /<div class="node-selector-icon">[↑⊞]<\/div>/)
})

test('node selector uses a neutral menu treatment instead of blue selected icons', () => {
  const selectorStyles = css.slice(css.indexOf('.node-selector {'), css.indexOf('/* ========================================', css.indexOf('.node-selector {')))
  assert.doesNotMatch(selectorStyles, /rgba\(59,\s*130,\s*246/)
  assert.match(selectorStyles, /\.node-selector-icon\s*\{[^}]*width:\s*16px/)
  assert.match(selectorStyles, /\.node-selector\s*\{[^}]*background:\s*#1b1b1b/)
})
