import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageEditMode.vue'), 'utf8')

assert.match(source, /inpaintImageLocal/, 'ImageEditMode should import the local inpaint API wrapper')
assert.match(source, /currentTool\.value === 'spot-heal'/, 'ImageEditMode should branch saves for spot-heal mode')
assert.match(source, /createSpotHealResultNode\(/, 'spot-heal save should create a new repaired image node')
assert.match(source, /污点修复/, 'ImageEditMode should label the spot-heal tool')
assert.match(source, /sourceType:\s*'spot-heal'/, 'spot-heal result nodes should be marked with their source type')
assert.match(source, /localProcessing:\s*'spot-heal'/, 'spot-heal processing nodes should be marked as locally processed')
assert.match(source, /localProcessing:\s*null/, 'spot-heal result updates should clear the local processing marker')

console.log('ImageEditMode spot-heal source tests passed')
