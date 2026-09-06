import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(new URL('./tenant.js', import.meta.url), 'utf8')
const videoNodeSource = fs.readFileSync(
  new URL('../components/canvas/nodes/VideoNode.vue', import.meta.url),
  'utf8'
)

test('video model config merges Wan3 defaults from enabled channels', () => {
  assert.match(
    source,
    /wan3Config:\s*mergeWan3Config\(modelConfig\)/,
    'new-format video models must expose the selected channel Wan3 config'
  )
  assert.match(
    source,
    /wan3Config:\s*mergeWan3Config\(modelFullConfig\)/,
    'legacy video models must expose the selected channel Wan3 config'
  )
})

test('Wan3 node initialization preserves saved mode while applying configured default to new nodes', () => {
  assert.match(
    videoNodeSource,
    /selectedWan3Mode\.value\s*=\s*pickInitialSubmode\(\s*props\.data\.wan3Mode,\s*configuredMode,\s*WAN3_MODES,\s*'text2video'\s*\)/s,
    'Wan3 initialization must prefer saved node mode and otherwise use the configured default'
  )
})
