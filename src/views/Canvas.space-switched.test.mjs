import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./Canvas.vue', import.meta.url), 'utf8')

test('Canvas.vue defines handleSpaceSwitched function', () => {
  assert.match(source, /async function handleSpaceSwitched\s*\(/)
})

test('handleSpaceSwitched calls getMe with teamId from event detail', () => {
  const fnStart = source.indexOf('async function handleSpaceSwitched')
  assert.notEqual(fnStart, -1, 'handleSpaceSwitched must exist')
  const window = source.slice(fnStart, fnStart + 500)
  assert.match(window, /getMe\(\s*true,\s*\{\s*teamId\s*\}/)
})

test('Canvas.vue registers space-switched event listener in onMounted', () => {
  assert.match(source, /addEventListener\(['"]space-switched['"],\s*handleSpaceSwitched\)/)
})

test('Canvas.vue removes space-switched event listener in onUnmounted', () => {
  assert.match(source, /removeEventListener\(['"]space-switched['"],\s*handleSpaceSwitched\)/)
})

test('loadUserInfo calls getMe with teamId from teamStore', () => {
  const fnStart = source.indexOf('async function loadUserInfo')
  assert.notEqual(fnStart, -1, 'loadUserInfo must exist')
  const window = source.slice(fnStart, fnStart + 2000)
  assert.match(window, /getMe\([^)]*teamId[^)]*\)/)
})

test('handleUserInfoUpdated calls getMe with teamId from teamStore', () => {
  const fnStart = source.indexOf('async function handleUserInfoUpdated')
  assert.notEqual(fnStart, -1, 'handleUserInfoUpdated must exist')
  const window = source.slice(fnStart, fnStart + 500)
  assert.match(window, /getMe\(\s*true,\s*\{\s*teamId[^}]*\}/)
})