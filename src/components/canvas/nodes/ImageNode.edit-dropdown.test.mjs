import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')

assert.match(source, /const showImageEditMenu = ref\(false\)/, 'ImageNode should track the edit dropdown menu')
assert.match(source, /function handleToolbarEditMenuClick\(\)/, 'ImageNode should toggle edit menu from the top-level edit button')
assert.match(source, /class="image-edit-dropdown"/, 'ImageNode should render an edit dropdown')

const toolbarMatch = source.match(/<!-- 图片工具栏[\s\S]*?<!-- 宫格裁剪菜单：第一步选择宫格大小 -->/)
assert.ok(toolbarMatch, 'ImageNode toolbar block should exist')
const toolbar = toolbarMatch[0]

for (const title of ['重绘', '擦除', '抠图', '扩图']) {
  assert.doesNotMatch(toolbar, new RegExp(`class="toolbar-btn"[^>]*title="${title}"`), `${title} should not be a top-level toolbar button`)
}

const dropdownStart = source.indexOf('<div v-if="showImageEditMenu" class="image-edit-dropdown"')
const gridCropStart = source.indexOf('<div class="toolbar-btn-wrapper" style="position:relative">', dropdownStart)
assert.ok(dropdownStart > -1 && gridCropStart > dropdownStart, 'ImageNode edit dropdown block should exist')

const dropdown = source.slice(dropdownStart, gridCropStart)
const orderedMarkers = [
  '<span>编辑</span>',
  '<span>重绘</span>',
  '<span>擦除</span>',
  "'抠图'",
  '<span>扩图</span>'
]

let lastIndex = -1
for (const marker of orderedMarkers) {
  const index = dropdown.indexOf(marker)
  assert.ok(index > lastIndex, `${marker} should appear in the expected dropdown order`)
  lastIndex = index
}
