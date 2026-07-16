import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'WorkflowTabs.vue'), 'utf8')

test('折叠工作流标签支持双击重命名和拖拽排序', () => {
  const moreMenuItem = source.match(/class="more-menu-item"[\s\S]*?\n\s*\/\>/)

  assert.ok(moreMenuItem, '应存在折叠菜单工作流标签项')
  assert.match(moreMenuItem[0], /@dblclick="handleDoubleClick\(\$event, tab\)"/)
  assert.match(moreMenuItem[0], /@dragstart="handleDragStart\(\$event, tab\)"/)
  assert.match(moreMenuItem[0], /@drop="handleDrop\(\$event, tab\)"/)
  assert.match(source, /editState\.editing && editState\.tabId === tab\.id[\s\S]*?menu-item-name-input/)
})

test('折叠标签菜单在白昼模式下使用与标签一致的浅色样式', () => {
  assert.match(source, /:root\.canvas-theme-light \.workflow-tabs \.more-menu\s*\{[\s\S]*?background:\s*#ffffff;/)
  assert.match(source, /:root\.canvas-theme-light \.workflow-tabs \.more-menu-item\s*\{[\s\S]*?color:\s*rgba\(0, 0, 0, 0\.7\);/)
  assert.doesNotMatch(source, /\.more-tabs-menu|\.more-tabs-item/)
})
