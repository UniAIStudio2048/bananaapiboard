// 节点左侧 + 号反向拖拽连线的共用逻辑

export const LEFT_ADD_DRAG_THRESHOLD = 5

/**
 * 拖拽连线结束在另一个节点上时要创建的连线。
 * forward：从当前节点输出拖出，连到对方输入；reverse：从当前节点左侧输入拖出，由对方输出连进来。
 */
export function buildDragConnectionEdge({ direction = 'forward', draggingNodeId, draggingHandleId = 'output', otherNodeId, targetHandleId = null }) {
  if (direction === 'reverse') {
    return { source: otherNodeId, sourceHandle: 'output', target: draggingNodeId, targetHandle: draggingHandleId || 'input' }
  }
  return { source: draggingNodeId, sourceHandle: draggingHandleId, target: otherNodeId, targetHandle: targetHandleId || 'input' }
}

/**
 * 在左侧 + 号按下鼠标后监听移动：移动超过阈值才开始拖拽连线，未移动则保持原来的单击行为。
 * 拖拽结束时吞掉随后可能触发的 click，避免松手在按钮上时又打开菜单。
 * @returns {boolean} 是否开始监听
 */
export function watchLeftAddButtonDrag(event, {
  onDragStart,
  eventTarget = globalThis.document,
  clickTarget = globalThis.window
}) {
  if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false
  event.preventDefault?.()

  const startX = event.clientX
  const startY = event.clientY
  let dragging = false

  const handleMove = (moveEvent) => {
    if (dragging) return
    if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) <= LEFT_ADD_DRAG_THRESHOLD) return
    dragging = true
    onDragStart(moveEvent)
  }

  const handleUp = () => {
    eventTarget.removeEventListener('mousemove', handleMove)
    eventTarget.removeEventListener('mouseup', handleUp)
    if (!dragging) return
    const swallowClick = (clickEvent) => {
      clickEvent.stopPropagation()
      clickEvent.preventDefault()
    }
    clickTarget.addEventListener('click', swallowClick, true)
    setTimeout(() => clickTarget.removeEventListener('click', swallowClick, true), 0)
  }

  eventTarget.addEventListener('mousemove', handleMove)
  eventTarget.addEventListener('mouseup', handleUp)
  return true
}
