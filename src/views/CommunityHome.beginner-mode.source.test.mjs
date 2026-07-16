import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CommunityHome.vue'), 'utf8')

assert.match(
  source,
  /@click="enterBeginnerMode"[\s\S]*进入新手模式/,
  'community user menu should expose the beginner mode entry'
)

assert.match(
  source,
  /function enterBeginnerMode\(\) \{[\s\S]*showUserMenu\.value = false[\s\S]*localStorage\.setItem\('userMode', 'simple'\)[\s\S]*window\.dispatchEvent\(new CustomEvent\('user-info-updated'\)\)[\s\S]*router\.push\('\/generate'\)[\s\S]*\}/,
  'beginner mode entry should persist simple mode and open the beginner workspace'
)

console.log('CommunityHome beginner mode source tests passed')
