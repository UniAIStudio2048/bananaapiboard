import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/views/Home.vue'
const User = () => import('@/views/User.vue')
const Packages = () => import('@/views/Packages.vue')
const VideoGeneration = () => import('@/views/VideoGeneration.vue')
const AdminBoard = () => import('@/views/AdminBoard.vue')
const Canvas = () => import('@/views/Canvas.vue')
const WorkflowList = () => import('@/views/WorkflowList.vue')
const Landing3D = () => import('@/views/Landing3D.vue')

const landingMode = import.meta.env.VITE_LANDING_MODE

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'landing',
      component: landingMode === '1'
        ? () => import('@/views/CommunityHome.vue')
        : Landing3D,
      meta: { title: '', requiresAuth: false }  // 落地页直接使用默认标题
    },
    { 
      path: '/generate', 
      name: 'home',
      component: Home,
      meta: { title: '图片生成', requiresAuth: true }
    },
    {
      path: '/canvas',
      name: 'canvas',
      component: Canvas,
      meta: { title: '创作画布', requiresAuth: true }
    },
    {
      path: '/workflows',
      name: 'workflows',
      component: WorkflowList,
      meta: { title: '工作流列表', requiresAuth: true }
    },
    { 
      path: '/video', 
      name: 'video',
      component: VideoGeneration,
      meta: { title: '视频生成', requiresAuth: true }
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
      meta: { title: '用户中心', requiresAuth: true }
    },
    { 
      path: '/packages', 
      name: 'packages',
      component: Packages,
      meta: { title: '套餐购买', requiresAuth: true }
    },
    {
      path: '/adminboard',
      name: 'adminboard',
      component: AdminBoard,
      meta: { title: '管理后台', requiresAuth: true, requiresAdmin: true }
    },
    // 社区路由
    {
      path: '/community',
      name: 'community',
      component: () => import('@/views/CommunityHome.vue'),
      meta: { title: '社区', requiresAuth: false }
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
      meta: { title: '作者主页', requiresAuth: false }
    },
    {
      path: '/community/messages',
      name: 'communityMessages',
      component: () => import('@/views/CommunityMessages.vue'),
      meta: { title: '社区私信', requiresAuth: true }
    },
    {
      path: '/community/templates',
      name: 'communityTemplates',
      component: () => import('@/views/TemplateListPage.vue'),
      meta: { title: '模板库', requiresAuth: false }
    },
    {
      path: '/community/:id/workflow',
      alias: '/community/workflow/:id',
      name: 'communityWorkflow',
      component: () => import('@/views/CommunityWorkflow.vue'),
      meta: { title: '工作流预览', requiresAuth: false }
    },
    {
      path: '/community/:id',
      name: 'communityDetail',
      component: () => import('@/views/CommunityDetail.vue'),
      meta: { title: '作品详情', requiresAuth: false }
    },
    // 404 重定向到首页
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// 路由守卫 - 检查登录状态（标题始终固定为「ai绘图创作」）
router.beforeEach(async (to, from, next) => {
  // 标题固定为「ai绘图创作」，不再根据路由动态变更
  document.title = 'ai绘图创作'
  
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
      const { getTenantHeaders, getApiUrl } = await import('@/config/tenant')
      const response = await fetch(getApiUrl('/api/user/me'), {
        headers: {
          ...getTenantHeaders(),
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (response.status === 401) {
        console.log('[Router] Token 已失效(401)，清除登录状态')
        const { clearAuthSession } = await import('@/api/client')
        clearAuthSession()
        localStorage.removeItem('userMode')
        return next({ path: '/', query: { redirect: to.fullPath } })
      }
      if (!response.ok) {
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




