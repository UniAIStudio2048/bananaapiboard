import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'ImageNode.vue'), 'utf8')

function functionBlock(name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} should exist`)
  const nextFunction = source.indexOf('\nfunction ', start + 1)
  return source.slice(start, nextFunction === -1 ? source.length : nextFunction)
}

test('image camera control initializes from and persists to node data', () => {
  assert.match(source, /const cameraControlEnabled = ref\(props\.data\?\.cameraControlEnabled === true\)/)
  assert.match(source, /const cameraSettings = ref\(\{\s*\.\.\.defaultCameraSettings\(\),\s*\.\.\.\(props\.data\?\.cameraSettings \|\| \{\}\)/s)

  const saveBlock = functionBlock('handleCameraControlSave')
  assert.match(saveBlock, /canvasStore\.updateNodeData\(props\.id,\s*\{[\s\S]*cameraControlEnabled:\s*true/)
  assert.match(saveBlock, /cameraSettings:\s*\{\s*\.\.\.settings\s*\}/)
  assert.match(saveBlock, /cameraPrompt:\s*settings\.prompt \|\| ''/)

  const disableBlock = functionBlock('disableCameraControl')
  assert.match(disableBlock, /canvasStore\.updateNodeData\(props\.id,\s*\{[\s\S]*cameraControlEnabled:\s*false/)
  assert.match(disableBlock, /cameraSettings:\s*emptyCameraSettings/)
  assert.match(disableBlock, /cameraPrompt:\s*null/)
})
