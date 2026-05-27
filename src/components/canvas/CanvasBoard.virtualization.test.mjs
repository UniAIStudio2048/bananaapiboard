/**
 * CanvasBoard 虚拟化集成契约测试
 * 运行：node bananaapiboard/src/components/canvas/CanvasBoard.virtualization.test.mjs
 */
import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(__dirname, 'CanvasBoard.vue'), 'utf8')

assert.match(
  src,
  /import\s*{\s*createVirtualizedNodeType\s*}\s*from\s*['"]\.\/VirtualizedNode\.js['"]/,
  'CanvasBoard 必须导入 createVirtualizedNodeType HOC'
)

assert.match(
  src,
  /import\s*{\s*createCanvasVirtualization\s*}\s*from\s*['"]@\/composables\/useCanvasVirtualization\.js['"]/,
  'CanvasBoard 必须导入 createCanvasVirtualization 控制器'
)

assert.match(
  src,
  /provide\(\s*['"]canvasVirtualization['"]/,
  'CanvasBoard 必须通过 provide 把虚拟化控制器注入给 HOC'
)

// 关键节点类型必须经过 HOC 包装
const wrappedTypes = ['TextNode', 'ImageNode', 'VideoNode', 'AudioNode', 'LLMNode']
for (const type of wrappedTypes) {
  assert.match(
    src,
    new RegExp(`V\\(${type}\\)|createVirtualizedNodeType\\(${type}\\b`),
    `节点类型 ${type} 必须经过虚拟化 HOC 包装`
  )
}

// group 节点必须用 alwaysReal:true（它是其他节点的视觉容器）
assert.match(
  src,
  /['"]group['"]\s*:\s*V\(\s*GroupNode\s*,\s*\{\s*alwaysReal:\s*true/,
  'group 节点必须以 alwaysReal:true 方式包装'
)

// 必须保留 onlyRenderVisibleElements=false（与 CanvasBoard.performance.test.mjs 互锁）
assert.match(
  src,
  /:only-render-visible-elements="false"/,
  '虚拟化 HOC 不能取代 onlyRenderVisibleElements 契约'
)

// 选中节点集合必须包含单选和多选两个来源
assert.match(
  src,
  /virtualizationSelectedIds[\s\S]{0,200}selectedNodeId/,
  '虚拟化选中集合必须读取 selectedNodeId（单选）'
)
assert.match(
  src,
  /virtualizationSelectedIds[\s\S]{0,200}selectedNodeIds/,
  '虚拟化选中集合必须读取 selectedNodeIds（多选）'
)

console.log('CanvasBoard virtualization integration tests passed')
