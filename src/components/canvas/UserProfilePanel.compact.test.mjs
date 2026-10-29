import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../../styles/canvas-chrome.css', import.meta.url), 'utf8')
const profile = readFileSync(new URL('./UserProfilePanel.vue', import.meta.url), 'utf8')

assert.match(css, /\.canvas-icon-btn:not\(\.canvas-skills-btn\):not\(\.canvas-cart-btn\)/, '顶部统一样式应排除 Skills 和购物车')
assert.doesNotMatch(css, /canvas-skills-btn::(?:before|after)\s*[{,]/, 'Skills 原有装饰应可显示')
assert.match(css, /\.profile-panel \.action-icon\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px/s, '快捷操作图标应缩小为 16px')
assert.match(css, /\.profile-panel \.quick-actions\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s, '快捷操作应使用紧凑两列布局')
assert.match(profile, /@click="activeMenu = 'packages'"/)
assert.match(profile, /@click="openRechargePanel"/)
console.log('个人中心紧凑布局与顶部按钮样式检查通过')
