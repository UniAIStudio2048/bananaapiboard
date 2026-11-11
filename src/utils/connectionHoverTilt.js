// 拖拽连线时悬停节点的压力下沉效果（参考 flwoxpro AI 媒体流）：
// 鼠标越靠近卡片边缘，该侧越往屏幕里压，对侧轻微上扬。

export const CONNECT_TILT_MAX_DEG = 18
export const CONNECT_TILT_CARD_SELECTOR = [
  '.node-card',
  '.text-node-card',
  '.breakdown-node',
  '.canvas-node-content',
  '.digital-human-card',
  '.character-card-node',
  '.script-node',
  '.director-studio-node'
].join(', ')

const clampUnit = value => Math.max(-1, Math.min(1, value))

/**
 * @param {{ pointX: number, pointY: number, rect: { left: number, top: number, width: number, height: number }, maxAngle?: number }} input
 *   rect 为卡片未倾斜时的屏幕矩形
 * @returns {{ rotateX: number, rotateY: number } | null} 鼠标不在卡片内时返回 null
 */
export function getConnectionHoverTilt({ pointX, pointY, rect, maxAngle = CONNECT_TILT_MAX_DEG }) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  if (pointX < rect.left || pointX > right || pointY < rect.top || pointY > bottom) return null

  const dx = (pointX - (rect.left + rect.width / 2)) / (rect.width / 2)
  const dy = (pointY - (rect.top + rect.height / 2)) / (rect.height / 2)
  // rotateX 为正时上沿远离屏幕；rotateY 为负时左沿远离屏幕
  return {
    rotateX: -clampUnit(dy) * maxAngle + 0,
    rotateY: clampUnit(dx) * maxAngle + 0
  }
}
