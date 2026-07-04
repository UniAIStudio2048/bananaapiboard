import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'index.js'), 'utf8')

assert.match(source, /const Docs = \(\) => import\('@\/views\/Docs\.vue'\)/)
assert.match(source, /path: '\/docs'/)
assert.match(source, /name: 'docs'/)
assert.match(source, /component: Docs/)
assert.match(source, /meta: \{ title: '文档', requiresAuth: false \}/)

console.log('Docs route source tests passed')
