import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ADD_BTN_FOLLOW_RADIUS,
  ADD_BTN_HIT_OUTWARD_OFFSET,
  getAddButtonFollowOffset
} from './addButtonMagnet.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`)

test('button center follows the pointer 1:1 inside the follow radius', () => {
  const offset = getAddButtonFollowOffset({
    pointerX: 110, pointerY: 95, restCenterX: 100, restCenterY: 100, zoom: 1, side: 'right'
  })
  near(offset.x, 10)
  near(offset.y, -5)
})

test('pointer distance is converted from screen pixels to node-local units by zoom', () => {
  const offset = getAddButtonFollowOffset({
    pointerX: 120, pointerY: 100, restCenterX: 100, restCenterY: 100, zoom: 2, side: 'right'
  })
  near(offset.x, 10)
  near(offset.y, 0)
})

test('follow is clamped to a radius around the hit circle center, which sits outward of the rest position', () => {
  const right = getAddButtonFollowOffset({
    pointerX: 300, pointerY: 100, restCenterX: 100, restCenterY: 100, zoom: 1, side: 'right'
  })
  near(right.x, ADD_BTN_HIT_OUTWARD_OFFSET + ADD_BTN_FOLLOW_RADIUS)
  near(right.y, 0)

  const left = getAddButtonFollowOffset({
    pointerX: -100, pointerY: 100, restCenterX: 100, restCenterY: 100, zoom: 1, side: 'left'
  })
  near(left.x, -(ADD_BTN_HIT_OUTWARD_OFFSET + ADD_BTN_FOLLOW_RADIUS))

  const up = getAddButtonFollowOffset({
    pointerX: 100 + ADD_BTN_HIT_OUTWARD_OFFSET, pointerY: -500, restCenterX: 100, restCenterY: 100, zoom: 1, side: 'right'
  })
  near(up.x, ADD_BTN_HIT_OUTWARD_OFFSET)
  near(up.y, -ADD_BTN_FOLLOW_RADIUS)
})

test('canvas board wires the add button magnet with a fixed hit circle and spring return', () => {
  const source = readFileSync(join(__dirname, '../components/canvas/CanvasBoard.vue'), 'utf8')
  assert.match(source, /import \{[^}]*getAddButtonFollowOffset[^}]*\} from '@\/utils\/addButtonMagnet\.js'/)
  assert.match(source, /@pointermove="handleCanvasPointerMove"/)
  assert.match(source, /function updateAddButtonMagnet\(event\)/)
  assert.match(source, /@property --add-btn-follow-x/)
  assert.match(source, /translate: var\(--add-btn-follow-x\) var\(--add-btn-follow-y\)/)
  assert.match(source, /\.node-add-btn\)::before/)
  assert.match(source, /--add-btn-follow-x 80ms ease-out/)
  assert.match(source, /--add-btn-follow-x 400ms cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/)
})
