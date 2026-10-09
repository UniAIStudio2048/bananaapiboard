<script setup>
import { onMounted, ref } from 'vue'
import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { persistAuthSession } from '@/api/client'
import { exchangeUserCanvasLogin } from '@/utils/userCanvasLogin'

const error = ref('')
onMounted(async () => {
  try {
    await exchangeUserCanvasLogin({
      location: window.location,
      history: window.history,
      apiUrl: getApiUrl('/api/auth/login/canvas'),
      tenantHeaders: getTenantHeaders(),
      persistSession: persistAuthSession
    })
    window.location.replace('/canvas')
  } catch (failure) {
    error.value = failure.name === 'TimeoutError' ? '登录超时，请返回用户管理页面重新登录' : failure.message || '登录未成功，请返回用户管理页面'
  }
})
</script>

<template>
  <main class="min-h-screen flex items-center justify-center px-6">
    <div class="text-center max-w-md" role="status" aria-live="polite">
      <h1 class="text-xl font-semibold mb-3">{{ error ? '无法登录画布' : '正在登录用户画布' }}</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ error || '正在验证登录凭据，请稍候…' }}</p>
      <p v-if="error" class="mt-4 text-sm text-gray-500 dark:text-gray-400">关闭此标签，返回租户后台的用户管理页面后点击“登录画布”。</p>
    </div>
  </main>
</template>
