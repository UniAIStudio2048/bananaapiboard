import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/views/Home.vue'
import Auth from '@/views/Auth.vue'
import User from '@/views/User.vue'
import Packages from '@/views/Packages.vue'
import VideoGeneration from '@/views/VideoGeneration.vue'
import AdminBoard from '@/views/AdminBoard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { 
      path: '/', 
      name: 'home',
      component: Home,
      meta: { title: '图片生成' }
    },
    { 
      path: '/video', 
      name: 'video',
      component: VideoGeneration,
      meta: { title: '视频生成' }
    },
    { 
      path: '/auth', 
      name: 'auth',
      component: Auth,
      meta: { title: '登录/注册' }
    },
    { 
      path: '/user', 
      name: 'user',
      component: User,
      meta: { title: '用户中心' }
    },
    { 
      path: '/packages', 
      name: 'packages',
      component: Packages,
      meta: { title: '套餐购买' }
    },
    { 
      path: '/adminboard', 
      name: 'adminboard',
      component: AdminBoard,
      meta: { title: '管理后台' }
    },
    // 404 重定向到首页
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

// 路由守卫 - 更新页面标题
router.beforeEach((to, from, next) => {
  document.title = to.meta.title ? `${to.meta.title} - AI创作平台` : 'AI创作平台'
  next()
})

export default router




