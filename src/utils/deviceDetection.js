/**
 * 设备类型检测工具
 * 用于检测用户当前使用的设备类型（手机、平板、电脑）
 */

/**
 * 检测是否为移动设备（手机）
 * @returns {boolean} 如果是手机返回 true，否则返回 false
 */
export function isMobileDevice() {
  // 方法1: 通过屏幕宽度判断（小于768px通常是手机）
  const isMobileWidth = window.innerWidth < 768
  
  // 方法2: 通过 UserAgent 判断
  const userAgent = navigator.userAgent || navigator.vendor || window.opera
  const mobileRegex = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i
  const isMobileUA = mobileRegex.test(userAgent)
  
  // 方法3: 通过触摸支持判断（辅助）
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  
  // 综合判断：屏幕宽度 + UA，或者明确的移动设备 UA
  return (isMobileWidth && hasTouch) || isMobileUA
}

/**
 * 检测是否为平板设备
 * @returns {boolean} 如果是平板返回 true，否则返回 false
 */
export function isTabletDevice() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera
  const tabletRegex = /iPad|Android(?!.*Mobile)|Tablet|PlayBook|Silk/i
  const isTabletUA = tabletRegex.test(userAgent)
  
  // 平板的屏幕宽度通常在 768px 到 1024px 之间
  const isTabletWidth = window.innerWidth >= 768 && window.innerWidth <= 1024
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  
  return isTabletUA || (isTabletWidth && hasTouch)
}

/**
 * 检测是否为桌面设备（电脑）
 * @returns {boolean} 如果是电脑返回 true，否则返回 false
 */
export function isDesktopDevice() {
  return !isMobileDevice() && !isTabletDevice()
}

/**
 * 获取设备类型
 * @returns {'mobile' | 'tablet' | 'desktop'} 设备类型
 */
export function getDeviceType() {
  if (isMobileDevice()) return 'mobile'
  if (isTabletDevice()) return 'tablet'
  return 'desktop'
}

/**
 * 判断历史记录抽屉是否应该默认展开
 * 移动端默认收起，平板和电脑默认展开
 * @returns {boolean} 如果应该默认展开返回 true，否则返回 false
 */
export function shouldHistoryDrawerOpenByDefault() {
  const deviceType = getDeviceType()
  // 只有手机默认收起，平板和电脑默认展开
  return deviceType !== 'mobile'
}

