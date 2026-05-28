import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')

assert.match(source, /handleToolbarSpotHeal/, 'ImageNode should define a spot-heal toolbar handler')
assert.match(source, /enterEditMode\('spot-heal'\)/, 'spot-heal toolbar handler should enter spot-heal edit mode')
assert.match(source, /污点修复/, 'ImageNode edit menu should show a spot-heal item')
assert.match(source, /data-icon="spot-heal"|icon === 'spot-heal'|dropdownItem\.icon === 'spot-heal'/, 'ImageNode should render a spot-heal icon branch')
assert.match(source, /localProcessing !== 'spot-heal'/, 'local spot-heal processing nodes should not be marked as lost background tasks')

console.log('ImageNode spot-heal source tests passed')
