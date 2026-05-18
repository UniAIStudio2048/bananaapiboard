import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(__dirname, 'canvasStore.js'), 'utf8')

function functionBody(sourceText, functionName) {
  const start = sourceText.indexOf(`function ${functionName}(`)
  assert.ok(start >= 0, `Expected ${functionName} to exist`)

  const paramsEnd = sourceText.indexOf(')', start)
  const bodyStart = sourceText.indexOf('{', paramsEnd)
  let depth = 0
  for (let i = bodyStart; i < sourceText.length; i += 1) {
    if (sourceText[i] === '{') depth += 1
    if (sourceText[i] === '}') depth -= 1
    if (depth === 0) return sourceText.slice(bodyStart + 1, i)
  }

  throw new Error(`Could not parse ${functionName}`)
}

const duplicateBody = functionBody(source, 'duplicateNodeWithIncomingEdges')

assert.match(
  source,
  /function duplicateNodeWithIncomingEdges\(nodeId, options = \{\}\)/,
  'canvas store should expose a helper for processing resubmits'
)

assert.match(
  duplicateBody,
  /edges\.value\.filter\(e => e\.target === nodeId\)/,
  'processing resubmit duplication should copy only incoming edges'
)

assert.doesNotMatch(
  duplicateBody,
  /edges\.value\.filter\(e => e\.source === nodeId\)/,
  'processing resubmit duplication must not copy outgoing edges'
)

assert.match(
  source,
  /cleanNodeDataForProcessingDuplicate\(newNode\.data, node\.type\)/,
  'duplicated processing nodes should clear output/task state before submitting'
)

assert.match(
  source,
  /duplicateNodeWithIncomingEdges,/,
  'canvas store should return duplicateNodeWithIncomingEdges'
)
