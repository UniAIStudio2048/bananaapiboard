import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantPanel.vue'), 'utf8')

const menuItemBlock = source.match(/<div\s+v-if="slashMenuVisible" class="slash-menu"[\s\S]*?<div\s+v-if="slashMenuItems\.length === 0"/)?.[0] || ''

test('slash menu lists each skill as trigger + name only, without detail content', () => {
  assert.match(menuItemBlock, /class="slash-menu-item"/)
  assert.match(menuItemBlock, /class="slash-menu-trigger"[\s\S]*?item\.trigger/)
  assert.match(menuItemBlock, /class="slash-menu-name"[\s\S]*?item\.name/)
  assert.doesNotMatch(menuItemBlock, /item\.description/)
  assert.doesNotMatch(menuItemBlock, /item\.instructions/)
  assert.doesNotMatch(menuItemBlock, /usage_scenario/)
})

test('typing in the prompt input triggers the slash menu check', () => {
  const handler = source.match(/function handleInputEvent\(event\) \{[\s\S]*?\n\}\n/)?.[0] || ''
  assert.match(handler, /inputText\.value = text[\s\S]*?checkSlashTrigger\(\)/, 'handleInputEvent should run checkSlashTrigger after syncing inputText')
  assert.match(handler, /nextTick\(\(\) => \{[\s\S]*?if \(text !== inputText\.value\) inputText\.value = text[\s\S]*?checkSlashTrigger\(\)/, 'IME deferred path should also run checkSlashTrigger')
})

test('mention-boundary insertion in the prompt input triggers the slash menu check', () => {
  const handler = source.match(/function handleInputBeforeInput\(event\) \{[\s\S]*?\n\}\n/)?.[0] || ''
  assert.match(handler, /inputText\.value = next\.text[\s\S]*?checkSlashTrigger\(\)/, 'handleInputBeforeInput should run checkSlashTrigger after inserting text')
})

test('slash menu filters tenant skills by trigger prefix and supports keyboard selection', () => {
  const check = source.match(/function checkSlashTrigger\(\) \{[\s\S]*?\n\}\n/)?.[0] || ''
  assert.ok(check.includes('text.match(/^\\/([\\w-]*)$/)'), 'slash menu should only open for a leading /command with no space')
  assert.match(check, /trigger\.toLowerCase\(\)\.includes\(query\)/)

  const keydown = source.match(/function handleInputKeydown\(event\) \{[\s\S]*?if \(slashMenuVisible\.value\) \{[\s\S]*?\n  \}\n/)?.[0] || ''
  assert.match(keydown, /ArrowDown/)
  assert.match(keydown, /ArrowUp/)
  assert.match(keydown, /event\.key === 'Enter' \|\| event\.key === 'Tab'/)
  assert.match(keydown, /event\.key === 'Escape'/)
})
