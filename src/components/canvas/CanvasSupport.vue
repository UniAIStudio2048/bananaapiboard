<script setup>
/**
 * CanvasSupport.vue - 画布模式客服按钮组件
 * 在画布右上角显示一个客服图标，点击可查看客服链接和二维码
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { getTenantHeaders } from '@/config/tenant'

const props = defineProps({
  // 画布主题：dark / light
  theme: {
    type: String,
    default: 'dark'
  }
})

// 客服配置数据
const supportConfig = ref(null)
const isVisible = ref(false)
const showPopup = ref(false)

// 加载客服配置
async function loadSupportConfig() {
  try {
    // 尝试获取 token
    const token = localStorage.getItem('token')
    const headers = {
      ...getTenantHeaders(),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }

    const r = await fetch('/api/settings/app', {
      headers
    })
    if (r.ok) {
      const data = await r.json()
      const helpLinks = data.settings?.help_links || {}

      // 只有当配置了 show_support_in_canvas 且有客服链接或二维码时才显示
      if (helpLinks.show_support_in_canvas && (helpLinks.contact_support || helpLinks.contact_support_qr)) {
        supportConfig.value = {
          link: helpLinks.contact_support || '',
          linkName: helpLinks.contact_support_name || '联系客服',
          qrImage: helpLinks.contact_support_qr || ''
        }
        isVisible.value = true
      }
    }
  } catch (e) {
    console.error('[CanvasSupport] 加载客服配置失败', e)
  }
}

// 点击客服按钮
function togglePopup() {
  showPopup.value = !showPopup.value
}

// 关闭弹窗
function closePopup() {
  showPopup.value = false
}

// 打开链接
function openLink() {
  if (supportConfig.value?.link) {
    window.open(supportConfig.value.link, '_blank', 'noopener,noreferrer')
  }
}

// 点击弹窗外部关闭
function handleClickOutside(event) {
  if (showPopup.value) {
    const popup = document.querySelector('.canvas-support-popup')
    const trigger = document.querySelector('.canvas-support-trigger')
    if (popup && trigger && !popup.contains(event.target) && !trigger.contains(event.target)) {
      closePopup()
    }
  }
}

onMounted(() => {
  loadSupportConfig()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div v-if="isVisible" class="canvas-support-wrapper">
    <!-- 客服按钮 -->
    <button
      class="canvas-support-trigger"
      :class="{ 'theme-light': props.theme === 'light' }"
      @click.stop="togglePopup"
      title="联系客服"
    >
      <!-- 客服图标 -->
      <svg class="support-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    </button>

    <!-- 客服弹窗 -->
    <Transition name="popup-fade">
      <div 
        v-if="showPopup" 
        class="canvas-support-popup"
        :class="{ 'theme-light': props.theme === 'light' }"
        @click.stop
      >
        <div class="popup-header">
          <div class="popup-title">
            <svg class="title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span>客服支持</span>
          </div>
          <button class="popup-close" @click="closePopup">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div class="popup-body">
          <!-- 链接按钮 -->
          <button
            v-if="supportConfig?.link"
            class="support-action-btn link-btn"
            @click="openLink"
          >
            <svg class="action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            <span>{{ supportConfig.linkName }}</span>
          </button>

          <!-- 二维码区域 -->
          <div v-if="supportConfig?.qrImage" class="qr-code-section">
            <div class="qr-code-label">扫码联系客服</div>
            <img :src="supportConfig.qrImage" alt="客服二维码" class="qr-code-image" />
            <p class="qr-code-tip">请使用微信扫描二维码</p>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.canvas-support-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

/* 客服按钮 */
.canvas-support-trigger {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.canvas-support-trigger:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.25);
}

.canvas-support-trigger.theme-light {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.1);
}

.canvas-support-trigger.theme-light:hover {
  background: rgba(0, 0, 0, 0.1);
  border-color: rgba(0, 0, 0, 0.15);
}

.support-icon {
  width: 16px;
  height: 16px;
  color: rgba(255, 255, 255, 0.9);
}

.canvas-support-trigger.theme-light .support-icon {
  color: rgba(0, 0, 0, 0.7);
}

/* 弹窗 */
.canvas-support-popup {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 8px;
  min-width: 200px;
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  overflow: hidden;
}

.canvas-support-popup.theme-light {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.canvas-support-popup.theme-light .popup-header {
  border-bottom-color: rgba(0, 0, 0, 0.1);
}

.popup-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  font-weight: 500;
}

.canvas-support-popup.theme-light .popup-title {
  color: rgba(0, 0, 0, 0.8);
}

.title-icon {
  width: 16px;
  height: 16px;
}

.popup-close {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;
}

.popup-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
}

.canvas-support-popup.theme-light .popup-close {
  color: rgba(0, 0, 0, 0.4);
}

.canvas-support-popup.theme-light .popup-close:hover {
  background: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.8);
}

.popup-close svg {
  width: 14px;
  height: 14px;
}

.popup-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 操作按钮 */
.support-action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
}

.support-action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.2);
}

.canvas-support-popup.theme-light .support-action-btn {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.8);
}

.canvas-support-popup.theme-light .support-action-btn:hover {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.15);
}

.action-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* 二维码区域 */
.qr-code-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.canvas-support-popup.theme-light .qr-code-section {
  border-top-color: rgba(0, 0, 0, 0.1);
}

.qr-code-label {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
}

.canvas-support-popup.theme-light .qr-code-label {
  color: rgba(0, 0, 0, 0.7);
}

.qr-code-image {
  width: 180px;
  height: 180px;
  object-fit: contain;
  border-radius: 8px;
  background: white;
  padding: 8px;
}

.qr-code-tip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.canvas-support-popup.theme-light .qr-code-tip {
  color: rgba(0, 0, 0, 0.4);
}

/* 动画 */
.popup-fade-enter-active,
.popup-fade-leave-active {
  transition: all 0.2s ease;
}

.popup-fade-enter-from,
.popup-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>

