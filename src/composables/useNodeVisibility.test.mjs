import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'useNodeVisibility.js'), 'utf8')

// 关键性能不变量：所有节点必须共用一个 IntersectionObserver
assert.match(
  source,
  /let sharedObserver = null/,
  'useNodeVisibility must share a single IntersectionObserver across all nodes'
)

assert.match(
  source,
  /function getSharedObserver\(\)/,
  'Shared observer should be lazily created via getSharedObserver()'
)

// 回调映射用 WeakMap，节点被销毁时自动清理
assert.match(
  source,
  /const callbacks = new WeakMap\(\)/,
  'Per-element callbacks should use WeakMap so unmounted nodes are GC-able'
)

// 必须 unobserve + delete callback，否则共享 observer 会累积引用
assert.match(
  source,
  /sharedObserver\.unobserve\(observedEl\)/,
  'onUnmounted must unobserve element to avoid leaking references in the shared observer'
)
assert.match(
  source,
  /callbacks\.delete\(observedEl\)/,
  'onUnmounted must delete the callback to free closure references'
)

// rootMargin 必须保持 300px 预加载缓冲（与 P0 lazy loading 协调）
assert.match(
  source,
  /rootMargin: '300px'/,
  'Shared observer must keep 300px pre-load margin so off-screen nodes load before user scrolls into them'
)

// 浏览器不支持时必须回退为始终可见，保证生产环境兼容性
assert.match(
  source,
  /isVisible\.value = true/,
  'Must fall back to always-visible when IntersectionObserver is unavailable'
)

// P1-4: 把可见性同步到 .vue-flow__node 的 data-node-visible 属性，
// canvas.css 用 content-visibility: auto 配合此属性虚拟化视口外节点
assert.match(
  source,
  /function syncNodeVisibilityAttr/,
  'Must expose syncNodeVisibilityAttr to drive CSS content-visibility virtualization'
)
assert.match(
  source,
  /closest\('\.vue-flow__node'\)/,
  'Visibility attr must be set on the Vue Flow node wrapper so CSS [data-node-visible=...] selectors match'
)
assert.match(
  source,
  /setAttribute\('data-node-visible'/,
  'Must set data-node-visible attribute on the Vue Flow wrapper'
)

console.log('useNodeVisibility shared-observer tests passed')
