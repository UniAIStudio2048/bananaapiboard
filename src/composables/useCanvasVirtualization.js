import { ref, computed, watch, onScopeDispose, shallowRef } from 'vue'

/**
 * 画布节点真虚拟化控制器
 *
 * 与已有的 useNodeVisibility（IntersectionObserver + content-visibility）不同，
 * 本控制器在 Vue 组件层卸载 / 挂载重量节点：
 *
 *   - 节点总数 ≤ threshold 时：完全禁用（不增加额外开销）
 *   - 节点总数 > threshold 时：仅"视口 + buffer"内的节点 + 当前选中节点
 *     挂载完整节点组件，其余节点改为渲染 NodeShell 轻骨架
 *
 * 选中节点永远渲染完整组件，避免缩放 / 平移时被卸载（这是
 * CanvasBoard.performance.test.mjs 锁定的契约：onlyRenderVisibleElements=false）。
 *
 * 用法（在画布根组件中调用一次）：
 *   const virt = createCanvasVirtualization({ nodes, viewport, containerRef, selectedIds })
 *   provide('canvasVirtualization', virt)
 *
 * 用法（在 VirtualizedNode HOC 中）：
 *   const virt = inject('canvasVirtualization', null)
 *   const isShell = computed(() => virt && !props.selected && virt.shellIds.value.has(props.id))
 *
 * @param {Object} options
 * @param {import('vue').Ref<Array>} options.nodes 完整节点数组
 * @param {import('vue').Ref<{x:number,y:number,zoom:number}>} options.viewport 当前画布视口
 * @param {import('vue').Ref<HTMLElement|null>} options.containerRef 画布容器（用于读取宽高）
 * @param {import('vue').Ref<Set<string>>} [options.selectedIds] 当前选中节点 ID 集合
 * @param {number} [options.threshold=200] 节点总数阈值，超过才启用虚拟化
 * @param {number} [options.bufferRatio=1.5] 视口缓冲倍数（1.5 表示视口外延 0.5 屏）
 * @param {import('vue').Ref<boolean>} [options.forceDisable] 外部强制禁用开关
 */
export function createCanvasVirtualization({
  nodes,
  viewport,
  containerRef,
  selectedIds,
  threshold = 200,
  bufferRatio = 1.5,
  forceDisable
} = {}) {
  if (!nodes || !viewport) {
    throw new Error('[CanvasVirtualization] nodes 和 viewport 必须提供')
  }

  // 视口外节点 ID 集合，用 shallowRef 减少深响应开销
  const shellIds = shallowRef(new Set())

  // 当前控制器是否启用渲染替换
  const isEnabled = computed(() => {
    if (forceDisable && forceDisable.value === true) return false
    return (nodes.value?.length || 0) > threshold
  })

  let raf = null
  let pendingDirty = false

  function calculateShells() {
    raf = null
    if (!isEnabled.value) {
      if (shellIds.value.size > 0) shellIds.value = new Set()
      return
    }

    const container = containerRef?.value
    const vp = viewport.value
    if (!container || !vp) return

    const zoom = vp.zoom || 1
    const rect = container.getBoundingClientRect ? container.getBoundingClientRect() : { width: 0, height: 0 }
    if (!rect.width || !rect.height) {
      // 容器尚未布局，下一帧再试
      shellIds.value = new Set()
      return
    }

    // 视口在画布坐标系中的范围
    const flowLeft = -vp.x / zoom
    const flowTop = -vp.y / zoom
    const viewW = rect.width / zoom
    const viewH = rect.height / zoom
    const bufW = viewW * (Math.max(bufferRatio, 1) - 1)
    const bufH = viewH * (Math.max(bufferRatio, 1) - 1)
    const minX = flowLeft - bufW
    const minY = flowTop - bufH
    const maxX = flowLeft + viewW + bufW
    const maxY = flowTop + viewH + bufH

    const sel = selectedIds?.value
    const next = new Set()
    const list = nodes.value
    if (!Array.isArray(list)) {
      shellIds.value = new Set()
      return
    }

    for (let i = 0; i < list.length; i++) {
      const node = list[i]
      if (!node || !node.position) continue
      // 选中节点永不进入 shell
      if (sel && sel.has && sel.has(node.id)) continue
      // 编组节点（背景）也不进入 shell，避免成员节点失去视觉容器
      if (node.type === 'group') continue

      const w = (typeof node.width === 'number' && node.width > 0) ? node.width : 380
      const h = (typeof node.height === 'number' && node.height > 0) ? node.height : 240
      const right = node.position.x + w
      const bottom = node.position.y + h
      if (right < minX || node.position.x > maxX || bottom < minY || node.position.y > maxY) {
        next.add(node.id)
      }
    }

    // 内容相同则不更新引用，避免触发不必要的子组件 re-evaluate
    const cur = shellIds.value
    if (cur.size === next.size) {
      let same = true
      for (const id of next) {
        if (!cur.has(id)) { same = false; break }
      }
      if (same) return
    }
    shellIds.value = next
  }

  function scheduleRecalc() {
    if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') {
      // SSR / 测试环境：直接计算
      calculateShells()
      return
    }
    if (raf !== null) {
      pendingDirty = true
      return
    }
    raf = requestAnimationFrame(() => {
      const wasDirty = pendingDirty
      pendingDirty = false
      calculateShells()
      if (wasDirty && raf === null) scheduleRecalc()
    })
  }

  // 触发条件：节点数量变化、视口变化、选中集合变化、启用状态变化
  const stops = [
    watch(() => nodes.value?.length || 0, scheduleRecalc),
    watch(() => viewport.value, scheduleRecalc, { deep: true }),
    watch(() => selectedIds?.value ? selectedIds.value.size : 0, scheduleRecalc),
    watch(isEnabled, scheduleRecalc)
  ]

  // 初始计算延迟一帧，等待容器挂载完成
  scheduleRecalc()

  function dispose() {
    if (raf !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(raf)
      raf = null
    }
    stops.forEach(s => s())
  }

  onScopeDispose(() => dispose())

  return {
    isEnabled,
    shellIds,
    recalculate: scheduleRecalc,
    dispose
  }
}

/**
 * 给单个节点用的 helper：返回该节点是否应该渲染为 Shell
 *
 * @param {Object|null} virtualization createCanvasVirtualization 返回的实例（可能为 null）
 * @param {string} nodeId 节点 ID
 * @param {import('vue').Ref<boolean>} selectedRef 当前节点是否选中（响应式）
 * @returns {import('vue').ComputedRef<boolean>}
 */
export function useNodeShellState(virtualization, nodeId, selectedRef) {
  return computed(() => {
    if (!virtualization) return false
    if (selectedRef && selectedRef.value === true) return false
    return virtualization.shellIds.value.has(nodeId)
  })
}

export default createCanvasVirtualization
