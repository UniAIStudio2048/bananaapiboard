export function toPointsNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function getTotalUserPoints(user) {
  if (!user) return 0
  return toPointsNumber(user.package_points) + toPointsNumber(user.points)
}
