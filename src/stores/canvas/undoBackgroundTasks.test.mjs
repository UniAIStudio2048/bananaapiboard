import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const canvasStoreSource = fs.readFileSync(path.join(__dirname, 'canvasStore.js'), 'utf8')
const backgroundTaskSource = fs.readFileSync(path.join(__dirname, 'backgroundTaskManager.js'), 'utf8')

assert.match(
  canvasStoreSource,
  /function saveHistory\(options = \{\}\) \{\s*const \{ force = false \} = options/s,
  'saveHistory should accept a force option for discrete undo points'
)

assert.match(
  canvasStoreSource,
  /if \(!force && now - lastHistorySaveTime < dynamicThrottle\) \{/,
  'history throttling must not skip forced discrete undo points'
)

for (const taskType of ['image', 'video', 'audio-edit']) {
  assert.match(
    backgroundTaskSource,
    new RegExp(`['"]${taskType}['"]`),
    `${taskType} tasks should be treated as history-producing media tasks`
  )
}

assert.match(
  backgroundTaskSource,
  /window\.dispatchEvent\(new CustomEvent\('canvas-history-invalidate'/,
  'completed background media tasks should invalidate the canvas history panel'
)
