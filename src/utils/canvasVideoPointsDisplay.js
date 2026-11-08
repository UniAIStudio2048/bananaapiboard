import { formatPoints } from './format.js'

// 仅用于画布视频节点展示；不参与积分扣费或余额校验。
export function formatVideoNodePoints(value) {
  return formatPoints(value)
}
