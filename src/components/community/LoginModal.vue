<script setup>
/**
 * LoginModal.vue - 社区登录/注册弹窗
 * 复用 Auth.vue 的登录注册逻辑，以弹窗形式展示
 */
import { ref, watch, computed } from 'vue'
import { getTenantHeaders } from '@/config/tenant'
import { persistAuthSession } from '@/api/client'

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

// 构建完整邮箱
const fullEmail = computed(() => {
  if (emailConfig.value.require_email_verification && emailConfig.value.email_whitelist.length > 0) {
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
    loadSettings()
    loadEmailConfig()
  }
})

// 加载注册设置
async function loadSettings() {
  try {
    const r = await fetch('/api/settings/app', { headers: getTenantHeaders() })
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
    const r = await fetch('/api/email/public-config', { headers: getTenantHeaders() })
    if (r.ok) {
      const data = await r.json()
      emailConfig.value = data
      if (data.email_whitelist && data.email_whitelist.length > 0) {
        emailSuffix.value = data.email_whitelist[0]
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
    const r = await fetch('/api/email/send-verification-code', {
      method: 'POST',
      headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, type: 'register' })
    })
    if (!r.ok) {
      const data = await r.json()
      throw new Error(data.message || '发送失败')
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
    error.value = e.message || '发送验证码失败'
  } finally {
    sendingCode.value = false
  }
}

async function submit() {
  error.value = ''
  message.value = ''

  const needEmailMode = emailConfig.value.require_email_verification && emailConfig.value.email_whitelist.length > 0
  if (mode.value === 'register' && needEmailMode) {
    if (!nickname.value.trim() || !password.value) {
      error.value = '请填写昵称和密码'
      return
    }
  } else if (!account.value.trim() || !password.value) {
    error.value = '请填写用户名和密码'
    return
  }

  if (mode.value === 'register') {
    if (!nickname.value.trim()) {
      error.value = '请填写昵称'
      return
    }
    if (password.value !== confirmPwd.value) {
      error.value = '两次输入的密码不一致'
      return
    }
    if (password.value.length < 6) {
      error.value = '密码长度至少6位'
      return
    }
    if (requireInviteCode.value && !inviteCode.value.trim()) {
      error.value = '请输入邀请码'
      return
    }
    if (emailConfig.value.require_email_verification) {
      if (!fullEmail.value) {
        error.value = '请填写邮箱地址'
        return
      }
      if (!emailCode.value) {
        error.value = '请输入邮箱验证码'
        return
      }
    }
  }

  loading.value = true
  try {
    const url = mode.value === 'register' ? '/api/auth/register' : '/api/auth/login'
    const payload = mode.value === 'register'
      ? {
          username: nickname.value.trim(),
          email: fullEmail.value || account.value,
          password: password.value,
          ...(inviteCode.value ? { invite_code: inviteCode.value } : {}),
          ...(emailCode.value ? { email_code: emailCode.value } : {})
        }
      : { username: account.value, email: account.value, password: password.value }

    const r = await fetch(url, {
      method: 'POST',
      headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!r.ok) {
      const data = await r.json()
      if (data.error === 'disabled') error.value = '账号已被禁用'
      else if (data.error === 'invalid_credentials') error.value = '密码不正确'
      else if (data.error === 'not_found') error.value = '用户不存在'
      else error.value = data.message || '操作失败'
      return
    }

    const j = await r.json()
    persistAuthSession(j.token, j.user || (mode.value === 'register' ? { username: nickname.value.trim() } : null))
    localStorage.removeItem('workflow_auto_saves')
    localStorage.removeItem('canvas_background_tasks')

    message.value = mode.value === 'register' ? '注册成功' : '登录成功'
    setTimeout(() => {
      emit('login-success')
      close()
    }, 500)
  } catch (e) {
    if (!error.value) error.value = '网络错误，请重试'
  } finally {
    loading.value = false
  }
}

async function sendResetCode() {
  if (!resetEmail.value) {
    error.value = '请输入注册时使用的邮箱'
    return
  }
  sendingResetCode.value = true
  error.value = ''
  try {
    const r = await fetch('/api/email/send-verification-code', {
      method: 'POST',
      headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: resetEmail.value, type: 'reset_password' })
    })
    if (!r.ok) {
      const data = await r.json()
      throw new Error(data.message || '发送失败')
    }
    resetCodeSent.value = true
    resetCountdown.value = 60
    message.value = '验证码已发送，请查收邮箱'
    const timer = setInterval(() => {
      resetCountdown.value--
      if (resetCountdown.value <= 0) {
        clearInterval(timer)
        resetCodeSent.value = false
      }
    }, 1000)
  } catch (e) {
    error.value = e.message || '发送验证码失败'
  } finally {
    sendingResetCode.value = false
  }
}

async function resetPassword() {
  error.value = ''
  message.value = ''
  if (!resetEmail.value) {
    error.value = '请输入邮箱'
    return
  }
  if (!resetEmailCode.value) {
    error.value = '请输入验证码'
    return
  }
  if (!newPassword.value) {
    error.value = '请输入新密码'
    return
  }
  if (newPassword.value.length < 6) {
    error.value = '密码长度至少6位'
    return
  }
  if (newPassword.value !== confirmNewPwd.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  loading.value = true
  try {
    const r = await fetch('/api/auth/reset-password', {
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
      throw new Error(data.message || '密码重置失败')
    }
    message.value = '密码重置成功，请使用新密码登录'
    setTimeout(() => {
      exitResetMode()
      account.value = resetEmail.value
      password.value = ''
    }, 1500)
  } catch (e) {
    error.value = e.message || '密码重置失败'
  } finally {
    loading.value = false
  }
}

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
      <div class="relative w-full max-w-md mx-4 bg-gray-900 rounded-2xl border border-white/10 shadow-2xl animate-[slideUp_0.3s_ease]">
        <!-- 头部 -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div class="flex items-center gap-2">
            <button
              v-if="resetMode"
              class="w-7 h-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
              @click="exitResetMode"
              aria-label="返回"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <h2 class="text-lg font-semibold text-white">
              {{ resetMode ? '找回密码' : (mode === 'login' ? '登录' : '注册') }}
            </h2>
          </div>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition"
            @click="close"
            aria-label="关闭"
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
            >登录</button>
            <button
              class="flex-1 py-2 rounded-md text-sm font-medium transition"
              :class="mode === 'register' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'"
              @click="mode = 'register'"
            >注册</button>
          </div>

          <!-- 找回密码表单 -->
          <form v-if="resetMode" @submit.prevent="resetPassword" class="space-y-4">
            <p class="text-sm text-white/50 mb-2">输入注册时使用的邮箱，我们将发送验证码帮你重置密码。</p>

            <div>
              <label class="block text-sm text-white/70 mb-1.5">邮箱</label>
              <input
                v-model="resetEmail"
                type="email"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                placeholder="请输入注册邮箱"
                required
              />
            </div>

            <div>
              <label class="block text-sm text-white/70 mb-1.5">验证码</label>
              <div class="flex gap-2">
                <input
                  v-model="resetEmailCode"
                  type="text"
                  maxlength="6"
                  class="flex-1 px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                  placeholder="请输入6位验证码"
                  required
                />
                <button
                  type="button"
                  @click="sendResetCode"
                  :disabled="sendingResetCode || resetCodeSent || !resetEmail"
                  class="px-4 py-2.5 bg-blue-600/80 text-white text-sm rounded-lg hover:bg-blue-500/80 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                >
                  {{ sendingResetCode ? '发送中...' : resetCodeSent ? `${resetCountdown}s` : '发送验证码' }}
                </button>
              </div>
            </div>

            <div>
              <label class="block text-sm text-white/70 mb-1.5">新密码</label>
              <input
                v-model="newPassword"
                type="password"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                placeholder="请输入新密码（至少6位）"
                required
              />
            </div>

            <div>
              <label class="block text-sm text-white/70 mb-1.5">确认新密码</label>
              <input
                v-model="confirmNewPwd"
                type="password"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                placeholder="请再次输入新密码"
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
                处理中...
              </span>
              <span v-else>重置密码</span>
            </button>

            <div class="text-center">
              <button type="button" class="text-sm text-blue-400 hover:text-blue-300 transition" @click="exitResetMode">
                返回登录
              </button>
            </div>
          </form>

          <!-- 登录/注册表单 -->
          <form v-else @submit.prevent="submit" class="space-y-4">
            <!-- 注册：昵称 -->
            <div v-if="mode === 'register'">
              <label class="block text-sm text-white/70 mb-1.5">昵称 *</label>
              <input
                v-model="nickname"
                type="text"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                placeholder="给自己取一个昵称"
                required
              />
            </div>

            <!-- 邮箱验证模式：前缀+后缀下拉 -->
            <div v-if="mode === 'register' && emailConfig.require_email_verification && emailConfig.email_whitelist.length > 0">
              <label class="block text-sm text-white/70 mb-1.5">邮箱 *</label>
              <div class="flex items-center gap-1">
                <input
                  v-model="emailPrefix"
                  type="text"
                  class="flex-[2] min-w-0 px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                  placeholder="邮箱前缀"
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
            <div v-if="!(mode === 'register' && emailConfig.require_email_verification && emailConfig.email_whitelist.length > 0)">
              <label class="block text-sm text-white/70 mb-1.5">{{ mode === 'register' ? '邮箱' : '用户名/邮箱' }}</label>
              <input
                v-model="account"
                :type="mode === 'register' ? 'email' : 'text'"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                :placeholder="mode === 'register' ? '请输入邮箱地址' : '请输入用户名或邮箱'"
                required
              />
            </div>

            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="text-sm text-white/70">密码</label>
                <button
                  v-if="mode === 'login'"
                  type="button"
                  class="text-xs text-blue-400 hover:text-blue-300 transition"
                  @click="enterResetMode"
                >忘记密码？</button>
              </div>
              <input
                v-model="password"
                type="password"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                placeholder="请输入密码"
                required
              />
            </div>

            <!-- 注册：确认密码 -->
            <div v-if="mode === 'register'">
              <label class="block text-sm text-white/70 mb-1.5">确认密码</label>
              <input
                v-model="confirmPwd"
                type="password"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                placeholder="请再次输入密码"
                required
              />
            </div>

            <!-- 注册：邮箱验证码 -->
            <div v-if="mode === 'register' && emailConfig.require_email_verification">
              <label class="block text-sm text-white/70 mb-1.5">邮箱验证码 *</label>
              <div class="flex gap-2">
                <input
                  v-model="emailCode"
                  type="text"
                  maxlength="6"
                  class="flex-1 px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                  placeholder="请输入6位验证码"
                  required
                />
                <button
                  type="button"
                  @click="sendVerificationCode"
                  :disabled="sendingCode || codeSent || !fullEmail"
                  class="px-4 py-2.5 bg-blue-600/80 text-white text-sm rounded-lg hover:bg-blue-500/80 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
                >
                  {{ sendingCode ? '发送中...' : codeSent ? `${countdown}s` : '发送验证码' }}
                </button>
              </div>
            </div>

            <!-- 注册：邀请码 -->
            <div v-if="mode === 'register'">
              <label class="block text-sm text-white/70 mb-1.5">
                邀请码{{ requireInviteCode ? ' *' : '（可选）' }}
              </label>
              <input
                v-model="inviteCode"
                type="text"
                class="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-500/50 transition"
                :placeholder="requireInviteCode ? '必填邀请码' : '有邀请码可填写'"
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
                处理中...
              </span>
              <span v-else>{{ mode === 'register' ? '注册' : '登录' }}</span>
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
