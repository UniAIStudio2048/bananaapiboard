import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readTextNode() {
  return readFileSync(join(__dirname, 'TextNode.vue'), 'utf8')
}

function functionBlock(source, name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `Expected ${name} to exist`)
  const end = source.indexOf('\n}\n\nwatch', start)
  assert.ok(end > start, `Expected ${name} block before watcher`)
  return source.slice(start, end + 3)
}

test('image describe auto preset keeps an empty text node in initial quick-action state', () => {
  const source = readTextNode()
  const block = functionBlock(source, 'tryApplyAutoPreset')

  assert.match(block, /persistSelectedPreset\(imageDescribePreset\.id,\s*imageDescribePreset\)/)
  assert.match(block, /canvasStore\.updateNodeData\(props\.id,\s*\{\s*autoPreset:\s*null\s*\}\)/)
  assert.doesNotMatch(block, /nodeState\.value\s*=\s*['"]ready['"]/)
  assert.doesNotMatch(block, /nodeState\.value\s*=\s*['"]editing['"]/)
})
