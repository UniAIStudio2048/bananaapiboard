import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // 获取 API 地址，优先使用环境变量
  const apiTarget = env.VITE_API_BASE || 'http://localhost:5000'

  const portMap = { brainjuice: 3100, moyunzong: 3200, sgbl: 3300, qingyuan: 3400 }
  const serverPort = portMap[mode] || 3000

  return {
    plugins: [vue()],

    server: {
      host: '0.0.0.0',
      port: serverPort,
      allowedHosts: true,  // 允许所有域名（Vite 5.x 正确写法）
      
      // 🔧 HMR 配置：防止开发模式下意外刷新页面
      hmr: {
        // 禁用 overlay 错误弹窗（可能导致页面交互问题）
        overlay: false,
        // HMR 连接超时时间（毫秒），防止网络抖动导致重连刷新
        timeout: 60000,
        // 🔧 关键：禁止 HMR 失败时自动全页刷新，必须手动刷新
        // 这可以防止创作过程中页面被意外重新加载
      },
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          // 如果 VITE_API_BASE 不为空，则重写路径
          ...(env.VITE_API_BASE ? {} : {})
        },
        '/storage': {
          target: apiTarget,
          changeOrigin: true,
          secure: false
        },
        // 租户管理后台代理 - 不重写路径，因为 tenant-manager 使用 base: '/tenant-manager/'
        '/tenant-manager': {
          target: 'http://localhost:9000',
          changeOrigin: true,
          secure: false
        }
      }
    },
    
    preview: {
      host: '0.0.0.0',
      port: serverPort,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false
        },
        '/storage': {
          target: apiTarget,
          changeOrigin: true,
          secure: false
        }
      }
    },
    
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    
    build: {
      // 生产构建配置
      target: 'esnext',
      outDir: portMap[mode] ? `dist-${mode}` : 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router'],
            'ui-vendor': ['@vue-flow/core', '@vue-flow/background', '@vue-flow/controls', '@vue-flow/minimap'],
          }
        }
      }
    }
  }
})
