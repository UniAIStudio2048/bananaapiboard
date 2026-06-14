import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function read(relativePath) {
  return readFileSync(join(__dirname, relativePath), 'utf8')
}

test('director studio fullscreen hides the canvas top-right controls', () => {
  const canvasSource = read('Canvas.vue')
  const directorNodeSource = read('../components/canvas/nodes/DirectorStudioNode.vue')

  assert.match(
    canvasSource,
    /const\s+canvasFullscreenOverlayIds\s*=\s*ref\(new Set\(\)\)/,
    'Canvas should track active fullscreen overlays'
  )
  assert.match(
    canvasSource,
    /provide\('canvasFullscreenOverlayControls',\s*\{[\s\S]*setActive:\s*setCanvasFullscreenOverlayActive[\s\S]*\}\)/,
    'Canvas should provide fullscreen overlay controls to node components'
  )
  assert.match(
    canvasSource,
    /<div\s+v-if="!isCanvasFullscreenOverlayOpen"[\s\S]*class="canvas-top-right-controls"/,
    'Canvas should unmount the top-right controls while a fullscreen overlay is open'
  )

  assert.match(
    directorNodeSource,
    /inject\('canvasFullscreenOverlayControls',\s*null\)/,
    'DirectorStudioNode should consume the fullscreen overlay controls'
  )
  assert.match(
    directorNodeSource,
    /watch\(\s*directorStudioOpen,\s*isOpen\s*=>\s*\{[\s\S]*setCanvasFullscreenOverlayActive\(isOpen\)[\s\S]*\},\s*\{\s*immediate:\s*true\s*\}\s*\)/,
    'DirectorStudioNode should report open and closed fullscreen state'
  )
  assert.match(
    directorNodeSource,
    /onUnmounted\(\(\)\s*=>\s*\{[\s\S]*setCanvasFullscreenOverlayActive\(false\)[\s\S]*\}\)/,
    'DirectorStudioNode should clear fullscreen state when unmounted'
  )
})
