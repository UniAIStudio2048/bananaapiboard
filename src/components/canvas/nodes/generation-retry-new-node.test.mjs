import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readComponent(filename) {
  return readFileSync(join(__dirname, filename), 'utf8')
}

function functionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`)
  assert.ok(start >= 0, `Expected ${functionName} to exist`)

  const paramsEnd = source.indexOf(')', start)
  assert.ok(paramsEnd > start, `Expected ${functionName} parameter list to close`)
  const bodyStart = source.indexOf('{', paramsEnd)
  let depth = 0
  for (let i = bodyStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') depth -= 1
    if (depth === 0) return source.slice(bodyStart + 1, i)
  }

  throw new Error(`Could not parse ${functionName}`)
}

test('failed image generation retry submits a new output node', () => {
  const source = readComponent('ImageNode.vue')
  const regenerateBody = functionBody(source, 'handleRegenerate')
  const generateBody = functionBody(source, 'handleGenerate')
  const createNodeBody = functionBody(source, 'createNewOutputNode')

  assert.match(regenerateBody, /handleGenerate\(\{\s*forceNewNode:\s*true\s*\}\)/)
  assert.match(generateBody, /forceNewNode/)
  assert.match(generateBody, /props\.data\.status\s*===\s*'processing'\s*\|\|\s*forceNewNode\s*\|\|\s*hasExistingMediaContent\(\)/)
  assert.match(source, /function hasExistingMediaContent\(\)/)
  assert.match(source, /props\.data\?\.sourceImages\?\.length\s*>\s*0/)
  assert.match(source, /props\.data\?\.output\?\.urls\?\.length\s*>\s*0/)
  assert.match(source, /props\.data\?\.output\?\.url/)
  assert.match(source, /props\.data\?\.generatedImage/)
  assert.match(source, /props\.data\?\.imageUrl/)
  assert.match(source, /const NEW_OUTPUT_NODE_VERTICAL_GAP = 80/)
  assert.match(source, /function getCurrentNodeDisplayHeight\(currentNode\)/)
  assert.match(createNodeBody, /const displayHeight = getCurrentNodeDisplayHeight\(currentNode\)/)
  assert.match(createNodeBody, /x:\s*currentNode\.position\.x,\s*\n\s*y:\s*currentNode\.position\.y\s*\+\s*displayHeight\s*\+\s*NEW_OUTPUT_NODE_VERTICAL_GAP/)
  assert.match(createNodeBody, /const upstreamEdges = canvasStore\.edges\.filter\(e => e\.target === props\.id\)/)
  assert.doesNotMatch(regenerateBody, /status:\s*'idle'/)
})

test('failed video generation retry submits a new output node', () => {
  const source = readComponent('VideoNode.vue')
  const regenerateBody = functionBody(source, 'handleRegenerate')
  const generateBody = functionBody(source, 'handleGenerate')
  const createNodeBody = functionBody(source, 'createNewOutputNode')

  assert.match(regenerateBody, /handleGenerate\(\{\s*forceNewNode:\s*true\s*\}\)/)
  assert.match(generateBody, /forceNewNode/)
  assert.match(generateBody, /props\.data\.status\s*===\s*'processing'\s*\|\|\s*forceNewNode\s*\|\|\s*hasExistingMediaContent\(\)/)
  assert.match(source, /function hasExistingMediaContent\(\)/)
  assert.match(source, /props\.data\?\.sourceVideo/)
  assert.match(source, /props\.data\?\.output\?\.urls\?\.length\s*>\s*0/)
  assert.match(source, /props\.data\?\.output\?\.url/)
  assert.match(source, /props\.data\?\.videoUrl/)
  assert.match(source, /const NEW_OUTPUT_NODE_VERTICAL_GAP = 80/)
  assert.match(source, /function getCurrentNodeDisplayHeight\(currentNode\)/)
  assert.match(createNodeBody, /const displayHeight = getCurrentNodeDisplayHeight\(currentNode\)/)
  assert.match(createNodeBody, /x:\s*currentNode\.position\.x,\s*\n\s*y:\s*currentNode\.position\.y\s*\+\s*displayHeight\s*\+\s*NEW_OUTPUT_NODE_VERTICAL_GAP/)
  assert.match(createNodeBody, /const upstreamEdges = canvasStore\.edges\.filter\(e => e\.target === props\.id\)/)
  assert.doesNotMatch(regenerateBody, /status:\s*'idle'/)
})
