import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const canvasSource = readFileSync(join(__dirname, 'Canvas.vue'), 'utf8')
const emptySource = readFileSync(join(__dirname, '../components/canvas/CanvasEmptyState.vue'), 'utf8')

assert.match(canvasSource, /function goToAllProjects\(\)/, 'Canvas should expose a top-left action for all projects')
assert.match(canvasSource, /@click="goToAllProjects"[\s\S]*?<span>全部项目<\/span>/, 'Canvas mode dropdown should include 全部项目')
assert.match(emptySource, /function goToMyProjects\(\)/, 'Empty state should route to the projects page')
assert.match(emptySource, /我的项目/, 'Empty state should label the personal workflow entry as 我的项目')
assert.doesNotMatch(emptySource, /goToMyWorkflows/, 'Empty state should no longer use the old my workflows handler name')

console.log('Canvas project entry source tests passed')
