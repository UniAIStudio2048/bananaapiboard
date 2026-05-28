import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'NativeImageEditor.vue'), 'utf8')

assert.match(source, /initialTool.*spot-heal|spot-heal.*initialTool/s, 'NativeImageEditor should recognize spot-heal initial tool')
assert.match(source, /currentMode === 'spot-heal'/, 'NativeImageEditor should expose spot-heal controls')
assert.match(source, /paintMaskBrushPoint/, 'spot-heal should reuse the mask brush painter')
assert.match(source, /污点修复/, 'NativeImageEditor should show spot-heal copy')
assert.match(source, /涂抹要修复的污点区域/, 'NativeImageEditor should guide users to paint defects')

console.log('NativeImageEditor spot-heal source tests passed')
