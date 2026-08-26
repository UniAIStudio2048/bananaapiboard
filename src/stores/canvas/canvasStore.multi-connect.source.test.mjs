import test from 'node:test'
import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvasStore.js'), 'utf8')

function getFunctionBody(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} should exist`)
  let depth = 0
  let i = source.indexOf('{', start)
  const begin = start
  for (; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) break
    }
  }
  return source.slice(begin, i + 1)
}

test('store declares multi-connect drag state', () => {
  assert.match(
    source,
    /const dragConnectionSourceIds = ref\(null\)/,
    'canvas store should declare dragConnectionSourceIds'
  )
  assert.match(
    source,
    /const pendingMultiConnectSourceIds = ref\(null\)/,
    'canvas store should declare pendingMultiConnectSourceIds'
  )
})

test('startDragConnection accepts extra multi-connect source ids', () => {
  const body = getFunctionBody('startDragConnection')
  assert.match(body, /extraSourceIds = null/, 'startDragConnection should accept optional extraSourceIds')
  assert.match(body, /dragConnectionSourceIds\.value = /, 'startDragConnection should store extra source ids')
  assert.match(body, /Array\.isArray\(extraSourceIds\) && extraSourceIds\.length > 1/, 'only multi-selection stores ids')
  assert.match(body, /pendingMultiConnectSourceIds\.value = null/, 'a new drag should drop stale pending ids')
})

test('endDragConnection connects every selected source to the target node', () => {
  const body = getFunctionBody('endDragConnection')
  assert.match(body, /resolveMultiConnectExtraSourceIds\(/, 'endDragConnection should resolve extra sources')
  assert.match(body, /cellLevelTarget/, 'endDragConnection should guard storyboard cell-level targets')
  assert.match(body, /for \(const extraId of extraSourceIds\)/, 'endDragConnection should loop extra sources')
  assert.match(body, /dragConnectionSourceIds\.value = null/, 'endDragConnection should reset drag source ids')
})

test('endDragConnection keeps multi sources for the node selector path', () => {
  const body = getFunctionBody('endDragConnection')
  assert.match(
    body,
    /pendingMultiConnectSourceIds\.value = dragConnectionSourceIds\.value/,
    'empty drop should hand multi sources to the selector flow'
  )
})

test('addNode consumes pending multi sources after the trigger edge', () => {
  const body = getFunctionBody('addNode')
  assert.match(body, /pendingMultiConnectSourceIds\.value/, 'addNode should read pending multi sources')
  assert.match(body, /resolveMultiConnectExtraSourceIds\(/, 'addNode should resolve extra sources')
  assert.match(body, /pendingMultiConnectSourceIds\.value = null/, 'addNode should consume pending multi sources')
})

test('cancel paths clear the pending multi sources', () => {
  assert.match(
    getFunctionBody('cancelDragConnection'),
    /pendingMultiConnectSourceIds\.value = null/,
    'cancelDragConnection should clear pending multi sources'
  )
  assert.match(
    getFunctionBody('closeNodeSelector'),
    /pendingMultiConnectSourceIds\.value = null/,
    'closeNodeSelector should clear pending multi sources'
  )
})

console.log('canvasStore multi-connect contract tests passed')
