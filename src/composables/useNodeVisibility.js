import { ref, onMounted, onUnmounted, nextTick } from 'vue'

/**
 * 检测画布节点是否在浏览器视口内，用于懒加载节点内的图片/视频等重资源。
 *
 * 性能优化：所有节点共用一个 IntersectionObserver 实例。
 * 100 个节点时浏览器只需维护 1 个 observer 而不是 100 个，
 * 显著降低 layout/paint 触发的回调开销。
 *
 * rootMargin 设为 300px，提前开始加载即将进入视口的节点。
 *
 * @param {Ref<HTMLElement|null>} [externalRef] 已有的节点根元素 ref，不传则内部创建
 * @returns {{ isVisible: Ref<boolean>, nodeRef: Ref<HTMLElement|null> }}
 */

// 共享 observer + element → 回调映射
let sharedObserver = null
const callbacks = new WeakMap()

export function isRectNearViewport(rect, {
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 0,
  margin = 300
} = {}) {
  if (!rect) return false
  return rect.right >= -margin &&
    rect.left <= viewportWidth + margin &&
    rect.bottom >= -margin &&
    rect.top <= viewportHeight + margin
}

/**
 * 把可见性同步到 DOM 节点最近的 .vue-flow__node 祖先上（data-node-visible="true|false"）。
 * canvas.css 的 content-visibility: auto 规则依赖这个属性来虚拟化视口外节点。
 * 选中节点（.selected）由 CSS 的 :not(.selected) 选择器豁免，所以这里不需要特殊处理。
 */
function syncNodeVisibilityAttr(el, visible) {
  if (!el || !el.closest) return
  const vfNode = el.closest('.vue-flow__node')
  if (vfNode) vfNode.setAttribute('data-node-visible', visible ? 'true' : 'false')
}

function getSharedObserver() {
  if (sharedObserver) return sharedObserver
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return null

  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const visible = entry.isIntersecting || isRectNearViewport(entry.boundingClientRect)
        const cb = callbacks.get(entry.target)
        if (cb) cb(visible)
        // 双轨：JS 状态用于 v-if，DOM 属性用于 CSS content-visibility 虚拟化
        syncNodeVisibilityAttr(entry.target, visible)
      }
    },
    { rootMargin: '300px' }
  )
  return sharedObserver
}

export function useNodeVisibility(externalRef) {
  const isVisible = ref(false)
  const nodeRef = externalRef || ref(null)
  let observedEl = null
  let unmounted = false

  onMounted(() => {
    nextTick(() => {
      if (unmounted) return
      const el = nodeRef.value
      if (!el) return

      const observer = getSharedObserver()
      if (!observer) {
        // 不支持 IntersectionObserver 时回退为始终可见
        isVisible.value = true
        syncNodeVisibilityAttr(el, true)
        return
      }

      // 默认标记为可见，IntersectionObserver 首次回调前避免被 CSS 误虚拟化
      syncNodeVisibilityAttr(el, true)

      callbacks.set(el, (visible) => {
        if (!unmounted) isVisible.value = visible
      })
      observer.observe(el)
      observedEl = el
    })
  })

  onUnmounted(() => {
    unmounted = true
    if (observedEl && sharedObserver) {
      sharedObserver.unobserve(observedEl)
      callbacks.delete(observedEl)
      observedEl = null
    }
  })

  return { isVisible, nodeRef }
}
