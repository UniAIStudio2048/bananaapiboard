<script setup>
import { t as translateUi } from '@/i18n'

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
    error.value = failure.name === 'TimeoutError' ? translateUi('uiMessages.m3d7b05cdf9ca') : failure.message || translateUi('uiMessages.m235f03442eac')
  }
})
</script>

<template>
  <main class="min-h-screen flex items-center justify-center px-6">
    <div class="text-center max-w-md" role="status" aria-live="polite">
      <h1 class="text-xl font-semibold mb-3">{{ error ? translateUi('uiMessages.m1012d93617f9') : translateUi('uiMessages.m3c4925d1043c') }}</h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">{{ error || translateUi('uiMessages.mc380dfbdf3c6') }}</p>
      <p v-if="error" class="mt-4 text-sm text-gray-500 dark:text-gray-400">{{ translateUi('uiMessages.m692bacb7124c') }}</p>
    </div>
  </main>
</template>
