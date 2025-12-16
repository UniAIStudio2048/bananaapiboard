<script setup>
/**
 * OnboardingGuide.vue - 画布模式新手导航组件
 * 高级黑白灰UI风格，带流畅动效
 */
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'complete'])

// 当前步骤索引
const currentStep = ref(0)

// 是否显示内容（用于入场动画）
const showContent = ref(false)

// 引导步骤配置
const steps = computed(() => [
  {
    id: 'welcome',
    title: t('onboarding.welcome.title'),
    subtitle: t('onboarding.welcome.subtitle'),
    description: t('onboarding.welcome.description'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </svg>`,
    highlight: null,
    animation: 'float'
  },
  {
    id: 'toolbar',
    title: t('onboarding.toolbar.title'),
    subtitle: t('onboarding.toolbar.subtitle'),
    description: t('onboarding.toolbar.description'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>`,
    highlight: '.canvas-toolbar',
    animation: 'pulse'
  },
  {
    id: 'nodes',
    title: t('onboarding.nodes.title'),
    subtitle: t('onboarding.nodes.subtitle'),
    description: t('onboarding.nodes.description'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>
      <path d="M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
    </svg>`,
    highlight: null,
    animation: 'connect'
  },
  {
    id: 'workflow',
    title: t('onboarding.workflow.title'),
    subtitle: t('onboarding.workflow.subtitle'),
    description: t('onboarding.workflow.description'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M3 12h4l3-9 4 18 3-9h4"/>
    </svg>`,
    highlight: null,
    animation: 'flow'
  },
  {
    id: 'tips',
    title: t('onboarding.tips.title'),
    subtitle: t('onboarding.tips.subtitle'),
    description: t('onboarding.tips.description'),
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 16v-4"/>
      <path d="M12 8h.01"/>
    </svg>`,
    highlight: null,
    animation: 'sparkle'
  }
])

// 当前步骤
const currentStepData = computed(() => steps.value[currentStep.value])

// 是否是最后一步
const isLastStep = computed(() => currentStep.value === steps.value.length - 1)

// 进度百分比
const progress = computed(() => ((currentStep.value + 1) / steps.value.length) * 100)

// 下一步
function nextStep() {
  if (isLastStep.value) {
    complete()
  } else {
    // 淡出当前内容
    showContent.value = false
    setTimeout(() => {
      currentStep.value++
      // 淡入新内容
      nextTick(() => {
        showContent.value = true
      })
    }, 200)
  }
}

// 上一步
function prevStep() {
  if (currentStep.value > 0) {
    showContent.value = false
    setTimeout(() => {
      currentStep.value--
      nextTick(() => {
        showContent.value = true
      })
    }, 200)
  }
}

// 跳转到指定步骤
function goToStep(index) {
  if (index >= 0 && index < steps.value.length && index !== currentStep.value) {
    showContent.value = false
    setTimeout(() => {
      currentStep.value = index
      nextTick(() => {
        showContent.value = true
      })
    }, 200)
  }
}

// 跳过
function skip() {
  complete(true)
}

// 完成
function complete(skipped = false) {
  // 保存设置：新手引导已完成，默认关闭
  localStorage.setItem('canvasOnboardingCompleted', 'true')
  localStorage.setItem('canvasOnboardingEnabled', 'false')
  
  emit('complete', { skipped })
  emit('close')
}

// 监听visible变化
watch(() => props.visible, (val) => {
  if (val) {
    currentStep.value = 0
    // 延迟显示内容，让遮罩先出现
    setTimeout(() => {
      showContent.value = true
    }, 100)
  } else {
    showContent.value = false
  }
}, { immediate: true })
</script>

<template>
  <Transition name="overlay-fade">
    <div v-if="visible" class="onboarding-overlay" @click.self="skip">
      <!-- 背景装饰 -->
      <div class="bg-decoration">
        <div class="grid-pattern"></div>
        <div class="gradient-orb orb-1"></div>
        <div class="gradient-orb orb-2"></div>
        <div class="gradient-orb orb-3"></div>
      </div>
      
      <!-- 主容器 -->
      <Transition name="card-slide">
        <div v-if="showContent" class="onboarding-container">
          <!-- 进度条 -->
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
          </div>
          
          <!-- 头部 -->
          <div class="onboarding-header">
            <div class="step-indicator">
              <span class="step-current">{{ currentStep + 1 }}</span>
              <span class="step-separator">/</span>
              <span class="step-total">{{ steps.length }}</span>
            </div>
            <button class="skip-btn" @click="skip">
              {{ t('onboarding.skip') }}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
          
          <!-- 内容区域 -->
          <div class="onboarding-content">
            <!-- 动画图标区域 -->
            <div class="icon-area" :class="[`animation-${currentStepData.animation}`]">
              <div class="icon-wrapper" v-html="currentStepData.icon"></div>
              
              <!-- 装饰元素 -->
              <div class="decoration-ring ring-1"></div>
              <div class="decoration-ring ring-2"></div>
              <div class="decoration-dots">
                <span v-for="i in 8" :key="i" class="dot" :style="{ '--i': i }"></span>
              </div>
            </div>
            
            <!-- 文字内容 -->
            <div class="text-content">
              <div class="step-subtitle">{{ currentStepData.subtitle }}</div>
              <h2 class="step-title">{{ currentStepData.title }}</h2>
              <p class="step-description">{{ currentStepData.description }}</p>
            </div>
            
            <!-- 步骤指示点 -->
            <div class="step-dots">
              <button
                v-for="(step, index) in steps"
                :key="step.id"
                class="step-dot"
                :class="{ active: index === currentStep, completed: index < currentStep }"
                @click="goToStep(index)"
              >
                <span class="dot-inner"></span>
              </button>
            </div>
          </div>
          
          <!-- 底部按钮 -->
          <div class="onboarding-footer">
            <button 
              v-if="currentStep > 0" 
              class="nav-btn prev-btn" 
              @click="prevStep"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              {{ t('onboarding.prev') }}
            </button>
            <div v-else class="spacer"></div>
            
            <button 
              class="nav-btn next-btn" 
              :class="{ 'is-complete': isLastStep }"
              @click="nextStep"
            >
              {{ isLastStep ? t('onboarding.start') : t('onboarding.next') }}
              <svg v-if="!isLastStep" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12l5 5L20 7"/>
              </svg>
            </button>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
/* 遮罩层 */
.onboarding-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(12px);
}

/* 背景装饰 */
.bg-decoration {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.grid-pattern {
  position: absolute;
  inset: 0;
  background-image: 
    linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
  background-size: 60px 60px;
  animation: gridMove 20s linear infinite;
}

@keyframes gridMove {
  0% { background-position: 0 0; }
  100% { background-position: 60px 60px; }
}

.gradient-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: 0.3;
}

.orb-1 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
  top: -200px;
  left: -200px;
  animation: orbFloat 8s ease-in-out infinite;
}

.orb-2 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(180, 180, 180, 0.1) 0%, transparent 70%);
  bottom: -100px;
  right: -100px;
  animation: orbFloat 10s ease-in-out infinite reverse;
}

.orb-3 {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(200, 200, 200, 0.08) 0%, transparent 70%);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation: orbPulse 6s ease-in-out infinite;
}

@keyframes orbFloat {
  0%, 100% { transform: translateY(0) scale(1); }
  50% { transform: translateY(-30px) scale(1.1); }
}

@keyframes orbPulse {
  0%, 100% { opacity: 0.2; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 0.4; transform: translate(-50%, -50%) scale(1.2); }
}

/* 主容器 */
.onboarding-container {
  position: relative;
  width: 90%;
  max-width: 520px;
  background: linear-gradient(
    145deg,
    rgba(30, 30, 30, 0.95) 0%,
    rgba(20, 20, 20, 0.98) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  box-shadow: 
    0 40px 80px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  overflow: hidden;
}

/* 进度条 */
.progress-bar {
  height: 3px;
  background: rgba(255, 255, 255, 0.06);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #666 0%, #fff 100%);
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 头部 */
.onboarding-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.step-indicator {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-family: 'SF Mono', Monaco, monospace;
}

.step-current {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
}

.step-separator {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.3);
}

.step-total {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
}

.skip-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.25s ease;
}

.skip-btn svg {
  width: 14px;
  height: 14px;
}

.skip-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.8);
}

/* 内容区域 */
.onboarding-content {
  padding: 40px 28px;
  text-align: center;
}

/* 图标区域 */
.icon-area {
  position: relative;
  width: 140px;
  height: 140px;
  margin: 0 auto 32px;
}

.icon-wrapper {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 64px;
  height: 64px;
  color: #fff;
  z-index: 2;
}

.icon-wrapper svg {
  width: 100%;
  height: 100%;
}

/* 装饰环 */
.decoration-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.ring-1 {
  width: 100px;
  height: 100px;
  animation: ringPulse 3s ease-in-out infinite;
}

.ring-2 {
  width: 130px;
  height: 130px;
  animation: ringPulse 3s ease-in-out infinite 0.5s;
}

@keyframes ringPulse {
  0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 0.6; transform: translate(-50%, -50%) scale(1.05); }
}

/* 装饰点 */
.decoration-dots {
  position: absolute;
  inset: 0;
}

.dot {
  position: absolute;
  width: 4px;
  height: 4px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  top: 50%;
  left: 50%;
  transform: rotate(calc(var(--i) * 45deg)) translateY(-60px);
  animation: dotPulse 2s ease-in-out infinite;
  animation-delay: calc(var(--i) * 0.1s);
}

@keyframes dotPulse {
  0%, 100% { opacity: 0.2; transform: rotate(calc(var(--i) * 45deg)) translateY(-60px) scale(1); }
  50% { opacity: 0.8; transform: rotate(calc(var(--i) * 45deg)) translateY(-60px) scale(1.5); }
}

/* 动画类型 */
.animation-float .icon-wrapper {
  animation: iconFloat 3s ease-in-out infinite;
}

@keyframes iconFloat {
  0%, 100% { transform: translate(-50%, -50%) translateY(0); }
  50% { transform: translate(-50%, -50%) translateY(-8px); }
}

.animation-pulse .icon-wrapper {
  animation: iconPulse 2s ease-in-out infinite;
}

@keyframes iconPulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.9; }
}

.animation-connect .icon-wrapper {
  animation: iconConnect 2.5s ease-in-out infinite;
}

@keyframes iconConnect {
  0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
  25% { transform: translate(-50%, -50%) rotate(5deg); }
  75% { transform: translate(-50%, -50%) rotate(-5deg); }
}

.animation-flow .icon-wrapper {
  animation: iconFlow 2s ease-in-out infinite;
}

@keyframes iconFlow {
  0%, 100% { transform: translate(-50%, -50%) translateX(0); }
  25% { transform: translate(-50%, -50%) translateX(-4px); }
  75% { transform: translate(-50%, -50%) translateX(4px); }
}

.animation-sparkle .icon-wrapper {
  animation: iconSparkle 2s ease-in-out infinite;
}

@keyframes iconSparkle {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.3); }
}

/* 文字内容 */
.text-content {
  margin-bottom: 28px;
}

.step-subtitle {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.step-title {
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 16px;
  line-height: 1.3;
}

.step-description {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.7;
  margin: 0;
  max-width: 400px;
  margin: 0 auto;
}

/* 步骤指示点 */
.step-dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.step-dot {
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.dot-inner {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  transition: all 0.3s ease;
}

.step-dot:hover .dot-inner {
  background: rgba(255, 255, 255, 0.4);
  transform: scale(1.2);
}

.step-dot.completed .dot-inner {
  background: rgba(255, 255, 255, 0.4);
}

.step-dot.active .dot-inner {
  width: 24px;
  border-radius: 4px;
  background: #fff;
}

/* 底部 */
.onboarding-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.2);
}

.spacer {
  width: 100px;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.nav-btn svg {
  width: 18px;
  height: 18px;
}

.prev-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.7);
}

.prev-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.25);
  color: #fff;
}

.next-btn {
  background: #fff;
  border: none;
  color: #0a0a0a;
}

.next-btn:hover {
  background: rgba(255, 255, 255, 0.9);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(255, 255, 255, 0.15);
}

.next-btn.is-complete {
  background: linear-gradient(135deg, #fff 0%, #e0e0e0 100%);
}

/* 过渡动画 */
.overlay-fade-enter-active {
  animation: overlayIn 0.4s ease-out;
}

.overlay-fade-leave-active {
  animation: overlayOut 0.3s ease-in;
}

@keyframes overlayIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes overlayOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

.card-slide-enter-active {
  animation: cardIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.card-slide-leave-active {
  animation: cardOut 0.3s ease-in;
}

@keyframes cardIn {
  from {
    opacity: 0;
    transform: translateY(40px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes cardOut {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(-20px) scale(0.98);
  }
}

/* 响应式 */
@media (max-width: 600px) {
  .onboarding-container {
    max-width: 95%;
    border-radius: 20px;
  }
  
  .onboarding-header {
    padding: 16px 20px;
  }
  
  .onboarding-content {
    padding: 30px 20px;
  }
  
  .icon-area {
    width: 120px;
    height: 120px;
    margin-bottom: 24px;
  }
  
  .icon-wrapper {
    width: 48px;
    height: 48px;
  }
  
  .ring-1 { width: 80px; height: 80px; }
  .ring-2 { width: 110px; height: 110px; }
  
  .dot {
    transform: rotate(calc(var(--i) * 45deg)) translateY(-50px);
  }
  
  @keyframes dotPulse {
    0%, 100% { opacity: 0.2; transform: rotate(calc(var(--i) * 45deg)) translateY(-50px) scale(1); }
    50% { opacity: 0.8; transform: rotate(calc(var(--i) * 45deg)) translateY(-50px) scale(1.5); }
  }
  
  .step-title {
    font-size: 22px;
  }
  
  .step-description {
    font-size: 14px;
  }
  
  .onboarding-footer {
    padding: 16px 20px;
  }
  
  .nav-btn {
    padding: 10px 18px;
    font-size: 13px;
  }
}
</style>

