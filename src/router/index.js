import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/views/Home.vue'
import User from '@/views/User.vue'
import Packages from '@/views/Packages.vue'
import VideoGeneration from '@/views/VideoGeneration.vue'
import AdminBoard from '@/views/AdminBoard.vue'
import Canvas from '@/views/Canvas.vue'
import WorkflowList from '@/views/WorkflowList.vue'
import Landing3D from '@/views/Landing3D.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { 
      path: '/', 
      name: 'landing',
      component: Landing3D,
      meta: { title: 'AI Design Unleashed', requiresAuth: false }
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
      meta: { title: '管理后台', requiresAuth: true }
    },
    // 404 重定向到首页
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// 路由守卫 - 检查登录状态和更新页面标题
router.beforeEach(async (to, from, next) => {
  // 更新页面标题
  document.title = to.meta.title ? `${to.meta.title} - AI创作平台` : 'AI创作平台'
  
  // 检查是否需要登录
  if (to.meta.requiresAuth) {
    const token = localStorage.getItem('token')
    
    if (!token) {
      // 没有 token，跳转到落地页
      console.log('[Router] 未登录，跳转到落地页')
      return next({ path: '/', query: { redirect: to.fullPath } })
    }
    
    // 验证 token 是否有效（可选：调用 API 验证）
    try {
      const { getTenantHeaders } = await import('@/config/tenant')
      const response = await fetch('/api/user/me', {
        headers: {
          ...getTenantHeaders(),
          'Authorization': `Bearer ${token}`
        }
      })
      
      if (!response.ok) {
        // token 无效，清除并跳转到落地页
        console.log('[Router] Token 无效，清除并跳转到落地页')
        localStorage.removeItem('token')
        localStorage.removeItem('userMode')
        return next({ path: '/', query: { redirect: to.fullPath } })
      }
    } catch (error) {
      console.error('[Router] 验证登录状态失败:', error)
      // 网络错误时允许通过，让页面自行处理
    }
  }
  
  next()
})

export default router




