/**
 * 格式化积分显示
 * 最多保留一位小数，直接截断，不四舍五入
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

  const truncated = Math.trunc(num * 10) / 10
  const normalized = Object.is(truncated, -0) ? 0 : truncated

  return normalized.toFixed(1).replace(/\.0$/, '')
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
