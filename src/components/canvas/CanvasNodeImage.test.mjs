import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'CanvasNodeImage.vue'), 'utf8')

// ============================================================
// 核心契约：预加载守护避免档位切换闪烁
// ============================================================

// 1) 必须用 new Image() 后台预加载
assert.match(
  source,
  /preloader = new Image\(\)/,
  'Must use new Image() for background preloading to avoid src-switch flicker'
)

// 2) 必须优先使用 img.decode() API（替代 onload）
//    onload 只表示下载完成，decode() 表示像素已解码，<img> 拿到 src 后零 paint 抖动
assert.match(
  source,
  /typeof preloader\.decode === 'function'/,
  'Must prefer img.decode() over onload to eliminate paint flicker (web.dev best practice)'
)
assert.match(
  source,
  /preloader\.decode\(\)\.then\(\(\) => commit\(true\)\)/,
  'decode() success path must commit the new src'
)
assert.match(
  source,
  /\.catch\(\(\) => commit\(false\)\)/,
  'decode() failure path must still commit so <img @error> fallback can run'
)

// 2b) 老浏览器回退到 onload（向后兼容）
assert.match(
  source,
  /preloader\.onload = \(\) => commit\(true\)/,
  'Must fall back to onload when decode() is unavailable (older browsers)'
)

// 3) blob:/data: 必须跳过预加载（这些是本地资源，预加载多此一举）
assert.match(
  source,
  /next\.startsWith\('blob:'\) \|\| next\.startsWith\('data:'\)/,
  'blob:/data: URIs should skip preloading'
)

// 4) 预加载失败时必须仍切换 src，让 <img @error> 接管回退（否则永远卡在旧图）
//    commit(false) 内会执行 displaySrc.value = next，但不 emit 'load'
assert.match(
  source,
  /const commit = \(ok\) => \{[\s\S]*?displaySrc\.value = next[\s\S]*?if \(ok\) emit\('load'\)/,
  'commit() must always update displaySrc but only emit load on success, so failed cases still trigger <img @error> fallback'
)

// 5) 必须接上 onCanvasImageError 做原图回退（受 autoFallback prop 控制）
assert.match(
  source,
  /if \(props\.autoFallback\) onCanvasImageError\(event\)/,
  'Render-time errors must trigger original-URL fallback when autoFallback is enabled'
)

// 5b) autoFallback prop 必须存在且默认 true（默认行为是保护图片永不空白）
assert.match(
  source,
  /autoFallback:\s*\{\s*type:\s*Boolean,\s*default:\s*true\s*\}/,
  'autoFallback prop must default to true so basic <CanvasNodeImage :src=...> usage gets fallback protection'
)

// 6) 卸载时必须清理预加载器，避免内存泄漏 / 已卸载组件接收回调
assert.match(
  source,
  /onBeforeUnmount\(\(\) => \{[\s\S]*?cleanupPreloader\(\)/,
  'Must cleanup preloader on unmount to avoid leaks'
)

// 6b) 必须有 pendingToken 防竞态：连续 src 变化时，旧 decode promise resolve 不应覆盖新值
assert.match(
  source,
  /let pendingToken = 0/,
  'Must use a token counter to avoid stale decode-promise races (out-of-order resolve)'
)
assert.match(
  source,
  /const token = \+\+pendingToken/,
  'Each src change must increment the token'
)
assert.match(
  source,
  /if \(token !== pendingToken\) return/,
  'commit must check token freshness before applying displaySrc'
)

// 7) inheritAttrs: false 确保 src 不被 $attrs 重复绑定
assert.match(
  source,
  /inheritAttrs:\s*false/,
  'Must disable attribute inheritance to avoid double src binding'
)

// 8) 模板必须用 v-bind="$attrs" 透传所有属性（class/loading/decoding/alt 等）
assert.match(
  source,
  /v-bind="\$attrs"/,
  'Template must spread attrs so loading/decoding/class/alt pass through'
)

// 9) 初始 displaySrc 应等于 props.src（首次渲染不等待）
assert.match(
  source,
  /const displaySrc = ref\(props\.src \|\| ''\)/,
  'Initial displaySrc must equal props.src so first render is immediate, not delayed by preload'
)

console.log('CanvasNodeImage flicker-prevention tests passed')
