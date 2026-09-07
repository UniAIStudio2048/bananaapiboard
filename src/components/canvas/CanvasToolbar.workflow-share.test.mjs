import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasToolbar.vue'), 'utf8')

assert.match(source, /openShare/)
assert.match(source, /分享工作流/)

console.log('CanvasToolbar workflow-share contract tests passed')
