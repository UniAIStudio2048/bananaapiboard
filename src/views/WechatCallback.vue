<script setup>
import { nextTick, onMounted, ref } from 'vue'
import LoginModal from '@/components/community/LoginModal.vue'
import { getTenantId } from '@/config/tenant'
import { wechatRequest } from '@/api/wechat'
import { completeSmsAuthentication } from '@/api/sms'
import { WECHAT_ATTEMPT_KEY, readWechatCallback, wechatLoginError } from '@/utils/wechatLogin'

const error = ref('')
const loading = ref(true)
const bindingToken = ref('')
const showLogin = ref(false)
const accountReady = ref(false)
const username = ref('')
let verifier = ''
let returnPath = '/canvas'
const callbackHref = window.location.href
window.history.replaceState(window.history.state, '', '/wechat/callback')

function finish(result) {
  completeSmsAuthentication(result)
  sessionStorage.removeItem(WECHAT_ATTEMPT_KEY)
  window.location.replace(returnPath)
}
function loggedIn() {
  accountReady.value = true
  try { username.value = JSON.parse(localStorage.getItem('user') || '{}').username || '' } catch {}
}
async function bind() {
  loading.value = true
  error.value = ''
  try { finish(await wechatRequest('bind', { binding_token: bindingToken.value, verifier }, true)) }
  catch (failure) { error.value = wechatLoginError(failure) }
  finally { loading.value = false }
}
onMounted(async () => {
  try {
    const stored = JSON.parse(sessionStorage.getItem(WECHAT_ATTEMPT_KEY) || 'null')
    const callback = readWechatCallback({ href: callbackHref, stored, tenantId: getTenantId() })
    verifier = callback.verifier
    returnPath = callback.returnPath
    sessionStorage.removeItem(WECHAT_ATTEMPT_KEY)
    const result = await wechatRequest('complete', { code: callback.code, state: callback.state, verifier })
    if (!result.requires_binding) return finish(result)
    bindingToken.value = result.binding_token
    // Opening after mount triggers the existing modal's registration policy loader.
    await nextTick()
    showLogin.value = true
  } catch (failure) { error.value = wechatLoginError(failure) }
  finally { loading.value = false }
})
</script>

<template>
  <main class="min-h-screen flex items-center justify-center bg-white px-6 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
    <section class="w-full max-w-md rounded-xl border border-gray-200 p-6 text-center shadow-sm dark:border-gray-800">
      <h1 class="mb-3 text-xl font-semibold">{{ bindingToken ? '关联微信账号' : '微信扫码登录' }}</h1>
      <p v-if="loading" role="status" class="text-sm text-gray-500">正在验证，请稍候…</p>
      <p v-if="error" role="alert" class="mb-4 text-sm text-red-500">{{ error }}</p>
      <template v-if="bindingToken && !loading">
        <p class="mb-4 text-sm text-gray-500">微信验证已完成。请按本站注册要求完成注册，或登录已有账号，再确认绑定。绑定后即可直接扫码登录。</p>
        <button v-if="!accountReady" type="button" class="w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-700" @click="showLogin = true">登录或注册本站账号</button>
        <template v-else>
          <p class="mb-3 text-sm">即将绑定到账号：{{ username }}</p>
          <button type="button" class="w-full rounded-lg bg-gray-900 px-4 py-2 text-white dark:bg-gray-100 dark:text-gray-900" @click="bind">确认绑定微信</button>
          <button type="button" class="mt-3 text-sm underline" @click="showLogin = true">使用其他账号</button>
        </template>
      </template>
      <a v-if="!loading" href="/" class="mt-4 inline-block text-sm text-gray-500 underline">返回首页，重新扫码或使用其他方式登录</a>
    </section>
    <LoginModal v-model="showLogin" @login-success="loggedIn" />
  </main>
</template>
