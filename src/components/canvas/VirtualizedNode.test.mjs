/**
 * VirtualizedNode 契约测试
 * 运行：node bananaapiboard/src/components/canvas/VirtualizedNode.test.mjs
 *
 * 注意：使用 Node 测试无 DOM，只校验代码结构契约（不执行渲染）。
 */
import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(__dirname, 'VirtualizedNode.js'), 'utf8')

assert.match(src, /createVirtualizedNodeType/, '必须导出 createVirtualizedNodeType')
assert.match(src, /import NodeShell from/, '必须使用 NodeShell 作为 fallback')
assert.match(src, /inheritAttrs:\s*false/, 'HOC 必须设置 inheritAttrs:false 避免外层 DOM')

// 关键契约：选中、拖拽中、group 节点不能进入 shell
assert.match(src, /props\.selected\s*===\s*true/, '选中节点必须强制走真组件')
assert.match(src, /props\.dragging\s*===\s*true/, '拖拽中节点必须强制走真组件')
assert.match(src, /alwaysReal/, '必须支持 alwaysReal 选项（用于 group 节点等）')

// 必须显式声明 Vue Flow 的标准节点 props，否则透传会丢失
const requiredProps = [
  'id', 'type', 'data', 'selected', 'dragging', 'connectable',
  'position', 'zIndex', 'targetPosition', 'sourcePosition', 'dimensions'
]
for (const p of requiredProps) {
  assert.match(
    src,
    new RegExp(`['\"]${p}['\"]`),
    `必须在透传列表中声明 Vue Flow 节点 prop: ${p}`
  )
}

// NodeShell 文件契约
const shellSrc = readFileSync(join(__dirname, 'NodeShell.vue'), 'utf8')
assert.match(shellSrc, /pointer-events:\s*none/, 'NodeShell 必须禁用鼠标事件，否则会拦截画布右键菜单')
assert.match(shellSrc, /contain:\s*layout style/, 'NodeShell 应启用 CSS contain 隔离渲染')
// 检查 NodeShell 的 import / 调用是否引入了重型依赖
const shellImports = shellSrc.match(/^import .+$/gm) || []
const importsStr = shellImports.join('\n')
assert.ok(
  !/useCanvasStore|useVueFlow/.test(importsStr),
  `NodeShell 严禁 import useCanvasStore / useVueFlow，否则失去虚拟化意义。\n当前 imports:\n${importsStr}`
)
// 也不应在脚本中调用这些 composable
assert.ok(
  !/useCanvasStore\s*\(|useVueFlow\s*\(/.test(shellSrc),
  'NodeShell 严禁调用 useCanvasStore() 或 useVueFlow()'
)

console.log('VirtualizedNode contract tests passed')
