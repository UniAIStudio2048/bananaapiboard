import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcDir = join(__dirname, '../../..')

function read(relativePath) {
  return readFileSync(join(srcDir, relativePath), 'utf8')
}

function functionBlock(source, name) {
  const match = source.match(new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`))
  assert.ok(match, `${name} should exist`)
  return match[1]
}

test('director studio pose preset selects keep showing the applied preset label', () => {
  const inspector = read('components/canvas/director/DirectorStudioInspector.vue')

  assert.match(inspector, /const\s+activeActionPresetId\s*=\s*computed/)
  assert.match(inspector, /const\s+activeInteractionPresetId\s*=\s*computed/)
  assert.match(
    inspector,
    /<select\s+:value="activeActionPresetId"\s+@change="handleActionPresetChange">/,
    'single-person pose select should be bound to the current action preset'
  )
  assert.match(
    inspector,
    /<select\s+:value="activeInteractionPresetId"\s+@change="handleInteractionPresetChange">/,
    'pair pose select should be bound to the current interaction preset'
  )
  assert.doesNotMatch(functionBlock(inspector, 'handleActionPresetChange'), /event\.target\.value\s*=\s*['"]['"]/)
  assert.doesNotMatch(functionBlock(inspector, 'handleInteractionPresetChange'), /event\.target\.value\s*=\s*['"]['"]/)
})
