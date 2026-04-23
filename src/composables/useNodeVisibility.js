import { ref, onMounted, onUnmounted, nextTick } from 'vue'

/**
 * 检测画布节点是否在浏览器视口内，用于懒加载节点内的图片/视频等重资源。
 * rootMargin 设为 300px，提前开始加载即将进入视口的节点。
 *
 * @param {Ref<HTMLElement|null>} [externalRef] 已有的节点根元素 ref，不传则内部创建
 * @returns {{ isVisible: Ref<boolean>, nodeRef: Ref<HTMLElement|null> }}
 */
export function useNodeVisibility(externalRef) {
  const isVisible = ref(false)
  const nodeRef = externalRef || ref(null)
  let observer = null
  let unmounted = false

  onMounted(() => {
    nextTick(() => {
      if (unmounted) return
      const el = nodeRef.value
      if (!el || !('IntersectionObserver' in window)) {
        isVisible.value = true
        return
      }

      observer = new IntersectionObserver(
        ([entry]) => {
          if (!unmounted) {
            isVisible.value = entry.isIntersecting
          }
        },
        { rootMargin: '300px' }
      )
      observer.observe(el)
    })
  })

  onUnmounted(() => {
    unmounted = true
    if (observer) {
      observer.disconnect()
      observer = null
    }
  })

  return { isVisible, nodeRef }
}
