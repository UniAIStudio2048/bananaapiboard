import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./WorkflowList.vue', import.meta.url), 'utf8')

assert.match(source, /useRouter, useRoute/, 'Workflow list should read project query parameters')
assert.match(source, /async function loadProjects\(\{ openQueryProject = false \} = \{\}\)/, 'Project loading should support opening a requested project')
assert.match(source, /openQueryProject && route\.query\.projectId/, 'Project list should inspect the requested project id')
assert.match(source, /find\(project => String\(project\.id\) === String\(route\.query\.projectId\)\)/, 'Project list should resolve the requested project')
assert.match(source, /onMounted\(async \(\) => \{[\s\S]*await loadProjects\(\{ openQueryProject: true \}\)/, 'Initial project loading should open a requested project folder')

console.log('WorkflowList recent project entry source tests passed')
