// 浏览器标题：公开可收录页面显示「页面名 - 站点名」，其余页面保持站点名
const DEFAULT_SITE_TITLE = 'ai绘图创作'

let currentPageTitle = ''
let currentSiteTitle = ''

export function composeDocumentTitle(pageTitle, siteTitle) {
  const site = siteTitle || DEFAULT_SITE_TITLE
  return pageTitle ? `${pageTitle} - ${site}` : site
}

export function isIndexableRoute(route) {
  return !route?.meta?.requiresAuth && !route?.meta?.noindex
}

export function setPageTitle(pageTitle, siteTitle) {
  currentPageTitle = pageTitle || ''
  if (siteTitle) currentSiteTitle = siteTitle
  document.title = composeDocumentTitle(currentPageTitle, currentSiteTitle)
}

// 品牌配置异步加载完成后调用，只替换站点名，保留当前页面名
export function refreshDocumentTitle(siteTitle) {
  if (siteTitle) currentSiteTitle = siteTitle
  document.title = composeDocumentTitle(currentPageTitle, currentSiteTitle)
}
