import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'VideoNode.vue'), 'utf8')

test('video node persists all visible mode and format selections to node data', () => {
  const watcherStart = source.indexOf('watch([selectedModel, selectedAspectRatio')
  assert.notEqual(watcherStart, -1, 'parameter persistence watcher should exist')
  const watcherEnd = source.indexOf('// 🔧 监听 VEO 模式切换', watcherStart)
  const watcherBlock = source.slice(watcherStart, watcherEnd)

  for (const stateName of [
    'viduMode',
    'selectedKlingO1Mode',
    'omniKeepSound',
    'selectedKlingV3OmniMode',
    'v3OmniKeepSound'
  ]) {
    assert.match(watcherBlock, new RegExp(`\\b${stateName}\\b`), `${stateName} should be watched`)
  }

  for (const dataKey of [
    'viduMode',
    'klingO1Mode',
    'omniKeepSound',
    'klingV3OmniMode',
    'v3OmniKeepSound'
  ]) {
    assert.match(watcherBlock, new RegExp(`${dataKey}:`), `${dataKey} should be written to node data`)
  }
})
