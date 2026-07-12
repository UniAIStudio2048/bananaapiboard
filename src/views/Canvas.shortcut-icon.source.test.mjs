import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'Canvas.vue'), 'utf8')
const shortcutButton = source.match(/<!-- 帮助\/快捷键按钮（仅图标） -->([\s\S]*?)<\/button>/)?.[1] || ''

assert.match(shortcutButton, /class="[^"]*\bcanvas-shortcut-icon\b[^"]*"/)
assert.match(shortcutButton, /<rect x="3" y="5" width="18" height="14" rx="3"\/>/)
assert.match(shortcutButton, /<circle cx="7" cy="10" r="0\.75" fill="currentColor" stroke="none"\/>/)
assert.match(shortcutButton, /<path d="M7 15h10"\/>/)
assert.doesNotMatch(shortcutButton, /M9\.09 9a3 3/)

console.log('Canvas shortcut icon tests passed')
