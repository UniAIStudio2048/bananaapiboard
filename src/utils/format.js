/**
 * 格式化积分显示
 * 最多保留两位小数，第三位四舍五入，去掉尾随 0
 * @param {number} points - 积分值
 * @returns {string} 格式化后的积分字符串
 */
export function formatPoints(points) {
  if (points === null || points === undefined) {
    return '0'
  }
  
  const num = Number(points)
  if (isNaN(num)) {
    return '0'
  }

  const rounded = Math.sign(num) * Math.round((Math.abs(num) + Number.EPSILON) * 100) / 100
  const normalized = Object.is(rounded, -0) ? 0 : rounded

  return normalized.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * 汇总当前空间的可用积分（团队积分 + 套餐积分 + 永久积分）并格式化
 * 个人空间时 teamPoints 为 0，结果等价于套餐 + 永久
 * @param {number|string} teamPoints - 团队积分
 * @param {number|string} packagePoints - 套餐积分
 * @param {number|string} permanentPoints - 永久积分
 * @returns {string} 格式化后的积分字符串
 */
export function sumPoints(teamPoints, packagePoints, permanentPoints) {
  const team = parseFloat(teamPoints) || 0
  const pkg = parseFloat(packagePoints) || 0
  const perm = parseFloat(permanentPoints) || 0
  return formatPoints(team + pkg + perm)
}

/**
 * 格式化余额显示（分转元）
 * @param {number} balance - 余额（单位：分）
 * @returns {string} 格式化后的余额字符串
 */
export function formatBalance(balance) {
  if (balance === null || balance === undefined) {
    return '0.00'
  }
  
  const num = Number(balance)
  if (isNaN(num)) {
    return '0.00'
  }
  
  // 转换为元并保留两位小数
  return (num / 100).toFixed(2)
}

/**
 * 格式化数字，添加千分位分隔符
 * @param {number} num - 数字
 * @returns {string} 格式化后的字符串
 */
export function formatNumber(num) {
  if (num === null || num === undefined) {
    return '0'
  }
  
  const n = Number(num)
  if (isNaN(n)) {
    return '0'
  }
  
  return n.toLocaleString('zh-CN')
}
