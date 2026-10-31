<script setup>
import { onMounted, ref } from 'vue'
import { QrCode } from '@lucide/vue'
import { getTenantId } from '@/config/tenant'
import { wechatRequest } from '@/api/wechat'
import { WECHAT_ATTEMPT_KEY, createWechatAttempt, safeWechatReturnPath, wechatLoginError } from '@/utils/wechatLogin'

const enabled = ref(false)
const busy = ref(false)
const error = ref('')
onMounted(async () => {
  // The callback uses the existing login modal to bind an account; avoid nested OAuth.
  if (window.location.pathname === '/wechat/callback') return
  try { enabled.value = (await wechatRequest('config')).enabled === true } catch { enabled.value = false }
})
async function start() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const attempt = await createWechatAttempt()
    const result = await wechatRequest('start', { challenge: attempt.challenge })
    const params = new URLSearchParams(window.location.search)
    const returnPath = safeWechatReturnPath(params.get('redirect') || (window.location.pathname === '/' ? '/canvas' : window.location.pathname + window.location.search))
    sessionStorage.setItem(WECHAT_ATTEMPT_KEY, JSON.stringify({ verifier: attempt.verifier, state: result.state, tenantId: getTenantId(), expiresAt: Date.now() + result.expires_in * 1000, returnPath }))
    window.location.assign(result.authorize_url)
  } catch (failure) { error.value = wechatLoginError(failure); busy.value = false }
}
</script>

<template>
  <div v-if="enabled" class="my-4">
    <button type="button" :disabled="busy" class="flex w-full items-center justify-center gap-2 rounded-lg border border-current/20 px-4 py-2.5 text-sm transition hover:bg-gray-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50" @click="start">
      <QrCode :size="18" :stroke-width="1.75" aria-hidden="true" />
      {{ busy ? '正在打开微信…' : '微信扫码登录' }}
    </button>
    <p v-if="error" role="alert" class="mt-2 text-sm text-red-500">{{ error }}</p>
  </div>
</template>
