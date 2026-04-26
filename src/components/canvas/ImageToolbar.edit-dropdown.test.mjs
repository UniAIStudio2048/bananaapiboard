import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageToolbar.vue'), 'utf8')

assert.match(source, /const editDropdownItems = \[/, 'ImageToolbar should define edit dropdown items')
assert.match(source, /id: 'edit'/, 'toolbar should expose a single edit entry')
assert.match(source, /class="edit-dropdown-menu"/, 'template should render the edit dropdown menu')
assert.match(source, /@click="handleEditButtonClick"/, 'edit button should toggle dropdown first, then execute edit')

const toolbarBlock = source.match(/const toolbarItems = \[([\s\S]*?)\n\]/)?.[1] || ''
for (const id of ['repaint', 'erase', 'cutout', 'expand']) {
  assert.doesNotMatch(toolbarBlock, new RegExp(`id: '${id}'`), `${id} should not be a top-level toolbar item`)
}

const dropdownBlock = source.match(/const editDropdownItems = \[([\s\S]*?)\n\]/)?.[1] || ''
const labels = Array.from(dropdownBlock.matchAll(/label: '([^']+)'/g)).map(match => match[1])
assert.deepEqual(labels, ['编辑', '重绘', '擦除', '抠图', '扩图'])
