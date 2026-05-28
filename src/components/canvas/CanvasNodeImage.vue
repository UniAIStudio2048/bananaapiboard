<script setup>
/**
 * 画布节点图片：消除 LOD 档位切换时的闪烁
 *
 * 问题：当 zoom 跨档（如 768 → 1280）时，<img :src> 变化会触发浏览器
 *      重新解码图片，期间元素短暂空白，视觉上闪一下。
 *      onload 只表示下载完成，并不代表 decode 完成 ——
 *      即使图片已在 HTTP 缓存里（"第二次访问也闪"），<img> src 切换
 *      仍会触发新一轮 decode。
 *
 * 方案：用 img.decode() API（替代 onload）确保解码完成后才切换 src。
 *      <img> 拿到 src 时浏览器内部已有 decoded raster，paint 零等待。
 *
 *      Web 标准做法（web.dev 推荐），现代浏览器支持广泛（Chrome 63+,
 *      Firefox 63+, Safari 14+），不支持时回退到 onload。
 *
 * 错误处理：
 *   - 预加载/decode 失败：仍切换 src，让 <img @error> 接管原图回退
 *   - 渲染时加载失败：autoFallback=true 时调 onCanvasImageError
 *
 * 透传：
 *   - inheritAttrs: false（避免 src 重复绑定）
 *   - 所有 attrs 透传到内部 <img>（class/loading/decoding/alt 等）
 */
import { ref, watch, onBeforeUnmount } from 'vue'
import { onCanvasImageError } from '@/utils/canvasThumbnail'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  src: { type: String, default: '' },
  // 是否自动用 onCanvasImageError 回退到原图。
  // 父组件有自定义 @error 处理时（如 ImageNode.handleOutputImageError）应设为 false，
  // 避免自动回退后父组件又触发时间戳重试导致重复加载。
  autoFallback: { type: Boolean, default: true }
})

const emit = defineEmits(['error', 'load'])

const displaySrc = ref(props.src || '')
let preloader = null
let pendingToken = 0

function cleanupPreloader() {
  if (preloader) {
    preloader.onload = null
    preloader.onerror = null
    preloader.src = ''
    preloader = null
  }
}

watch(
  () => props.src,
  (next) => {
    // token 自增，确保过期 promise resolve 时不会错误地切换到旧目标
    const token = ++pendingToken

    if (!next) {
      displaySrc.value = ''
      cleanupPreloader()
      return
    }
    if (next === displaySrc.value) return

    cleanupPreloader()

    // blob: / data: URI 没必要预加载，直接切换
    if (next.startsWith('blob:') || next.startsWith('data:')) {
      displaySrc.value = next
      return
    }

    preloader = new Image()
    preloader.src = next

    const commit = (ok) => {
      // token 不一致说明已有更新的 src 在加载，丢弃本次结果
      if (token !== pendingToken) return
      cleanupPreloader()
      displaySrc.value = next
      if (ok) emit('load')
    }

    // 优先使用 decode() —— resolve 时表示像素已完全解码到内存，
    // <img> 切换 src 时浏览器从 decoded cache 直接 paint，无 decode 抖动
    if (typeof preloader.decode === 'function') {
      preloader.decode().then(() => commit(true)).catch(() => commit(false))
    } else {
      // 老浏览器回退到 onload（功能等效但 paint 时仍可能有 decode 抖动）
      preloader.onload = () => commit(true)
      preloader.onerror = () => commit(false)
    }
  }
)

onBeforeUnmount(() => {
  pendingToken++ // 让所有 in-flight decode promise 失效
  cleanupPreloader()
})

function handleError(event) {
  if (props.autoFallback) onCanvasImageError(event)
  emit('error', event)
}

function handleLoad(event) {
  emit('load', event)
}
</script>

<template>
  <img
    v-if="displaySrc"
    v-bind="$attrs"
    :src="displaySrc"
    @load="handleLoad"
    @error="handleError"
  />
</template>
