// 用户分组倍率：前端读取当前用户所在分组的节点倍率，用于预估积分与实际扣费一致。
// 后端在计费环节权威应用倍率（applyNodeRate / getUserNodeRate）；
// 此处仅用于用户端展示层预估，不参与实际扣费。
//
// nodeType: 'text' | 'image' | 'video' | 'audio'
// 返回数值倍率；未登录 / 无分组 / 非法值统一回退 1.0。

const RATE_KEYS = {
  text: 'rate_text',
  image: 'rate_image',
  video: 'rate_video',
  audio: 'rate_audio'
}

export function getUserNodeRate(nodeType = 'image') {
  if (typeof localStorage === 'undefined') return 1.0
  let user = null
  try {
    user = JSON.parse(localStorage.getItem('user') || 'null')
  } catch (e) {
    user = null
  }
  const group = user?.user_group
  if (!group) return 1.0
  const key = RATE_KEYS[nodeType]
  if (!key) return 1.0
  const rate = Number(group[key])
  return Number.isFinite(rate) && rate > 0 ? rate : 1.0
}

// 将基础成本乘以用户所在分组对应倍率（保留小数，由调用方决定是否取整）
export function applyUserNodeRate(cost, nodeType = 'image') {
  const base = Number(cost)
  if (!Number.isFinite(base)) return base
  return base * getUserNodeRate(nodeType)
}
