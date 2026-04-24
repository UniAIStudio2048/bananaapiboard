<script setup>
import { ref, watch } from 'vue'
import { requestFaceVerifyToken, queryFaceVerifyResult } from '@/api/face-verify'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  onVerified: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['update:visible', 'verified'])

const step = ref('idle')
const bytedToken = ref('')
const errorMessage = ref('')
const querying = ref(false)
const countdown = ref(3)
let countdownTimer = null

watch(() => props.visible, (val) => {
  if (val) {
    step.value = 'idle'
    bytedToken.value = ''
    errorMessage.value = ''
    querying.value = false
    countdown.value = 3
    clearCountdownTimer()
  }
})

function clearCountdownTimer() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

function close() {
  clearCountdownTimer()
  emit('update:visible', false)
}

async function startVerification() {
  step.value = 'loading'
  errorMessage.value = ''
  try {
    const result = await requestFaceVerifyToken()
    bytedToken.value = result.byted_token
    window.open(result.h5_url, '_blank', 'width=500,height=700')
    step.value = 'verifying'
  } catch (e) {
    errorMessage.value = e.message || '获取认证页面失败'
    step.value = 'failed'
  }
}

async function queryResult() {
  querying.value = true
  errorMessage.value = ''
  try {
    const result = await queryFaceVerifyResult(bytedToken.value)
    if (result.result) {
      step.value = 'success'
      emit('verified')
      if (props.onVerified) props.onVerified()
      countdown.value = 3
      countdownTimer = setInterval(() => {
        countdown.value--
        if (countdown.value <= 0) {
          close()
        }
      }, 1000)
    } else {
      errorMessage.value = result.status_message || '认证未通过，请重试'
      step.value = 'failed'
    }
  } catch (e) {
    errorMessage.value = e.message || '查询认证结果失败'
    step.value = 'failed'
  } finally {
    querying.value = false
  }
}

function retry() {
  step.value = 'idle'
  errorMessage.value = ''
  bytedToken.value = ''
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fv-fade">
      <div v-if="visible" class="fv-overlay" @click.self="close">
        <div class="fv-dialog" @click.stop>
          <div class="fv-header">
            <h3 class="fv-title">真人身份认证</h3>
            <button class="fv-close" @click="close" aria-label="关闭">
              <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="fv-body">
            <p class="fv-desc">上传真人角色素材需要先完成身份认证，请在弹出的页面中完成人脸扫描验证。</p>

            <div class="fv-status-area">
              <!-- 初始状态 -->
              <template v-if="step === 'idle'">
                <div class="fv-icon-wrap">
                  <svg viewBox="0 0 48 48" fill="none" width="48" height="48">
                    <rect x="8" y="6" width="32" height="36" rx="4" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
                    <circle cx="24" cy="20" r="6" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M14 36c2-4 6-6 10-6s8 2 10 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>
                <p class="fv-hint">点击下方按钮开始身份认证流程</p>
                <button class="fv-btn fv-btn-primary" @click="startVerification">开始认证</button>
              </template>

              <!-- 加载中 -->
              <template v-if="step === 'loading'">
                <div class="fv-spinner"></div>
                <p class="fv-hint">正在准备认证页面...</p>
              </template>

              <!-- 认证中 -->
              <template v-if="step === 'verifying'">
                <div class="fv-icon-wrap fv-icon-verifying">
                  <svg viewBox="0 0 48 48" fill="none" width="48" height="48">
                    <rect x="10" y="4" width="28" height="40" rx="4" stroke="currentColor" stroke-width="1.5"/>
                    <circle cx="24" cy="22" r="5" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M16 34c2-3 5-5 8-5s6 2 8 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    <circle cx="24" cy="22" r="9" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3" opacity="0.5"/>
                  </svg>
                </div>
                <p class="fv-hint">认证页面已打开，请在新窗口中完成人脸扫描</p>
                <button class="fv-btn fv-btn-primary" @click="queryResult" :disabled="querying">
                  <template v-if="querying">
                    <span class="fv-btn-spinner"></span>
                    查询中...
                  </template>
                  <template v-else>查询认证结果</template>
                </button>
              </template>

              <!-- 认证成功 -->
              <template v-if="step === 'success'">
                <div class="fv-icon-wrap fv-icon-success">
                  <svg viewBox="0 0 48 48" fill="none" width="48" height="48">
                    <circle cx="24" cy="24" r="18" stroke="#22c55e" stroke-width="2"/>
                    <path d="M15 24l6 6 12-12" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
                <p class="fv-hint fv-success-text">认证通过</p>
                <p class="fv-countdown">{{ countdown }} 秒后自动关闭</p>
              </template>

              <!-- 认证失败 -->
              <template v-if="step === 'failed'">
                <div class="fv-icon-wrap fv-icon-failed">
                  <svg viewBox="0 0 48 48" fill="none" width="48" height="48">
                    <circle cx="24" cy="24" r="18" stroke="#ef4444" stroke-width="2"/>
                    <path d="M17 17l14 14M31 17L17 31" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>
                  </svg>
                </div>
                <p class="fv-error-text">{{ errorMessage || '认证失败' }}</p>
                <button class="fv-btn fv-btn-primary" @click="retry">重新认证</button>
              </template>
            </div>
          </div>

          <div class="fv-footer">
            <button class="fv-btn fv-btn-secondary" @click="close">关闭</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fv-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  backdrop-filter: blur(4px);
}

.fv-dialog {
  width: 400px;
  max-width: 90vw;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.fv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.fv-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.fv-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s;
}

.fv-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.fv-body {
  padding: 20px 22px;
}

.fv-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.6;
  margin: 0 0 20px;
}

.fv-status-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
  min-height: 160px;
  justify-content: center;
  gap: 14px;
}

.fv-icon-wrap {
  color: rgba(255, 255, 255, 0.35);
}

.fv-icon-verifying {
  color: #60a5fa;
  animation: fv-pulse 2s ease-in-out infinite;
}

.fv-icon-success {
  color: #22c55e;
}

.fv-icon-failed {
  color: #ef4444;
}

.fv-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  margin: 0;
  line-height: 1.5;
}

.fv-success-text {
  color: #22c55e;
  font-weight: 600;
  font-size: 15px;
}

.fv-countdown {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
}

.fv-error-text {
  font-size: 13px;
  color: #fca5a5;
  text-align: center;
  margin: 0;
  line-height: 1.5;
}

.fv-spinner {
  width: 32px;
  height: 32px;
  border: 2.5px solid rgba(255, 255, 255, 0.12);
  border-top-color: rgba(255, 255, 255, 0.7);
  border-radius: 50%;
  animation: fv-spin 0.8s linear infinite;
}

.fv-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 22px;
  font-size: 13px;
  font-weight: 500;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.fv-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fv-btn-primary {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
}

.fv-btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

.fv-btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.fv-btn-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.fv-btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: fv-spin 0.8s linear infinite;
}

.fv-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 22px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

@keyframes fv-spin {
  to { transform: rotate(360deg); }
}

@keyframes fv-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* 过渡动画 */
.fv-fade-enter-active,
.fv-fade-leave-active {
  transition: opacity 0.2s ease;
}

.fv-fade-enter-active .fv-dialog,
.fv-fade-leave-active .fv-dialog {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.fv-fade-enter-from,
.fv-fade-leave-to {
  opacity: 0;
}

.fv-fade-enter-from .fv-dialog {
  transform: scale(0.95) translateY(8px);
  opacity: 0;
}

.fv-fade-leave-to .fv-dialog {
  transform: scale(0.95) translateY(8px);
  opacity: 0;
}
</style>
