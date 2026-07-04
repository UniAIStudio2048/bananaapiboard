import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'Canvas.vue'), 'utf8')

assert.match(source, /import SkillsPanel from '@\/components\/canvas\/SkillsPanel\.vue'/)
assert.match(source, /const showSkillsPanel = ref\(false\)/)
assert.match(source, /function toggleSkillsPanel\(\)/)
assert.match(source, /showAIAssistant\.value = false/)
assert.match(source, /class="canvas-icon-btn canvas-skills-btn"/)
assert.match(source, /@click="toggleSkillsPanel"/)
assert.match(source, /<SkillsPanel\s+v-if="showSkillsPanel"/)
assert.match(source, /@close="showSkillsPanel = false"/)

console.log('Canvas skills button tests passed')
