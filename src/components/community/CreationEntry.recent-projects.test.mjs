import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./CreationEntry.vue', import.meta.url), 'utf8')

assert.match(source, /getProjectList\(\{\s*spaceType:\s*['"]personal['"]\s*\}\)/, 'Recent projects should load personal projects')
assert.match(source, /sort\(\(a, b\) => Number\(b\?\.created_at \|\| 0\) - Number\(a\?\.created_at \|\| 0\)\)/, 'Recent projects should sort by creation time')
assert.match(source, /slice\(0, 5\)/, 'Recent projects should be limited to five cards')
assert.match(source, /formatProjectDate\(project\.updated_at\)/, 'Project cards should display the last modified time')
assert.match(source, /return `\$\{year\}-\$\{month\}-\$\{day\} \$\{hours\}:\$\{minutes\}`/, 'Project timestamps should include hours and minutes')
assert.match(source, /@wheel="handleWheel"/, 'Project list should handle mouse wheel scrolling')
assert.match(source, /event\.preventDefault\(\)[\s\S]*element\.scrollLeft \+= event\.deltaY/, 'Vertical wheel should scroll the project list horizontally')
assert.match(source, /function openAllProjects\(\)[\s\S]*router\.push\(['"]\/workflows['"]\)/, 'All projects should open the project management page')
assert.match(source, /workflow_count[^\n]*> 0[\s\S]*query: \{ projectId \}/, 'Projects with workflows should open their project folder')
assert.match(source, /path: ['"]\/canvas['"][\s\S]*query: \{ projectId \}/, 'Empty projects should open canvas with the project id')
assert.match(source, /登录后查看最近项目/, 'Unauthenticated users should see a login prompt')

console.log('CreationEntry recent project source tests passed')
