import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./CanvasDirectoryPanel.vue', import.meta.url), 'utf8')

test('canvas directory exposes navigation and row actions', () => {
  assert.match(source, /buildCanvasDirectory/)
  assert.match(source, /'select-locate'/)
  assert.match(source, /'locate'/)
  assert.match(source, /'rename'/)
  assert.match(source, /'duplicate'/)
  assert.match(source, /'download'/)
  assert.match(source, /'move-to-group'/)
  assert.match(source, /directory-row-selected/)
  assert.match(source, /aria-label=/)
  assert.match(source, /@keydown\.escape=/)
})

test('canvas directory supports folders and validated node drag targets', () => {
  assert.match(source, /isCanvasDirectoryMoveAllowed/)
  assert.match(source, /draggable="true"/)
  assert.match(source, /@keydown\.right\.prevent=/)
  assert.match(source, /@keydown\.left\.prevent=/)
  assert.match(source, /@dragstart=/)
  assert.match(source, /@drop(?:\.[\w.-]+)?=/)
  assert.match(source, /aria-expanded=/)
  assert.match(source, /directory-drop-active/)
})

test('canvas directory resets transient actions when workflow changes', () => {
  assert.match(source, /watch\(\(\) => props\.workflowKey/)
  assert.match(source, /openMenuId\.value = null/)
  assert.match(source, /editingId\.value = null/)
  assert.match(source, /draggedNodeId\.value = null/)
})

test('canvas directory keeps labels inside stable action rows', () => {
  assert.match(source, /function setRenameInputRef\(element\)/)
  assert.match(source, /:ref="setRenameInputRef"/)
  assert.match(source, /min-width:\s*0/)
  assert.match(source, /text-overflow:\s*ellipsis/)
  assert.match(source, /grid-template-columns:/)
  assert.match(source, /@media\s*\(max-width:\s*640px\)[\s\S]*?min-height:\s*44px/)
  assert.match(source, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.directory-icon-button[\s\S]*?width:\s*32px/)
})

test('canvas directory exposes light theme rules outside scoped styles', () => {
  assert.doesNotMatch(source, /:global\(:root\.canvas-theme-light\)/)
  assert.match(source, /<style>\s*:root\.canvas-theme-light[\s\S]*?<\/style>/)
  assert.match(source, /:root\.canvas-theme-light \.directory-row\s*\{[\s\S]*?color:\s*#465267/)
})
