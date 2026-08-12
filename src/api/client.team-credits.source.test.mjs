import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./client.js', import.meta.url), 'utf8')

function extractFunction(name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `${name} must exist`)
  const bodyStart = source.indexOf('{', source.indexOf(')', start))
  let depth = 0
  for (let index = bodyStart; index < source.length; index++) {
    if (source[index] === '{') depth++
    if (source[index] === '}') depth--
    if (depth === 0) return source.slice(start, index + 1)
  }
  assert.fail(`${name} must have a complete body`)
}

test('getMe accepts optional teamId parameter', () => {
  const fnSource = extractFunction('getMe')
  assert.match(fnSource, /teamId/)
  assert.match(fnSource, /\{\s*teamId\s*\}\s*=\s*\{\}/, 'teamId must be destructured with default empty object')
})

test('getMe appends teamId to query string when provided', () => {
  const fnSource = extractFunction('getMe')
  assert.match(fnSource, /teamId/)
  assert.match(fnSource, /params\.append\(['"]teamId['"],\s*teamId\)/)
})

test('getMe remains backward compatible without teamId', () => {
  const fnSource = extractFunction('getMe')
  assert.match(fnSource, /if\s*\(\s*teamId\s*\)\s*params\.append/)
})