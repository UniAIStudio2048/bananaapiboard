import test from 'node:test'
import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'canvasStore.js'), 'utf8')

// store setup 函数末尾的 return { ... } 即对外暴露的状态与方法
function getStoreReturnBlock() {
  const start = source.lastIndexOf('\n  return {')
  assert.notEqual(start, -1, 'store return block should exist')
  const end = source.indexOf('\n  }', start)
  assert.notEqual(end, -1, 'store return block should be closed')
  return source.slice(start, end)
}

test('startDragConnection 写入 dragConnectionStartPosition', () => {
  assert.match(source, /const dragConnectionStartPosition = ref\(/)
  assert.match(source, /dragConnectionStartPosition\.value = startPosition/)
})

test('store 对外导出 dragConnectionStartPosition，供 CanvasBoard 绘制临时连线起点', () => {
  const block = getStoreReturnBlock()
  assert.match(block, /\bdragConnectionPosition,/, 'sanity: return block should be the store export block')
  assert.match(
    block,
    /\bdragConnectionStartPosition,/,
    'canvasStore should export dragConnectionStartPosition so CanvasBoard does not fall back to getHandlePosition()'
  )
})

test('Vue Flow 原生 handle 拖到空白处时，pendingConn 不读取 store 的 dragConnectionStartPosition', () => {
  // 原生 handle 拖拽不经过 startDragConnection，store 中此值为重置值 { x: 0, y: 0 }，
  // 若写入 pendingConn.sourcePosition 会让 resolveConnectionSourcePosition 跳过 getHandlePosition 回退，虚拟连线不显示
  const board = readFileSync(join(__dirname, '../../components/canvas/CanvasBoard.vue'), 'utf8')
  const start = board.indexOf('onConnectEnd((event)')
  assert.notEqual(start, -1, 'onConnectEnd handler should exist')
  const pendingStart = board.indexOf('const pendingConn = {', start)
  assert.notEqual(pendingStart, -1, 'onConnectEnd should build pendingConn')
  const pendingBlock = board.slice(pendingStart, board.indexOf('}', pendingStart))
  assert.doesNotMatch(pendingBlock, /canvasStore\.dragConnectionStartPosition/)
})
