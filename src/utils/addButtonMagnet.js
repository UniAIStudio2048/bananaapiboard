// 节点两侧 + 号的磁吸跟随（参考 libtv）。
// 感应圆（直径 2 * ADD_BTN_HIT_RADIUS）内侧贴着节点边，圆心比 + 号静止位置再往外偏
// ADD_BTN_HIT_OUTWARD_OFFSET；鼠标在圆内时 + 号中心 1:1 跟随鼠标，但离圆心不超过 ADD_BTN_FOLLOW_RADIUS。
// 所有长度都是节点内的本地单位（随画布缩放）。

export const ADD_BTN_HIT_RADIUS = 48
export const ADD_BTN_FOLLOW_RADIUS = 30
export const ADD_BTN_HIT_OUTWARD_OFFSET = 14

/**
 * 计算 + 号相对静止位置的平移量（本地单位）。
 * @param {{ pointerX: number, pointerY: number, restCenterX: number, restCenterY: number, zoom: number, side: 'left' | 'right' }} input
 *   pointer / restCenter 为屏幕坐标，restCenter 是 + 号未平移时的中心
 */
export function getAddButtonFollowOffset({ pointerX, pointerY, restCenterX, restCenterY, zoom, side }) {
  const outward = (side === 'left' ? -1 : 1) * ADD_BTN_HIT_OUTWARD_OFFSET
  const scale = zoom > 0 ? zoom : 1
  let dx = (pointerX - restCenterX) / scale - outward
  let dy = (pointerY - restCenterY) / scale
  const distance = Math.hypot(dx, dy)
  if (distance > ADD_BTN_FOLLOW_RADIUS) {
    dx *= ADD_BTN_FOLLOW_RADIUS / distance
    dy *= ADD_BTN_FOLLOW_RADIUS / distance
  }
  return { x: dx + outward, y: dy }
}
