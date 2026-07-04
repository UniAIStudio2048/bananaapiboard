import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'skills.js'), 'utf8')

assert.match(source, /getApiUrl\('\/api\/skills\/keys'\)/)
assert.match(source, /getApiUrl\('\/api\/skills\/package'\)/)
assert.match(source, /getTenantHeaders\(\)/)
assert.match(source, /Authorization:\s*`Bearer \$\{token\}`/)
assert.match(source, /export async function getSkillKeys/)
assert.match(source, /export async function createSkillKey/)
assert.match(source, /export async function resetSkillKey/)
assert.match(source, /export async function getSkillPackage/)

console.log('Skills API source tests passed')
