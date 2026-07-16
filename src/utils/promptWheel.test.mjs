import test from 'node:test'
import assert from 'node:assert/strict'
import { handlePromptWheel } from './promptWheel.js'

test('modified wheel prevents browser zoom and lets canvas events bubble', () => {
  let prevented = false
  let stopped = false
  const event = {
    ctrlKey: true,
    metaKey: false,
    deltaY: 1,
    target: { closest: () => '.canvas-board' },
    preventDefault: () => { prevented = true },
    stopPropagation: () => { stopped = true }
  }

  handlePromptWheel(event)

  assert.equal(prevented, true)
  assert.equal(stopped, false)
})
