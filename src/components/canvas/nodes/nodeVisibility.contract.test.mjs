/**
 * 节点可见性契约测试
 *
 * 锁定：所有重型自定义节点都必须接入 useNodeVisibility，否则当 HOC 虚拟化
 *      被禁用（节点数 < 200）时无法享受 content-visibility 浏览器原生虚拟化。
 *
 * 运行：node bananaapiboard/src/components/canvas/nodes/nodeVisibility.contract.test.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 必须接入 useNodeVisibility 的节点（重渲染类型）
const REQUIRED = [
  'TextNode.vue',
  'ImageNode.vue',
  'VideoNode.vue',
  'AudioNode.vue',
  'StoryboardNode.vue'
]

for (const file of REQUIRED) {
  const src = readFileSync(join(__dirname, file), 'utf8')
  assert.match(
    src,
    /import\s*{\s*useNodeVisibility\s*}\s*from\s*['"]@\/composables\/useNodeVisibility['"]/,
    `${file} 必须 import useNodeVisibility`
  )
  assert.match(
    src,
    /useNodeVisibility\s*\(/,
    `${file} 必须调用 useNodeVisibility(rootRef) 把 data-node-visible 写到 vue-flow 节点上`
  )
}

// 校验 GroupNode / PreviewNode 不强制要求，但 Group 因为是视觉容器也不应被虚拟化
// 仅作为提示输出
const optional = ['GroupNode.vue', 'PreviewNode.vue', 'LLMNode.vue']
for (const file of optional) {
  try {
    const src = readFileSync(join(__dirname, file), 'utf8')
    const has = /useNodeVisibility/.test(src)
    console.log(`${file}: ${has ? '已接入' : '未接入（可选）'}`)
  } catch (e) {
    // 文件不存在则跳过
  }
}

console.log('Node visibility contract tests passed')
