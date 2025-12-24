<template>
  <!-- 黑白灰风格的画布模式弹窗 -->
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="modelValue" class="canvas-dialog-overlay" @click.self="handleCancel">
        <div class="canvas-dialog" :class="{ 'dialog-confirm': type === 'confirm' }">
          <!-- 标题 -->
          <div v-if="title" class="dialog-header">
            <h3 class="dialog-title">{{ title }}</h3>
          </div>

          <!-- 内容 -->
          <div class="dialog-body">
            <p class="dialog-message">{{ message }}</p>
            <p v-if="detail" class="dialog-detail">{{ detail }}</p>
          </div>

          <!-- 按钮 -->
          <div class="dialog-footer">
            <button
              v-if="type === 'confirm'"
              class="dialog-btn dialog-btn-cancel"
              @click="handleCancel"
            >
              {{ cancelText || '取消' }}
            </button>
            <button
              class="dialog-btn dialog-btn-confirm"
              @click="handleConfirm"
            >
              {{ confirmText || '确定' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  type: {
    type: String,
    default: 'alert', // 'alert' | 'confirm'
    validator: (value) => ['alert', 'confirm'].includes(value)
  },
  title: {
    type: String,
    default: ''
  },
  message: {
    type: String,
    required: true
  },
  detail: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: '确定'
  },
  cancelText: {
    type: String,
    default: '取消'
  }
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel'])

function handleConfirm() {
  emit('confirm')
  emit('update:modelValue', false)
}

function handleCancel() {
  emit('cancel')
  emit('update:modelValue', false)
}
</script>

<style scoped>
.canvas-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.canvas-dialog {
  background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow:
    0 20px 60px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset;
  max-width: 440px;
  width: 100%;
  overflow: hidden;
  animation: dialog-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes dialog-enter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dialog-header {
  padding: 24px 24px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
  letter-spacing: -0.01em;
}

.dialog-body {
  padding: 24px;
  color: #e0e0e0;
}

.dialog-message {
  font-size: 15px;
  line-height: 1.6;
  margin: 0;
  color: #e0e0e0;
  font-weight: 500;
}

.dialog-detail {
  font-size: 13px;
  line-height: 1.5;
  margin: 12px 0 0;
  color: #999;
  font-weight: 400;
}

.dialog-footer {
  padding: 16px 24px 24px;
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.dialog-btn {
  height: 40px;
  padding: 0 24px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  border: none;
  outline: none;
  letter-spacing: 0.02em;
}

.dialog-btn-cancel {
  background: rgba(255, 255, 255, 0.08);
  color: #b0b0b0;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.dialog-btn-cancel:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #d0d0d0;
  border-color: rgba(255, 255, 255, 0.18);
  transform: translateY(-1px);
}

.dialog-btn-cancel:active {
  transform: translateY(0);
}

.dialog-btn-confirm {
  background: linear-gradient(135deg, #555 0%, #444 100%);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}

.dialog-btn-confirm:hover {
  background: linear-gradient(135deg, #666 0%, #555 100%);
  border-color: rgba(255, 255, 255, 0.25);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.15) inset;
  transform: translateY(-1px);
}

.dialog-btn-confirm:active {
  transform: translateY(0);
  box-shadow:
    0 1px 4px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}

/* 过渡动画 */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-fade-enter-active .canvas-dialog {
  animation: dialog-enter 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.dialog-fade-leave-active .canvas-dialog {
  animation: dialog-leave 0.15s cubic-bezier(0.4, 0, 1, 1);
}

@keyframes dialog-leave {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
}
</style>
