import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONNECT_TILT_MAX_DEG, CONNECT_TILT_CARD_SELECTOR, getConnectionHoverTilt } from './connectionHoverTilt.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rect = { left: 100, top: 200, width: 200, height: 100 }
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)

test('center of the card has no tilt', () => {
  const tilt = getConnectionHoverTilt({ pointX: 200, pointY: 250, rect })
  near(tilt.rotateX, 0)
  near(tilt.rotateY, 0)
})

test('top-left corner sinks: positive rotateX (top away) and negative rotateY (left away)', () => {
  const tilt = getConnectionHoverTilt({ pointX: 100, pointY: 200, rect })
  near(tilt.rotateX, CONNECT_TILT_MAX_DEG)
  near(tilt.rotateY, -CONNECT_TILT_MAX_DEG)
})

test('tilt grows toward the edges and follows the pointer to the right side', () => {
  const half = getConnectionHoverTilt({ pointX: 250, pointY: 250, rect })
  near(half.rotateY, CONNECT_TILT_MAX_DEG / 2)
  near(half.rotateX, 0)
  const edge = getConnectionHoverTilt({ pointX: 300, pointY: 275, rect })
  near(edge.rotateY, CONNECT_TILT_MAX_DEG)
  near(edge.rotateX, -CONNECT_TILT_MAX_DEG / 2)
})

test('pointer outside the card gives no tilt', () => {
  assert.equal(getConnectionHoverTilt({ pointX: 99, pointY: 250, rect }), null)
  assert.equal(getConnectionHoverTilt({ pointX: 200, pointY: 301, rect }), null)
  assert.equal(getConnectionHoverTilt({ pointX: 200, pointY: 250, rect: { left: 0, top: 0, width: 0, height: 0 } }), null)
})

test('card selector covers every connectable node card', () => {
  for (const cls of ['.node-card', '.text-node-card', '.breakdown-node', '.canvas-node-content', '.script-node', '.director-studio-node']) {
    assert.ok(CONNECT_TILT_CARD_SELECTOR.includes(cls), cls)
  }
})

test('canvas board tilts the hovered card while dragging a connection and resets afterwards', () => {
  const source = readFileSync(join(__dirname, '../components/canvas/CanvasBoard.vue'), 'utf8')
  assert.match(source, /import \{[^}]*getConnectionHoverTilt[^}]*\} from '@\/utils\/connectionHoverTilt\.js'/)
  const move = source.match(/function handleGlobalDragConnectionMove\(event\) \{[\s\S]*?\n\}/)
  assert.ok(move)
  assert.match(move[0], /updateConnectionHoverTilt\(event\)/)
  assert.match(source, /function clearConnectionHoverTilt\(\)/)
  const watcher = source.match(/\/\/ 拖拽结束（包括成功连接\/取消）时，确保清理监听器[\s\S]*?\n  \}/)
  assert.ok(watcher)
  assert.match(watcher[0], /clearConnectionHoverTilt\(\)/)
  assert.match(source, /prefers-reduced-motion: reduce/)
  assert.match(source, /\[data-connect-tilt="true"\]\)\s*\{[\s\S]*?perspective\(900px\) rotateX\(var\(--connect-tilt-x, 0deg\)\) rotateY\(var\(--connect-tilt-y, 0deg\)\)/)
})
