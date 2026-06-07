import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CameraControlPanel.vue'), 'utf8')

assert.match(
  source,
  /<button class="reset-btn" @click="resetToDefault" title="重置">/,
  'Reset button should restore the default preset state, not only reset the current selector group'
)

assert.match(
  source,
  /function resetToDefault\(\) \{[\s\S]*activePresetId\.value = null[\s\S]*handleReset\(\)/,
  'Default reset should clear the active camera preset and apply default settings'
)

console.log('CameraControlPanel reset default tests passed')
