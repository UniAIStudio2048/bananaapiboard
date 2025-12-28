<script setup>
/**
 * CanvasToast.vue - 画布模式 Toast 通知组件
 * 用于显示轻量级的提示信息，自动淡出
 */
import { ref, onMounted, computed } from 'vue'

const props = defineProps({
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'success' // success | error | info | warning
  },
  duration: {
    type: Number,
    default: 2000
  }
})

const emit = defineEmits(['close'])

const isVisible = ref(false)
const isLeaving = ref(false)

// 图标映射
const iconMap = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠'
}

const icon = computed(() => iconMap[props.type] || iconMap.info)

onMounted(() => {
  // 入场动画
  requestAnimationFrame(() => {
    isVisible.value = true
  })
  
  // 自动关闭
  setTimeout(() => {
    isLeaving.value = true
    setTimeout(() => {
      emit('close')
    }, 300)
  }, props.duration)
})
</script>

<template>
  <div 
    class="canvas-toast"
    :class="[`toast-${type}`, { 'is-visible': isVisible, 'is-leaving': isLeaving }]"
  >
    <span class="toast-icon">{{ icon }}</span>
    <span class="toast-message">{{ message }}</span>
  </div>
</template>

<style scoped>
.canvas-toast {
  position: fixed;
  top: 80px;
  left: 50%;
  transform: translateX(-50%) translateY(-20px);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  background: rgba(30, 30, 34, 0.95);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 
    0 12px 40px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  z-index: 100000;
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.canvas-toast.is-visible {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.canvas-toast.is-leaving {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

.toast-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 600;
}

/* 成功样式 */
.toast-success .toast-icon {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.toast-success {
  border-color: rgba(34, 197, 94, 0.3);
}

/* 错误样式 */
.toast-error .toast-icon {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.toast-error {
  border-color: rgba(239, 68, 68, 0.3);
}

/* 信息样式 */
.toast-info .toast-icon {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.toast-info {
  border-color: rgba(59, 130, 246, 0.3);
}

/* 警告样式 */
.toast-warning .toast-icon {
  background: rgba(234, 179, 8, 0.2);
  color: #eab308;
}

.toast-warning {
  border-color: rgba(234, 179, 8, 0.3);
}

.toast-message {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}
</style>

