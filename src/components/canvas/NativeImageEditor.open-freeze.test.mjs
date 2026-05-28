import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'NativeImageEditor.vue'), 'utf8')

const initMatch = source.match(/async function init\(\) \{([\s\S]*?)\n\}/)
assert.ok(initMatch, 'NativeImageEditor should keep an explicit init function')

assert.doesNotMatch(
  initMatch[1],
  /saveToHistory\(\)/,
  'Opening the editor should not synchronously serialize the full image into history'
)

assert.match(
  source,
  /createHistoryEntryFromCurrentCanvas/,
  'History snapshots should be created through an explicit helper instead of inline initialization work'
)

console.log('NativeImageEditor open freeze regression tests passed')
