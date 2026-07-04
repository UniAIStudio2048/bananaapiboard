import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'SkillsPanel.vue'), 'utf8')

assert.match(source, /defineEmits\(\['close'\]\)/)
assert.match(source, /getSkillKeys/)
assert.match(source, /createSkillKey/)
assert.match(source, /resetSkillKey/)
assert.match(source, /getSkillPackage/)
assert.match(source, /navigator\.clipboard\.writeText/)
assert.match(source, /window\.location\.origin/)
assert.match(source, /\/docs/)
assert.match(source, /SKILL\.md/)
assert.match(source, /api_key/)
assert.match(source, /packageData\.value\?\.key\?\.api_key/)

console.log('SkillsPanel source tests passed')
