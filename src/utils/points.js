export function toPointsNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function getEffectivePackagePoints(user) {
  if (!user) return 0
  const expiresAt = user.package_points_expires_at || 0
  if (expiresAt > 0 && expiresAt <= Date.now()) return 0
  return toPointsNumber(user.package_points)
}

// 永久积分卡片包含当前可用的分配余额；账务来源仍分别保存。
export function getPermanentUserPoints(user) {
  return toPointsNumber(user?.points) + toPointsNumber(user?.subuser_points)
}

export function getTotalUserPoints(user) {
  if (!user) return 0
  return getEffectivePackagePoints(user) + toPointsNumber(user.points) + toPointsNumber(user.subuser_points)
}
