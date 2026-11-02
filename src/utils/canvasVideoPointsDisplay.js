// 仅用于画布视频节点展示；不参与积分扣费或余额校验。
export function formatVideoNodePoints(value) {
  const points = Number(value)
  if (!Number.isFinite(points)) return '0.0'
  return (Math.round((points + Number.EPSILON) * 10) / 10).toFixed(1)
}
