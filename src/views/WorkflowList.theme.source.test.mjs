import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./WorkflowList.vue', import.meta.url), 'utf8')

assert.match(source, /:root\.canvas-theme-light\s+\.workflow-page\s*\{[^}]*background:\s*#f5f5f4/s)
assert.match(source, /:root\.canvas-theme-light\s+\.project-card[\s\S]*background:\s*#ffffff/)
assert.match(source, /:root\.canvas-theme-light\s+\.modal-box[\s\S]*background:\s*#ffffff/)

console.log('WorkflowList theme source tests passed')
