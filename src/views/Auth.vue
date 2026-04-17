<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { getTenantHeaders, getApiUrl } from '@/config/tenant'
import { persistAuthSession } from '@/api/client'

const router = useRouter()
const params = new URLSearchParams(location.search)
const inviteCodeFromUrl = params.get('invite') || params.get('code') || ''
// 如果 URL 中有邀请码，默认显示注册页面
const mode = ref(inviteCodeFromUrl ? 'register' : 'login')
const inviteCode = ref(inviteCodeFromUrl) // 改为响应式，可以手动输入
const account = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')
const message = ref('')

// 邀请奖励配置
const inviteRewards = ref({
  inviter_bonus: 0,
  invitee_bonus: 0
})

// 注册与邀请设置
const requireInviteCode = ref(false)

// 邮箱验证相关
const emailConfig = ref({
  require_email_verification: false,
  has_whitelist: false,
  email_whitelist: []
})
const emailCode = ref('')
const sendingCode = ref(false)
const codeSent = ref(false)
const countdown = ref(0)
const resetMode = ref(false) // 密码重置模式
const newPassword = ref('')
const confirmPassword = ref('')
const emailPrefix = ref('') // 邮箱前缀
const emailSuffix = ref('') // 邮箱后缀
const emailAddress = ref('') // 完整邮箱地址（无白名单时使用）

// 计算属性：是否需要显示独立的邮箱输入框
const needSeparateEmailInput = computed(() => {
  return mode.value === 'register' && emailConfig.value.require_email_verification
})

// 计算属性：是否有白名单
const hasWhitelist = computed(() => {
  return emailConfig.value.has_whitelist && 
         Array.isArray(emailConfig.value.email_whitelist) && 
         emailConfig.value.email_whitelist.length > 0
})

// 加载邀请奖励配置和注册设置
async function loadInviteRewards() {
  try {
    const r = await fetch(getApiUrl('/api/points-config'))
    if (r.ok) {
      const data = await r.json()
      if (data.inviter_bonus !== undefined) inviteRewards.value.inviter_bonus = data.inviter_bonus
      if (data.invitee_bonus !== undefined) inviteRewards.value.invitee_bonus = data.invitee_bonus
    }

    // 加载注册与邀请设置
    const settingsRes = await fetch(getApiUrl('/api/settings/app'), {
      headers: getTenantHeaders()
    })
    if (settingsRes.ok) {
      const settingsData = await settingsRes.json()
      if (settingsData.settings?.require_invite_code !== undefined) {
        requireInviteCode.value = settingsData.settings.require_invite_code
        console.log('[Auth] 邀请码强制注册:', requireInviteCode.value)
      }
    }
  } catch (e) {
    console.warn('加载邀请配置失败', e)
  }
}

// 加载邮箱配置
async function loadEmailConfig() {
  try {
    const r = await fetch(getApiUrl('/api/email/public-config'), {
      headers: getTenantHeaders()
    })
    if (r.ok) {
      const data = await r.json()
      emailConfig.value = data
      console.log('[Auth] 邮箱配置已加载:', data)
      
      if (data.require_email_verification) {
        console.log('[Auth] ✅ 已开启邮箱强制验证')
      } else {
        console.log('[Auth] ⚠️ 未开启邮箱强制验证')
      }
    }
  } catch (e) {
    console.warn('加载邮箱配置失败', e)
  }
}

// 邀请奖励提示文本
const inviteRewardText = computed(() => {
  const inviter = inviteRewards.value.inviter_bonus
  const invitee = inviteRewards.value.invitee_bonus
  if (inviter === 0 && invitee === 0) return ''
  return `邀请人获得${inviter}积分，被邀请人获得${invitee}积分`
})

// 构建完整邮箱地址
const fullEmail = computed(() => {
  // 注册模式且需要邮箱验证
  if (needSeparateEmailInput.value) {
    if (hasWhitelist.value) {
      // 有白名单，使用前缀+后缀
      if (emailPrefix.value && emailSuffix.value) {
        return `${emailPrefix.value}@${emailSuffix.value}`
      }
      return ''
    } else {
      // 无白名单，使用完整邮箱地址
      return emailAddress.value
    }
  }
  // 其他情况使用原来的account字段
  return account.value
})

// 发送验证码
async function sendVerificationCode() {
  const email = fullEmail.value
  if (!email) {
    error.value = '请先输入邮箱'
    return
  }

  // 验证邮箱格式
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    error.value = '请输入有效的邮箱地址'
    return
  }

  sendingCode.value = true
  error.value = ''
  
  try {
    const type = resetMode.value ? 'reset_password' : 'register'
    const r = await fetch(getApiUrl('/api/email/send-verification-code'), {
      method: 'POST',
      headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, type })
    })
    
    if (!r.ok) {
      const data = await r.json()
      throw new Error(data.message || '发送失败')
    }
    
    codeSent.value = true
    message.value = '验证码已发送到您的邮箱'
    
    // 开始倒计时
    countdown.value = 60
    const timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0) {
        clearInterval(timer)
        codeSent.value = false
      }
    }, 1000)
    
    setTimeout(() => { message.value = '' }, 3000)
  } catch (e) {
    error.value = e.message || '发送验证码失败'
  } finally {
    sendingCode.value = false
  }
}

// 重置密码
async function resetPassword() {
  error.value = ''
  
  if (!account.value || !emailCode.value || !newPassword.value) {
    error.value = '请填写所有必填项'
    return
  }
  
  if (newPassword.value !== confirmPassword.value) {
    error.value = '两次输入的密码不一致'
    return
  }
  
  if (newPassword.value.length < 6) {
    error.value = '密码长度至少6位'
    return
  }
  
  loading.value = true
  
  try {
    const r = await fetch(getApiUrl('/api/auth/reset-password'), {
      method: 'POST',
      headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: account.value,
        code: emailCode.value,
        new_password: newPassword.value
      })
    })
    
    if (!r.ok) {
      const data = await r.json()
      throw new Error(data.message || '重置失败')
    }
    
    message.value = '密码重置成功，请使用新密码登录'
    setTimeout(() => {
      resetMode.value = false
      mode.value = 'login'
      emailCode.value = ''
      newPassword.value = ''
      confirmPassword.value = ''
    }, 2000)
  } catch (e) {
    error.value = e.message || '密码重置失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadInviteRewards()
  loadEmailConfig()
})

async function submit() {
  error.value = ''
  message.value = ''
  
  // 获取实际使用的邮箱地址
  const email = fullEmail.value

  // 注册时检查邮箱验证要求
  if (mode.value === 'register' && emailConfig.value.require_email_verification) {
    if (!email) {
      error.value = hasWhitelist.value ? '请填写邮箱前缀并选择后缀' : '请输入邮箱地址'
      return
    }
    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      error.value = '请输入有效的邮箱地址'
      return
    }
    if (!emailCode.value) {
      error.value = '请输入邮箱验证码'
      return
    }
  }

  // 注册时检查邀请码要求
  if (mode.value === 'register' && requireInviteCode.value) {
    const trimmedCode = inviteCode.value?.trim() || ''
    if (!trimmedCode) {
      error.value = '请输入邀请码，该租户已开启邀请码注册'
      return
    }
    // 验证邀请码格式（6-12位字母或数字，大小写均可）
    if (!/^[a-z0-9]{6,12}$/i.test(trimmedCode)) {
      error.value = '邀请码格式无效，应为6-12位字母或数字'
      return
    }
  }

  loading.value = true
  try {
    const url = mode.value === 'register' ? '/api/auth/register' : '/api/auth/login'
    const payload = mode.value === 'register'
      ? { 
          username: account.value, 
          email: email, 
          password: password.value, 
          ...(inviteCode.value ? { invite_code: inviteCode.value } : {}),
          ...(emailCode.value ? { email_code: emailCode.value } : {})
        }
      : { username: account.value, email: account.value, password: password.value }
    const r = await fetch(url, { method: 'POST', headers: { ...getTenantHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (!r.ok) {
      const data = await r.json()
      // 根据错误类型显示不同的提示
      if (data.error === 'disabled') {
        error.value = '账号已被禁用'
      } else if (data.error === 'invalid_credentials') {
        error.value = '密码不正确，请重试'
      } else if (data.error === 'not_found') {
        error.value = '用户不存在'
      } else {
        error.value = data.message || '提交失败'
      }
      throw new Error(data.error || 'failed')
    }
    const j = await r.json()
    persistAuthSession(j.token, j.user || { username: account.value })

    // 🔧 修复：登录成功后清除上一个用户的工作流历史和后台任务
    // 避免切换用户时看到上一个用户的数据，导致任务提交失败
    try {
      // 清除工作流历史
      localStorage.removeItem('workflow_auto_saves')
      // 清除后台任务
      localStorage.removeItem('canvas_background_tasks')
      console.log('[Auth] 已清除上一个用户的工作流历史和后台任务')
    } catch (e) {
      console.warn('[Auth] 清除用户数据失败:', e)
    }
    
    message.value = mode.value === 'register' ? '注册成功，已赠送积分' : '登录成功'
    const params = new URLSearchParams(location.search)
    const redirect = params.get('redirect') || ''
    setTimeout(() => { location.href = redirect || '/' }, 600)
  } catch (e) {
    if (!error.value) error.value = '提交失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl flex items-center justify-center shadow-lg">
          <span class="text-white font-bold text-2xl">AI</span>
        </div>
        <h2 class="text-3xl font-bold gradient-text">
          {{ mode === 'register' ? '创建账户' : '欢迎回来' }}
        </h2>
        <p class="mt-2 text-slate-600 dark:text-slate-400">
          {{ mode === 'register' ? '开始您的AI创作之旅' : '继续您的创意探索' }}
        </p>
      </div>

      <!-- 登录/注册卡片 -->
      <div class="card p-8">
        <!-- 模式切换 -->
        <div v-if="!resetMode" class="flex space-x-2 mb-8 bg-slate-100 dark:bg-dark-600 rounded-lg p-1">
          <button 
            @click="mode = 'login'"
            class="flex-1 py-2 px-4 rounded-md font-medium transition-all duration-200"
            :class="mode === 'login' 
              ? 'bg-white dark:bg-dark-700 text-primary-600 dark:text-primary-400 shadow-sm' 
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
          >
            👤 登录
          </button>
          <button 
            @click="mode = 'register'"
            class="flex-1 py-2 px-4 rounded-md font-medium transition-all duration-200"
            :class="mode === 'register' 
              ? 'bg-white dark:bg-dark-700 text-primary-600 dark:text-primary-400 shadow-sm' 
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
          >
            ⭐ 注册
          </button>
        </div>
        
        <!-- 重置密码标题 -->
        <div v-if="resetMode" class="mb-6">
          <h3 class="text-lg font-semibold text-slate-800 dark:text-white">🔑 重置密码</h3>
          <p class="text-sm text-slate-600 dark:text-slate-400 mt-1">
            请输入注册邮箱，我们将发送验证码到您的邮箱
          </p>
        </div>

        <!-- 表单 -->
        <form @submit.prevent="resetMode ? resetPassword() : submit()" class="space-y-6">
          <!-- 注册模式且需要邮箱验证：显示用户名和邮箱分开的输入 -->
          <div v-if="needSeparateEmailInput">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              👤 用户名 *
            </label>
            <input 
              v-model="account" 
              type="text" 
              class="input"
              placeholder="请输入用户名"
              required
            />
          </div>

          <!-- 有白名单：邮箱前缀+下拉选择后缀 -->
          <div v-if="needSeparateEmailInput && hasWhitelist">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              📧 邮箱 *
            </label>
            <div class="flex items-center gap-2">
              <input 
                v-model="emailPrefix" 
                type="text" 
                class="input" 
                style="flex: 2; min-width: 0;"
                placeholder="邮箱前缀"
                required
              />
              <span class="flex items-center text-slate-700 dark:text-slate-300 font-medium">@</span>
              <select 
                v-model="emailSuffix" 
                class="input bg-white dark:bg-dark-700 text-slate-900 dark:text-slate-100 font-medium" 
                style="flex: 1; min-width: 120px;"
                required
              >
                <option value="" disabled>选择后缀</option>
                <option v-for="domain in emailConfig.email_whitelist" :key="domain" :value="domain">
                  {{ domain }}
                </option>
              </select>
            </div>
            <p class="text-xs text-amber-600 dark:text-amber-400 mt-1">
              ⚠️ 仅白名单邮箱可以注册
            </p>
          </div>

          <!-- 无白名单但需要验证：完整邮箱输入框 -->
          <div v-if="needSeparateEmailInput && !hasWhitelist">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              📧 邮箱 *
            </label>
            <input 
              v-model="emailAddress" 
              type="email" 
              class="input"
              placeholder="请输入您的邮箱地址"
              required
            />
          </div>

          <!-- 其他模式（登录/不需要邮箱验证的注册）：显示原来的邮箱/登录名输入框 -->
          <div v-if="!needSeparateEmailInput">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              📧 邮箱/登录名
            </label>
            <input 
              v-model="account" 
              type="text" 
              class="input"
              placeholder="请输入邮箱或登录名"
              required
            />
          </div>

          <div v-if="!resetMode">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              🔒 密码
            </label>
            <input 
              v-model="password" 
              type="password" 
              class="input"
              placeholder="请输入密码"
              required
            />
          </div>

          <!-- 邮箱验证码（注册时且需要验证时显示，或密码重置时） -->
          <div v-if="needSeparateEmailInput || resetMode">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              📬 邮箱验证码 *
            </label>
            <div class="flex space-x-2">
              <input 
                v-model="emailCode" 
                type="text" 
                class="input flex-1"
                placeholder="请输入6位验证码"
                maxlength="6"
                required
              />
              <button
                type="button"
                @click="sendVerificationCode"
                :disabled="sendingCode || codeSent || !fullEmail"
                class="btn-secondary whitespace-nowrap"
              >
                {{ sendingCode ? '发送中...' : codeSent ? `${countdown}秒后重发` : '发送验证码' }}
              </button>
            </div>
          </div>

          <!-- 新密码（密码重置时显示） -->
          <div v-if="resetMode">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              🔒 新密码 *
            </label>
            <input 
              v-model="newPassword" 
              type="password" 
              class="input"
              placeholder="请输入新密码（至少6位）"
              required
            />
          </div>

          <!-- 确认新密码（密码重置时显示） -->
          <div v-if="resetMode">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              🔒 确认新密码 *
            </label>
            <input 
              v-model="confirmPassword" 
              type="password" 
              class="input"
              placeholder="请再次输入新密码"
              required
            />
          </div>

          <!-- 邀请码输入（仅注册时显示） -->
          <div v-if="mode === 'register' && !resetMode">
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              🎁 邀请码{{ requireInviteCode ? ' *' : '（可选）' }}
            </label>
            <input
              v-model="inviteCode"
              type="text"
              class="input"
              :placeholder="requireInviteCode ? '必填：请输入邀请码' : '请输入邀请码'"
              :required="requireInviteCode"
            />
            <p v-if="requireInviteCode" class="mt-2 text-xs text-orange-500 dark:text-orange-400">
              ⚠️ 该租户已开启邀请码注册，必须填写有效的邀请码
            </p>
            <p v-else-if="inviteRewardText" class="mt-2 text-xs text-slate-500 dark:text-slate-400">
              💡 填写邀请码即可获得奖励：{{ inviteRewardText }}
            </p>
          </div>

          <!-- 提交按钮 -->
          <button 
            type="submit"
            :disabled="loading"
            class="w-full btn-primary text-lg py-3 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <span v-if="loading" class="inline-flex items-center">
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              处理中...
            </span>
            <span v-else>
              {{ resetMode ? '重置密码' : (mode === 'register' ? '注册账户' : '登录') }}
            </span>
          </button>

          <!-- 忘记密码/返回登录 -->
          <div class="text-center">
            <button
              v-if="!resetMode && mode === 'login'"
              type="button"
              @click="resetMode = true"
              class="text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              忘记密码？
            </button>
            <button
              v-if="resetMode"
              type="button"
              @click="resetMode = false; mode = 'login'"
              class="text-sm text-slate-600 dark:text-slate-400 hover:underline"
            >
              返回登录
            </button>
          </div>
        </form>

        <!-- 错误提示 -->
        <div v-if="error" class="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div class="flex items-center">
            <svg class="w-5 h-5 text-red-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path>
            </svg>
            <p class="text-sm text-red-700 dark:text-red-400">{{ error }}</p>
          </div>
        </div>

        <!-- 成功提示 -->
        <div v-if="message" class="mt-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div class="flex items-center">
            <svg class="w-5 h-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
            </svg>
            <p class="text-sm text-green-700 dark:text-green-400">{{ message }}</p>
          </div>
        </div>

        <!-- 邀请码提示 -->
        <div v-if="mode === 'register' && inviteCode && inviteRewardText" class="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div class="flex items-center">
            <svg class="w-5 h-5 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"></path>
            </svg>
            <div class="text-sm text-blue-700 dark:text-blue-400">
              <p class="font-medium">🎉 邀请码已填写！</p>
              <p class="mt-1">{{ inviteRewardText }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 功能介绍 -->
      <div class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="text-center">
          <div class="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center">
            <span class="text-white text-xl">🎨</span>
          </div>
          <h4 class="font-medium text-slate-900 dark:text-slate-100">AI图像生成</h4>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">创造独特的视觉作品</p>
        </div>
        <div class="text-center">
          <div class="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
            <span class="text-white text-xl">⚡</span>
          </div>
          <h4 class="font-medium text-slate-900 dark:text-slate-100">积分系统</h4>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">注册赠送，邀请有奖</p>
        </div>
        <div class="text-center">
          <div class="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center">
            <span class="text-white text-xl">📱</span>
          </div>
          <h4 class="font-medium text-slate-900 dark:text-slate-100">响应式设计</h4>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">随时随地创作</p>
        </div>
      </div>
    </div>
  </div>
</template>
