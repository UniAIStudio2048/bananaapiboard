import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasMiniMapOverview.vue'), 'utf8')

assert.match(source, /item\?\.groupId/, 'The lightweight minimap should classify grouped nodes')
assert.match(source, /overview-node is-grouped/, 'Grouped nodes should receive a distinct overview class')
assert.match(source, /\.overview-node\.is-grouped\s*\{[\s\S]*?fill:/, 'Grouped overview nodes should use their own fill')
assert.match(source, /\.overview-node\.is-group\s*\{[\s\S]*?fill:\s*transparent/, 'Overview group containers should remain transparent')

console.log('CanvasMiniMapOverview tests passed')
