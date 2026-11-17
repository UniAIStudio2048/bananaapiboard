import { t as translateUi } from '../i18n/index.js'
import { createRouter, createWebHistory } from 'vue-router'
import { getBrand, getTenantId } from '@/config/tenant'
import { setPageTitle, isIndexableRoute } from '@/utils/pageTitle'
import { defaultHomepageTitle, isDefaultHomepage } from '@/utils/defaultHomeContent'
const Home = () => import('@/views/Home.vue')
const User = () => import('@/views/User.vue')
const Packages = () => import('@/views/Packages.vue')
const VideoGeneration = () => import('@/views/VideoGeneration.vue')
const TextGeneration = () => import('@/views/TextGeneration.vue')
const AdminBoard = () => import('@/views/AdminBoard.vue')
const Canvas = () => import('@/views/Canvas.vue')
const WorkflowList = () => import('@/views/WorkflowList.vue')
const WorkflowShare = () => import('@/views/WorkflowShare.vue')
const Landing3D = () => import('@/views/Landing3D.vue')
const GroupCredits = () => import('@/views/GroupCredits.vue')
const Docs = () => import('@/views/Docs.vue')

const landingMode = import.meta.env.VITE_LANDING_MODE

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/wechat/callback',
      name: 'wechatCallback',
      component: () => import('@/views/WechatCallback.vue'),
      meta: { requiresAuth: false, noindex: true, referrer: 'no-referrer' }
    },
    {
      path: '/admin/canvas-login',
      name: 'userCanvasLogin',
      component: () => import('@/views/UserCanvasLogin.vue'),
      meta: { requiresAuth: false, noindex: true, referrer: 'no-referrer' }
    },
    {
      path: '/',
      name: 'landing',
      component: landingMode === '1'
        ? () => import('@/views/CommunityHome.vue')
        : Landing3D,
      meta: { get title() { return defaultHomepageTitle('/', getTenantId()) }, requiresAuth: false }
    },
    { 
      path: '/generate', 
      name: 'home',
      component: Home,
      meta: { get title() { return translateUi('imageGen.title') }, requiresAuth: true }
    },
    {
      path: '/canvas',
      name: 'canvas',
      component: Canvas,
      meta: { get title() { return translateUi('canvas.title') }, requiresAuth: true }
    },
    {
      path: '/docs',
      name: 'docs',
      component: Docs,
      meta: { get title() { return translateUi('uiMessages.m2687ccdbb1d2') }, requiresAuth: false }
    },
    {
      path: '/workflows',
      name: 'workflows',
      component: WorkflowList,
      meta: { get title() { return translateUi('uiMessages.m865ce4989456') }, requiresAuth: true }
    },
    {
      path: '/share/workflows/:token',
      name: 'workflowShare',
      component: WorkflowShare,
      meta: { get title() { return translateUi('uiMessages.m82d29589d2de') }, requiresAuth: false, noindex: true, referrer: 'no-referrer' }
    },
    { path: '/subuser', name: 'subusers', component: () => import('@/views/Subusers.vue'), meta: { get title() { return translateUi('uiMessages.md19c97e3879d') }, requiresAuth: true } },
    {
      path: '/group',
      name: 'groupCredits',
      component: GroupCredits,
      meta: { get title() { return translateUi('user.teamPoints') }, requiresAuth: true }
    },
    { 
      path: '/video', 
      name: 'video',
      component: VideoGeneration,
      meta: { get title() { return translateUi('user.ledgerType.video_generate') }, requiresAuth: true }
    },
    {
      path: '/text',
      name: 'text',
      component: TextGeneration,
      meta: { get title() { return translateUi('nav.textGenerate') }, requiresAuth: true }
    },
    // /auth 路由已移除，登录统一从落地页进入
    { 
      path: '/auth', 
      redirect: '/'
    },
    { 
      path: '/user', 
      name: 'user',
      component: User,
      meta: { get title() { return translateUi('uiMessages.m018a3ecf091a') }, requiresAuth: true }
    },
    { 
      path: '/packages', 
      name: 'packages',
      component: Packages,
      meta: { get title() { return translateUi('pointsType.package_purchase') }, requiresAuth: true }
    },
    {
      path: '/adminboard',
      name: 'adminboard',
      component: AdminBoard,
      meta: { get title() { return translateUi('admin.title') }, requiresAuth: true, requiresAdmin: true }
    },
    // 社区路由
    {
      path: '/community',
      name: 'community',
      component: () => import('@/views/CommunityHome.vue'),
      meta: { get title() { return translateUi('uiMessages.m5bcd0ddcdd69') }, requiresAuth: false }
    },
    {
      path: '/community/tvshow',
      name: 'communityTvShow',
      component: () => import('@/views/TvShowPage.vue'),
      meta: { title: 'TV Show', requiresAuth: false }
    },
    {
      path: '/community/users/:userId',
      name: 'communityUserProfile',
      component: () => import('@/views/CommunityUserProfile.vue'),
      meta: { get title() { return translateUi('uiMessages.mf2ad3f0f1f90') }, requiresAuth: false }
    },
    {
      path: '/community/messages',
      name: 'communityMessages',
      component: () => import('@/views/CommunityMessages.vue'),
      meta: { get title() { return translateUi('uiMessages.m40e27b2eddbe') }, requiresAuth: true }
    },
    {
      path: '/community/templates',
      name: 'communityTemplates',
      component: () => import('@/views/TemplateListPage.vue'),
      meta: { get title() { return translateUi('uiMessages.mafd8a25f3078') }, requiresAuth: false }
    },
    {
      path: '/community/:id/workflow',
      alias: '/community/workflow/:id',
      name: 'communityWorkflow',
      component: () => import('@/views/CommunityWorkflow.vue'),
      meta: { get title() { return translateUi('uiMessages.m29dff383df15') }, requiresAuth: false }
    },
    {
      path: '/community/:id',
      name: 'communityDetail',
      component: () => import('@/views/CommunityDetail.vue'),
      meta: { get title() { return translateUi('uiMessages.m2674c80642ac') }, requiresAuth: false }
    },
    // 灵感中心
    {
      path: '/inspiration',
      name: 'inspiration',
      component: () => import('@/views/Inspiration.vue'),
      meta: { get title() { return translateUi('uiMessages.m9ab5493d9a33') }, requiresAuth: false }
    },
    // 404 重定向到首页
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// 路由守卫 - 检查登录状态；公开可收录页面标题为「页面名 - 站点名」，其余页面固定为站点名
router.beforeEach(async (to, from, next) => {
  const brand = getBrand()
  setPageTitle(
    isIndexableRoute(to) ? to.meta.title : '',
    brand?.siteTitle,
    isDefaultHomepage(to.path, getTenantId()) ? 'Nano Banana' : ''
  )
  
  // 检查是否需要登录
  if (to.meta.requiresAuth) {
    const token = localStorage.getItem('token')
    
    if (!token) {
      // 没有 token，跳转到落地页
      console.log('[Router] 未登录，跳转到落地页')
      return next({ path: '/', query: { redirect: to.fullPath } })
    }
    
    // 🔧 修复：如果用户已经在需要认证的页面上（同页面内导航），跳过 API 验证
    // 避免网络抖动或后端重启时把用户从画布等页面踢出去
    if (from.meta.requiresAuth && from.name && !to.meta.requiresAdmin) {
      // 已经在认证页面内，直接放行，不再重复验证 token
      return next()
    }
    
    // 仅在首次进入认证页面时验证 token
    try {
      // 与 getMe 共用同一个 /api/user/me 请求（并发合并 + 短缓存）
      const { fetchMeShared, clearAuthSession } = await import('@/api/client')
      const response = await fetchMeShared()
      
      if (response?.status === 401) {
        console.log('[Router] Token 已失效(401)，清除登录状态')
        clearAuthSession()
        localStorage.removeItem('userMode')
        return next({ path: '/', query: { redirect: to.fullPath } })
      }
      if (response && !response.ok) {
        console.warn('[Router] 验证请求返回', response.status, '，但非401，允许通过')
      }
    } catch (error) {
      console.error('[Router] 验证登录状态失败:', error)
      // 网络错误时允许通过，让页面自行处理
    }

    // 管理员权限检查
    if (to.meta.requiresAdmin) {
      try {
        const userStr = localStorage.getItem('user')
        const user = userStr ? JSON.parse(userStr) : null
        if (!user || user.role !== 'admin') {
          return next('/generate')
        }
      } catch {
        return next('/generate')
      }
    }
  }
  
  next()
})

export default router

