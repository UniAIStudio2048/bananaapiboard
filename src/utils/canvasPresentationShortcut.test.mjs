import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvasPresentationShortcut } from './canvasPresentationShortcut.js'

function setup({ edgesInitiallyHidden = false } = {}) {
  let time = 0
  let clean = false
  let edges = edgesInitiallyHidden
  let timerId = 0
  const timers = new Map()
  const shortcut = createCanvasPresentationShortcut({
    isClean: () => clean,
    toggleEdges: () => { edges = !edges },
    showEdges: () => { edges = false },
    enterClean: () => { clean = true },
    exitClean: () => { clean = false },
    now: () => time,
    schedule: (callback, delay) => {
      const id = ++timerId
      timers.set(id, { callback, at: time + delay })
      return id
    },
    cancel: id => timers.delete(id)
  })
  return {
    shortcut,
    get clean() { return clean },
    get edges() { return edges },
    advance(ms) {
      time += ms
      for (const [id, timer] of timers) {
        if (timer.at <= time) {
          timers.delete(id)
          timer.callback()
        }
      }
    }
  }
}

test('single Ctrl+B toggles edges after the double-press window', () => {
  const state = setup()
  state.shortcut.press()
  state.advance(319)
  assert.equal(state.edges, false)
  state.advance(1)
  assert.equal(state.edges, true)
  assert.equal(state.clean, false)
})

test('double Ctrl+B shows edges on entry and exits without changing them', () => {
  const state = setup({ edgesInitiallyHidden: true })
  state.shortcut.press()
  state.advance(120)
  state.shortcut.press()
  assert.equal(state.clean, true)
  assert.equal(state.edges, false)
  state.advance(400)
  assert.equal(state.edges, false)
  state.shortcut.press()
  state.advance(100)
  state.shortcut.press()
  assert.equal(state.clean, false)
  assert.equal(state.edges, false)
})

test('single Ctrl+B still toggles edges inside clean mode', () => {
  const state = setup()
  state.shortcut.press()
  state.advance(100)
  state.shortcut.press()
  state.advance(321)
  state.shortcut.press()
  state.advance(320)
  assert.equal(state.clean, true)
  assert.equal(state.edges, true)
  state.shortcut.press()
  state.advance(320)
  assert.equal(state.edges, false)
})

test('Escape exits clean mode and clears a pending shortcut', () => {
  const state = setup()
  state.shortcut.press()
  state.shortcut.press()
  state.shortcut.press()
  assert.equal(state.shortcut.escape(), true)
  assert.equal(state.clean, false)
  state.advance(400)
  assert.equal(state.edges, false)
  assert.equal(state.shortcut.escape(), false)
})

test('a slow second Ctrl+B starts a new single-press window', () => {
  const state = setup()
  state.shortcut.press()
  state.advance(321)
  state.shortcut.press()
  state.advance(320)
  assert.equal(state.edges, false)
  assert.equal(state.clean, false)
})
