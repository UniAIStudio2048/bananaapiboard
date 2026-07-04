import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'Docs.vue'), 'utf8')

for (const text of [
  '快速开始',
  '安装 Skill',
  'API Key',
  '/api/skills/models',
  '/api/skills/images/generate',
  '/api/skills/videos/generate',
  '/api/skills/tasks',
  'canvas_writeback',
  '计费',
  '错误码'
]) {
  assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}
assert.match(source, /window\.location\.origin/)
assert.match(source, /docs-layout/)
assert.match(source, /docs-sidebar/)
assert.match(source, /docs-toc/)

console.log('Docs source tests passed')
