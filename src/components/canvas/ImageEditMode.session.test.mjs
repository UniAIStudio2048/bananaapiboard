import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageEditMode.vue'), 'utf8')

assert.match(source, /from '\.\/imageEditSession\.js'/, 'ImageEditMode should use image edit session helpers')
assert.match(source, /node\??\.data\?\.editSession/, 'ImageEditMode should read persisted edit sessions from node data')
assert.match(source, /async function persistEditSession\(/, 'ImageEditMode should persist edit sessions after save')
assert.match(source, /editSession: persistedSession/, 'ImageEditMode should write persisted sessions back to node data')
assert.doesNotMatch(source, /clearNodeCache\(nodeId\)/, 'ImageEditMode should not clear the saved session after save')

console.log('ImageEditMode session tests passed')
