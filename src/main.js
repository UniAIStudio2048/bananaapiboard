import './assets/tailwind.css'
import './assets/themes.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initTheme } from './utils/theme'
import { initLogger, logPageView } from './utils/logger'

// 在应用启动前初始化主题，确保默认是浅色模式
initTheme()

// 初始化前端日志系统
initLogger({ enabled: true })

// 创建并挂载应用
const app = createApp(App)
app.use(router)

// 路由切换时记录页面访问
router.afterEach((to) => {
  logPageView(to.path, to.params)
})

app.mount('#app')
