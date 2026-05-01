import assert from 'node:assert/strict'
import { getClipboardFiles, resolveCanvasPasteSource } from './canvasClipboardPaste.js'

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
