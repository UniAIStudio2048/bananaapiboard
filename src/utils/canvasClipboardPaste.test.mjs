import assert from 'node:assert/strict'
import {
  getClipboardFiles,
  resolveCanvasMenuPastePosition,
  resolveCanvasPasteScreenPosition,
  resolveCanvasPasteSource
} from './canvasClipboardPaste.js'

function fileLike(name, type = 'image/png') {
  return { name, type }
}

function itemWithFile(file) {
  return {
    kind: 'file',
    getAsFile: () => file,
  }
}

const screenshot = fileLike('screenshot.png')

assert.deepEqual(
  getClipboardFiles({ files: [screenshot] }),
  [screenshot],
  'reads files from clipboardData.files'
)

assert.deepEqual(
  getClipboardFiles({ files: [], items: [itemWithFile(screenshot)] }),
  [screenshot],
  'falls back to file items when files is empty'
)

assert.equal(
  resolveCanvasPasteSource({ hasNodeClipboard: true, clipboardData: { files: [screenshot] } }),
  'system-files',
  'system screenshot wins even when nodes were copied earlier'
)

assert.equal(
  resolveCanvasPasteSource({ hasNodeClipboard: true, clipboardData: { files: [] } }),
  'nodes',
  'node clipboard is used when system clipboard has no files'
)

assert.equal(
  resolveCanvasPasteSource({ hasNodeClipboard: false, clipboardData: { files: [screenshot] } }),
  'system-files',
  'system files paste without node clipboard'
)

assert.equal(
  resolveCanvasPasteSource({ hasNodeClipboard: false, clipboardData: { files: [] } }),
  'none',
  'empty paste has no canvas action'
)

assert.deepEqual(
  resolveCanvasPasteScreenPosition({
    lastMousePosition: { x: 640, y: 360 },
    canvasRect: { left: 100, top: 80, width: 900, height: 600, right: 1000, bottom: 680 }
  }),
  { x: 640, y: 360 },
  'uses the last mouse hover position when it is inside the canvas'
)

assert.deepEqual(
  resolveCanvasPasteScreenPosition({
    lastMousePosition: null,
    canvasRect: { left: 100, top: 80, width: 900, height: 600, right: 1000, bottom: 680 }
  }),
  { x: 550, y: 380 },
  'falls back to the visible canvas center when no hover position was recorded'
)

assert.deepEqual(
  resolveCanvasPasteScreenPosition({
    lastMousePosition: { x: 0, y: 0 },
    canvasRect: { left: 100, top: 80, width: 900, height: 600, right: 1000, bottom: 680 }
  }),
  { x: 550, y: 380 },
  'does not convert an off-canvas screen position into an off-screen paste point'
)

assert.deepEqual(
  resolveCanvasMenuPastePosition({ x: 780, y: 420, flowX: -1200, flowY: 840 }),
  { x: -1200, y: 840 },
  'uses menu flow coordinates for node paste instead of screen coordinates'
)
