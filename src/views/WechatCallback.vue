<script setup>
import { t as translateUi } from '@/i18n'

import { nextTick, onMounted, ref } from 'vue'
import LoginModal from '@/components/community/LoginModal.vue'
import { getTenantId } from '@/config/tenant'
import { wechatRequest } from '@/api/wechat'
import { getSignupAttribution } from '@/utils/signupSource'
import { completeSignupSurvey } from '@/utils/signupSurvey'
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
    const result = await wechatRequest('complete', { code: callback.code, state: callback.state, verifier, signup_attribution: getSignupAttribution() })
    if (!result.requires_binding) {
      await completeSignupSurvey(result)
      return finish(result)
    }
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
      <h1 class="mb-3 text-xl font-semibold">{{ bindingToken ? translateUi('uiMessages.md89c222324de') : translateUi('uiMessages.m9e0181f35fc5') }}</h1>
      <p v-if="loading" role="status" class="text-sm text-gray-500">{{ translateUi('uiMessages.m950eaa8c9f09') }}</p>
      <p v-if="error" role="alert" class="mb-4 text-sm text-red-500">{{ error }}</p>
      <template v-if="bindingToken && !loading">
        <p class="mb-4 text-sm text-gray-500">{{ translateUi('uiMessages.m0530393ba136') }}</p>
        <button v-if="!accountReady" type="button" class="w-full rounded-lg border border-gray-300 px-4 py-2 dark:border-gray-700" @click="showLogin = true">{{ translateUi('uiMessages.mb9759c443392') }}</button>
        <template v-else>
          <p class="mb-3 text-sm">{{ translateUi('uiMessages.m75738feb7770', { value1: (username) }) }}</p>
          <button type="button" class="w-full rounded-lg bg-gray-900 px-4 py-2 text-white dark:bg-gray-100 dark:text-gray-900" @click="bind">{{ translateUi('uiMessages.m5f847c6311fc') }}</button>
          <button type="button" class="mt-3 text-sm underline" @click="showLogin = true">{{ translateUi('uiMessages.m6c5e4c4f322b') }}</button>
        </template>
      </template>
      <a v-if="!loading" href="/" class="mt-4 inline-block text-sm text-gray-500 underline">{{ translateUi('uiMessages.med7408a60b81') }}</a>
    </section>
    <LoginModal v-model="showLogin" @login-success="loggedIn" />
  </main>
</template>
