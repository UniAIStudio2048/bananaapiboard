<script setup>
import { t as translateUi } from '@/i18n'

/**
 * LoginModal.vue - 社区登录/注册弹窗
 * 复用 Auth.vue 的登录注册逻辑，以弹窗形式展示
 */
import { ref, watch, computed } from 'vue'
import PhoneAuthForm from '@/components/auth/PhoneAuthForm.vue'
import WechatLoginButton from '@/components/auth/WechatLoginButton.vue'
import PhoneCountrySelect from '@/components/auth/PhoneCountrySelect.vue'
import { useSmsAuth } from '@/composables/useSmsAuth'
import { getTenantHeaders, getApiUrl, useTenantConfigVersion, isSignupSourceEnabled } from '@/config/tenant'
import { persistAuthSession } from '@/api/client'
import { clearWorkflowSession } from '@/stores/canvas/workflowAutoSave'
import { normalizeEmailWhitelist } from '@/utils/emailWhitelist'
import { SIGNUP_SOURCE_LABEL, SIGNUP_SOURCE_OPTIONS, initialSignupSourceChoice, resolveSignupSource } from '@/utils/signupSource'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'login-success'])

// 表单状态
const mode = ref('login') // 'login' | 'register'
const resetMode = ref(false)
const account = ref('')
const nickname = ref('')
const password = ref('')
const confirmPwd = ref('')
const inviteCode = ref('')
const signupSource = ref(initialSignupSourceChoice())
const tenantConfigVersion = useTenantConfigVersion()
const showSignupSource = computed(() => { void tenantConfigVersion.value; return isSignupSourceEnabled() })
const loading = ref(false)
const error = ref('')
const message = ref('')

// 注册设置
const requireInviteCode = ref(false)

// 忘记密码相关
const resetEmail = ref('')
const resetEmailCode = ref('')
const newPassword = ref('')
const confirmNewPwd = ref('')
const sendingResetCode = ref(false)
const resetCodeSent = ref(false)
const resetCountdown = ref(0)

// 邮箱验证相关
const emailConfig = ref({
  require_email_verification: false,
  has_whitelist: false,
  email_whitelist: []
})
const emailPrefix = ref('')
const emailSuffix = ref('')
const emailCode = ref('')
const sendingCode = ref(false)
const codeSent = ref(false)
const countdown = ref(0)
const hasWhitelist = computed(() => emailConfig.value.email_whitelist.length > 0)

// 构建完整邮箱
const fullEmail = computed(() => {
  if (mode.value === 'register' && hasWhitelist.value) {
    if (emailPrefix.value && emailSuffix.value) {
      return `${emailPrefix.value}@${emailSuffix.value}`
    }
    return ''
  }
  return account.value
})

// 重置表单
function resetForm() {
  account.value = ''
  nickname.value = ''
  password.value = ''
  confirmPwd.value = ''
  inviteCode.value = ''
  error.value = ''
  message.value = ''
  mode.value = 'login'
  resetMode.value = false
  emailPrefix.value = ''
  emailCode.value = ''
  codeSent.value = false
  countdown.value = 0
  resetEmail.value = ''
  resetEmailCode.value = ''
  newPassword.value = ''
  confirmNewPwd.value = ''
  resetCodeSent.value = false
  resetCountdown.value = 0
}

function applyInviteCodeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search)
    const inviteFromUrl = params.get('invite') || params.get('code') || ''
    if (inviteFromUrl) {
      inviteCode.value = inviteFromUrl
      mode.value = 'register'
    }
  } catch (e) {
    console.warn('[LoginModal] 解析邀请链接失败', e)
  }
}

function enterResetMode() {
  resetMode.value = true
  error.value = ''
  message.value = ''
  resetEmail.value = account.value || ''
  resetEmailCode.value = ''
  newPassword.value = ''
  confirmNewPwd.value = ''
}

function exitResetMode() {
  resetMode.value = false
  error.value = ''
  message.value = ''
}

watch(() => props.modelValue, (v) => {
  if (v) {
    resetForm()
    applyInviteCodeFromUrl()
    loadSettings()
    loadEmailConfig()
  }
}, { immediate: true }) // 支持按需挂载时以打开状态首次挂载

// 加载注册设置
async function loadSettings() {
  try {
    const r = await fetch(getApiUrl('/api/settings/app'), { headers: getTenantHeaders() })
    if (r.ok) {
      const data = await r.json()
      if (data.settings?.require_invite_code !== undefined) {
        requireInviteCode.value = data.settings.require_invite_code
      }
    }
  } catch (e) {
    // 静默失败
  }
}

async function loadEmailConfig() {
  try {
    const r = await fetch(getApiUrl('/api/email/public-config'), { headers: getTenantHeaders() })
    if (r.ok) {
      const data = await r.json()
      const emailWhitelist = normalizeEmailWhitelist(data.email_whitelist)
      emailConfig.value = { ...data, has_whitelist: emailWhitelist.length > 0, email_whitelist: emailWhitelist }
      if (emailWhitelist.length > 0) {
        emailSuffix.value = emailWhitelist[0]
      }
    }
  } catch (e) {}
}

function close() {
  emit('update:modelValue', false)
}

async function sendVerificationCode() {
  const email = fullEmail.value
  if (!email) return
  sendingCode.value = true
  error.value = ''
  try {
    const r = await fetch(getApiUrl('/api/email/send-verification-code'), {
      method: 'POST',
      headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, type: 'register' })
    })
    if (!r.ok) {
      const data = await r.json()
      throw new Error(data.message || translateUi('uiMessages.mac77953a1e06'))
    }
    codeSent.value = true
    countdown.value = 60
    const timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(timer)
        codeSent.value = false
      }
    }, 1000)
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.m0a7b29f34fae')
  } finally {
    sendingCode.value = false
  }
}

async function submit() {
  error.value = ''
  message.value = ''

  const needEmailMode = hasWhitelist.value
  if (mode.value === 'register' && needEmailMode) {
    if (!nickname.value.trim() || !password.value) {
      error.value = translateUi('uiMessages.m05afc8816e12')
      return
    }
  } else if (!account.value.trim() || !password.value) {
    error.value = translateUi('uiMessages.me72dfb96ac68')
    return
  }

  if (mode.value === 'register') {
    if (!nickname.value.trim()) {
      error.value = translateUi('uiMessages.m3b18ce572985')
      return
    }
    if (password.value !== confirmPwd.value) {
      error.value = translateUi('uiMessages.m58807745708e')
      return
    }
    if (password.value.length < 6) {
      error.value = translateUi('uiMessages.m8eee17404155')
      return
    }
    if (requireInviteCode.value && !inviteCode.value.trim()) {
      error.value = translateUi('uiMessages.m884fcf3305da')
      return
    }
    if (hasWhitelist.value && !fullEmail.value) {
      error.value = translateUi('uiMessages.m5b484f8c6f19')
      return
    }
    if (emailConfig.value.require_email_verification) {
      if (!emailCode.value) {
        error.value = translateUi('auth.emailCodeRequired')
        return
      }
    }
  }

  loading.value = true
  try {
    const url = getApiUrl(mode.value === 'register' ? '/api/auth/register' : '/api/auth/login')
    const source = showSignupSource.value ? resolveSignupSource(signupSource.value) : ''
    const payload = mode.value === 'register'
      ? {
          username: nickname.value.trim(),
          email: fullEmail.value || account.value,
          password: password.value,
          ...(inviteCode.value ? { invite_code: inviteCode.value } : {}),
          ...(emailCode.value ? { email_code: emailCode.value } : {}),
          ...(source ? { signup_source: source } : {})
        }
      : { username: account.value, email: account.value, password: password.value, country: loginCountry.value }

    const r = await fetch(url, {
      method: 'POST',
      headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!r.ok) {
      const data = await r.json()
      if (data.error === 'disabled') error.value = translateUi('auth.accountDisabled')
      else if (data.error === 'invalid_credentials') error.value = translateUi('auth.invalidCredentials')
      else if (data.error === 'not_found') error.value = translateUi('auth.userNotFound')
      else if (data.error === 'too_many_requests') error.value = data.message || translateUi('uiMessages.mdc52a1075134')
      else error.value = data.message || translateUi('auth.operationFailed')
      return
    }

    const j = await r.json()
    persistAuthSession(j.token, j.user || (mode.value === 'register' ? { username: nickname.value.trim() } : null))
    localStorage.removeItem('workflow_auto_saves')
    clearWorkflowSession()
    localStorage.removeItem('canvas_background_tasks')

    message.value = mode.value === 'register' ? translateUi('uiMessages.meab7185db6aa') : translateUi('uiMessages.m645b934deb86')
    setTimeout(() => {
      emit('login-success')
      close()
    }, 500)
  } catch (e) {
    if (!error.value) error.value = translateUi('auth.networkError')
  } finally {
    loading.value = false
  }
}

async function sendResetCode() {
  if (!resetEmail.value) {
    error.value = translateUi('uiMessages.m41e9059e4dd2')
    return
  }
  sendingResetCode.value = true
  error.value = ''
  try {
    const r = await fetch(getApiUrl('/api/email/send-verification-code'), {
      method: 'POST',
      headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail.value, type: 'reset_password' })
    })
    if (!r.ok) {
      const data = await r.json()
      throw new Error(data.message || translateUi('uiMessages.mac77953a1e06'))
    }
    resetCodeSent.value = true
    resetCountdown.value = 60
    message.value = translateUi('uiMessages.m9744d271502e')
    const timer = setInterval(() => {
      resetCountdown.value--
      if (resetCountdown.value <= 0) {
        clearInterval(timer)
        resetCodeSent.value = false
      }
    }, 1000)
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.m0a7b29f34fae')
  } finally {
    sendingResetCode.value = false
  }
}

async function resetPassword() {
  error.value = ''
  message.value = ''
  if (!resetEmail.value) {
    error.value = translateUi('user.enterEmail')
    return
  }
  if (!resetEmailCode.value) {
    error.value = translateUi('uiMessages.mba9192e1bb7a')
    return
  }
  if (!newPassword.value) {
    error.value = translateUi('user.enterNewPassword')
    return
  }
  if (newPassword.value.length < 6) {
    error.value = translateUi('uiMessages.m8eee17404155')
    return
  }
  if (newPassword.value !== confirmNewPwd.value) {
    error.value = translateUi('uiMessages.m58807745708e')
    return
  }
  loading.value = true
  try {
    const r = await fetch(getApiUrl('/api/auth/reset-password'), {
      method: 'POST',
      headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: resetEmail.value,
        code: resetEmailCode.value,
        new_password: newPassword.value
      })
    })
    if (!r.ok) {
      const data = await r.json()
      throw new Error(data.message || translateUi('uiMessages.mb0703ade4f60'))
    }
    message.value = translateUi('uiMessages.m84e22a633bf5')
    setTimeout(() => {
      exitResetMode()
      account.value = resetEmail.value
      password.value = ''
    }, 1500)
  } catch (e) {
    error.value = e.message || translateUi('uiMessages.mb0703ade4f60')
  } finally {
    loading.value = false
  }
}

const { policy, policyError, policyLoading, smsLogin, showSmsMethod, phoneFormMode, copy, loadAuthPolicy, backToPassword, loginCountry, loginCountries } = useSmsAuth(mode, resetMode, () => props.modelValue)
watch(policy, current => { emailConfig.value.require_email_verification = current.registration_mode === 'email' })
function handleSmsAuthenticated() { emit('login-success'); close() }
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-[9999] flex items-center justify-center"
      @click.self="close"
    >
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <!-- 弹窗 -->
      <div class="relative w-full max-w-md max-h-[calc(100dvh_-_2rem)] overflow-y-auto mx-4 bg-gray-900 text-white rounded-2xl border border-white/10 shadow-2xl animate-[slideUp_0.3s_ease]">
        <!-- 头部 -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div class="flex items-center gap-2">
            <button
              v-if="resetMode"
              class="w-7 h-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
              @click="exitResetMode"
              :aria-label="translateUi('common.back')"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <h2 class="text-lg font-semibold text-white">
              {{ resetMode ? translateUi('uiMessages.m06eb15b75f01') : (mode === 'login' ? translateUi('nav.login') : translateUi('nav.register')) }}
            </h2>
          </div>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
            @click="close"
            :aria-label="translateUi('common.close')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <div class="px-6 py-5">
          <!-- Tab 切换（重置密码模式下隐藏） -->
          <div v-if="!resetMode" class="flex space-x-1 mb-6 bg-white/5 rounded-lg p-1">
            <button
              class="flex-1 py-2 rounded-md text-sm font-medium transition"
              :class="mode === 'login' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'"
              @click="mode = 'login'"
            >{{ translateUi('nav.login') }}</button>
            <button
              class="flex-1 py-2 rounded-md text-sm font-medium transition"
              :class="mode === 'register' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'"
              v-if="policy.registration_enabled" @click="mode = 'register'"
            >{{ translateUi('nav.register') }}</button>
          </div>

          <WechatLoginButton v-if="mode === 'login' && !resetMode" />
          <div v-if="showSmsMethod" class="text-sm text-blue-400 mb-4">
            <button type="button" @click="smsLogin = !smsLogin">{{ smsLogin ? (resetMode ? copy.emailRetrieve : copy.passwordLogin) : (resetMode ? copy.retrieve : copy.login) }}</button>
          </div>
          <p v-if="policyError" role="alert" class="text-sm text-red-400">{{ copy.loadError }} <button type="button" @click="loadAuthPolicy">{{ copy.retry }}</button></p>
          <p v-if="policyLoading && mode === 'register'" role="status">{{ copy.loading }}</p>
          <template v-else-if="policyError && mode === 'register'"></template>
          <p v-else-if="mode === 'register' && !policy.registration_enabled" role="status" class="text-white/70">{{ copy.closed }}</p>
          <PhoneAuthForm v-else-if="phoneFormMode" class="text-white" :mode="phoneFormMode" :policy="policy" :invite-code="inviteCode" :require-invite-code="requireInviteCode" @authenticated="handleSmsAuthenticated" @back="backToPassword" @retrieve="resetMode = true; smsLogin = true" />
          <!-- 找回密码表单 -->
          <form v-else-if="resetMode" @submit.prevent="resetPassword" class="space-y-4">
            <p class="text-sm text-white/50 mb-2">{{ translateUi('uiMessages.m74de2eee39d9') }}</p>

            <div>
              <label class="block text-sm text-white/70 mb-1.5">{{ translateUi('auth.email') }}</label>
              <input
                v-model="resetEmail"
                type="email"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                :placeholder="translateUi('uiMessages.m85435c1130e6')"
                required
              />
            </div>

            <div>
              <label class="block text-sm text-white/70 mb-1.5">{{ translateUi('uiMessages.mbb015c60bafc') }}</label>
              <div class="flex gap-2">
                <input
                  v-model="resetEmailCode"
                  type="text"
                  maxlength="6"
                  class="flex-1 px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                  :placeholder="translateUi('uiMessages.m6bc8d6f5786b')"
                  required
                />
                <button
                  type="button"
                  @click="sendResetCode"
                  :disabled="sendingResetCode || resetCodeSent || !resetEmail"
                  class="px-4 py-2.5 bg-blue-600/80 text-white text-sm rounded-lg hover:bg-blue-500/80 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                >
                  {{ sendingResetCode ? translateUi('auth.sending') : resetCodeSent ? `${resetCountdown}s` : translateUi('auth.sendCode') }}
                </button>
              </div>
            </div>

            <div>
              <label class="block text-sm text-white/70 mb-1.5">{{ translateUi('user.newPassword') }}</label>
              <input
                v-model="newPassword"
                type="password"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                :placeholder="translateUi('uiMessages.medef5df61d32')"
                required
              />
            </div>

            <div>
              <label class="block text-sm text-white/70 mb-1.5">{{ translateUi('uiMessages.m6fde05a916c6') }}</label>
              <input
                v-model="confirmNewPwd"
                type="password"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                :placeholder="translateUi('user.enterConfirmPassword')"
                required
              />
            </div>

            <!-- 错误 -->
            <div v-if="error" class="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {{ error }}
            </div>

            <!-- 成功 -->
            <div v-if="message" class="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400">
              {{ message }}
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-medium rounded-lg hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <span v-if="loading" class="inline-flex items-center">
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                {{ translateUi('common.processing') }}
              </span>
              <span v-else>{{ translateUi('uiMessages.md70928debc2e') }}</span>
            </button>

            <div class="text-center">
              <button type="button" class="text-sm text-blue-400 hover:text-blue-300 transition" @click="exitResetMode">
                {{ translateUi('uiMessages.m747b0f9082e6') }}
              </button>
            </div>
          </form>

          <!-- 登录/注册表单 -->
          <form v-else @submit.prevent="submit" class="space-y-4">
            <PhoneCountrySelect v-if="mode === 'login' && !resetMode" v-model="loginCountry" :countries="loginCountries" :account="account" />
            <!-- 注册：昵称 -->
            <div v-if="mode === 'register'">
              <label class="block text-sm text-white/70 mb-1.5">{{ translateUi('uiMessages.m2d137954ca84') }}</label>
              <input
                v-model="nickname"
                type="text"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                :placeholder="translateUi('uiMessages.m86c3f85829dd')"
                required
              />
            </div>

            <!-- 白名单模式：前缀+后缀下拉 -->
            <div v-if="mode === 'register' && hasWhitelist">
              <label class="block text-sm text-white/70 mb-1.5">{{ translateUi('uiMessages.m54fe405363b6') }}</label>
              <div class="flex items-center gap-1">
                <input
                  v-model="emailPrefix"
                  type="text"
                  class="flex-[2] min-w-0 px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                  :placeholder="translateUi('auth.emailPrefix')"
                  required
                />
                <span class="text-white/50 text-sm px-1">@</span>
                <select
                  v-model="emailSuffix"
                  class="flex-1 min-w-0 px-2.5 py-2.5 bg-gray-800 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50 transition cursor-pointer"
                  required
                >
                  <option v-for="domain in emailConfig.email_whitelist" :key="domain" :value="domain" class="bg-gray-800 text-white">
                    {{ domain }}
                  </option>
                </select>
              </div>
            </div>

            <!-- 普通模式：用户名/邮箱 -->
            <div v-if="!(mode === 'register' && hasWhitelist)">
              <label class="block text-sm text-white/70 mb-1.5">{{ mode === 'register' ? translateUi('auth.email') : copy.loginAccount }}</label>
              <input
                v-model="account"
                :type="mode === 'register' ? 'email' : 'text'"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                :placeholder="mode === 'register' ? translateUi('uiMessages.m74db7d9f074a') : copy.loginAccountPlaceholder"
                required
              />
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-sm text-white/70">{{ translateUi('auth.password') }}</label>
                <button
                  v-if="mode === 'login'"
                  type="button"
                  class="text-xs text-blue-400 hover:text-blue-300 transition"
                  @click="enterResetMode"
                >{{ translateUi('uiMessages.m1d02d7f1c5c4') }}</button>
              </div>
              <input
                v-model="password"
                type="password"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                :placeholder="translateUi('uiMessages.m728a7b601c56')"
                required
              />
            </div>

            <!-- 注册：确认密码 -->
            <div v-if="mode === 'register'">
              <label class="block text-sm text-white/70 mb-1.5">{{ translateUi('user.confirmPassword') }}</label>
              <input
                v-model="confirmPwd"
                type="password"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                :placeholder="translateUi('uiMessages.m901b301d0a81')"
                required
              />
            </div>

            <!-- 注册：邮箱验证码 -->
            <div v-if="mode === 'register' && emailConfig.require_email_verification">
              <label class="block text-sm text-white/70 mb-1.5">{{ translateUi('uiMessages.m05a00a185d20') }}</label>
              <div class="flex gap-2">
                <input
                  v-model="emailCode"
                  type="text"
                  maxlength="6"
                  class="flex-1 px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                  :placeholder="translateUi('uiMessages.m6bc8d6f5786b')"
                  required
                />
                <button
                  type="button"
                  @click="sendVerificationCode"
                  :disabled="sendingCode || codeSent || !fullEmail"
                  class="px-4 py-2.5 bg-blue-600/80 text-white text-sm rounded-lg hover:bg-blue-500/80 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                >
                  {{ sendingCode ? translateUi('auth.sending') : codeSent ? `${countdown}s` : translateUi('auth.sendCode') }}
                </button>
              </div>
            </div>

            <!-- 注册：邀请码 -->
            <div v-if="mode === 'register'">
              <label class="block text-sm text-white/70 mb-1.5">
                {{ translateUi('uiMessages.m6c371bb023ea', { value1: (requireInviteCode ? ' *' : translateUi('uiMessages.m3d5c3c3dbaca')) }) }}
              </label>
              <input
                v-model="inviteCode"
                type="text"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                :placeholder="requireInviteCode ? translateUi('uiMessages.m9a4186e44aac') : translateUi('uiMessages.md254fb4900c4')"
              />
            </div>

            <!-- 注册：来源 -->
            <div v-if="mode === 'register' && showSignupSource">
              <label class="block text-sm text-white/70 mb-1.5">{{ SIGNUP_SOURCE_LABEL }}</label>
              <select
                v-model="signupSource"
                class="w-full px-3.5 py-2.5 bg-gray-800 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500/50 transition cursor-pointer"
              >
                <option value="" class="bg-gray-800 text-white">{{ translateUi('uiMessages.mda590a8fe3ce') }}</option>
                <option v-for="option in SIGNUP_SOURCE_OPTIONS" :key="option.value" :value="option.value" class="bg-gray-800 text-white">
                  {{ option.label }}
                </option>
              </select>
            </div>

            <!-- 错误 -->
            <div v-if="error" class="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {{ error }}
            </div>

            <!-- 成功 -->
            <div v-if="message" class="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm text-green-400">
              {{ message }}
            </div>

            <button
              type="submit"
              :disabled="loading"
              class="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-medium rounded-lg hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              <span v-if="loading" class="inline-flex items-center">
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                {{ translateUi('common.processing') }}
              </span>
              <span v-else>{{ mode === 'register' ? translateUi('nav.register') : translateUi('nav.login') }}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
