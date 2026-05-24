<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getHomeNotices } from '@/api/community'

const ROTATION_INTERVAL_MS = 8000
const CLOSE_SUPPRESSION_MS = 24 * 60 * 60 * 1000

const router = useRouter()
const notices = ref([])
const activeIndex = ref(0)
const isVisible = ref(false)
let rotationTimer = null

const activeNotice = computed(() => notices.value[activeIndex.value] || null)

const barStyle = computed(() => ({
  backgroundColor: activeNotice.value?.bar_background_color || '#D8F4FF'
}))

const cardStyle = computed(() => ({
  backgroundColor: activeNotice.value?.card_background_color || '#FFFFFF',
  color: activeNotice.value?.text_color || '#0F172A'
}))

const badgeText = computed(() => activeNotice.value?.badge_text || '📣 通知')

function getTenantIdentity() {
  return localStorage.getItem('tenant_id') ||
    localStorage.getItem('current_tenant_id') ||
    window.location.host ||
    'default'
}

function getUserIdentity() {
  return localStorage.getItem('user_id') ||
    localStorage.getItem('userId') ||
    localStorage.getItem('username') ||
    'anonymous'
}

function getDismissStorageKey() {
  return `home_notice_dismissed:${getTenantIdentity()}:${getUserIdentity()}`
}

function getAnonymousDismissKey() {
  return `home_notice_anonymous_dismissed:${getTenantIdentity()}`
}

function isSuppressed() {
  const token = localStorage.getItem('token')
  if (!token) {
    return sessionStorage.getItem(getAnonymousDismissKey()) === '1'
  }

  const dismissedAt = Number(localStorage.getItem(getDismissStorageKey()) || 0)
  return dismissedAt > 0 && Date.now() - dismissedAt < CLOSE_SUPPRESSION_MS
}

function closeNotice() {
  const token = localStorage.getItem('token')
  if (token) {
    localStorage.setItem(getDismissStorageKey(), String(Date.now()))
  } else {
    sessionStorage.setItem(getAnonymousDismissKey(), '1')
  }
  isVisible.value = false
  stopRotation()
}

function showNextNotice() {
  if (notices.value.length <= 1) return
  activeIndex.value = (activeIndex.value + 1) % notices.value.length
}

function startRotation() {
  stopRotation()
  if (notices.value.length > 1) {
    rotationTimer = setInterval(showNextNotice, ROTATION_INTERVAL_MS)
  }
}

function stopRotation() {
  if (rotationTimer) {
    clearInterval(rotationTimer)
    rotationTimer = null
  }
}

function openNotice() {
  const link = activeNotice.value?.link_url?.trim()
  if (!link) return

  if (/^https?:\/\//i.test(link)) {
    window.open(link, '_blank', 'noopener,noreferrer')
    return
  }

  router.push(link.startsWith('/') ? link : `/${link}`)
}

async function loadHomeNotices() {
  if (isSuppressed()) return
  try {
    const response = await getHomeNotices()
    const items = response?.data || []
    notices.value = Array.isArray(items) ? items.slice(0, 3) : []
    activeIndex.value = 0
    isVisible.value = notices.value.length > 0
    startRotation()
  } catch (error) {
    console.error('[NotificationBar] 加载首页通知失败:', error)
  }
}

onMounted(loadHomeNotices)
onUnmounted(stopRotation)
</script>

<template>
  <Transition name="home-notice">
    <div
      v-if="isVisible && activeNotice"
      class="home-notice-bar"
      :style="barStyle"
    >
      <div class="home-notice-viewport">
        <Transition name="home-notice-page" mode="out-in">
          <button
            :key="activeNotice.id || activeIndex"
            class="home-notice-card"
            :class="`preset-${activeNotice.preset || 'blue'}`"
            :style="cardStyle"
            type="button"
            @click="openNotice"
          >
            <span class="home-notice-badge">{{ badgeText }}</span>
            <span class="home-notice-copy">
              <span class="home-notice-title">{{ activeNotice.title }}</span>
              <span v-if="activeNotice.content" class="home-notice-content">{{ activeNotice.content }}</span>
            </span>
          </button>
        </Transition>
      </div>

      <button class="home-notice-close" type="button" aria-label="关闭通知" @click="closeNotice">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.home-notice-bar {
  position: relative;
  z-index: 60;
  min-height: 48px;
  padding: 8px 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  overflow: hidden;
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
}

.home-notice-viewport {
  max-width: min(1680px, calc(100vw - 80px));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.home-notice-card {
  width: max-content;
  max-width: 100%;
  min-height: 32px;
  box-sizing: border-box;
  border: 0;
  border-radius: 8px;
  padding: 7px 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.12);
  cursor: pointer;
  text-align: center;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.home-notice-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.16);
}

.home-notice-badge {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
  font-weight: 700;
  background: rgba(14, 165, 233, 0.16);
  color: #0369a1;
}

.home-notice-copy {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  overflow: hidden;
  line-height: 20px;
}

.home-notice-title {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-notice-content {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 13px;
  line-height: 20px;
  opacity: 0.78;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-notice-close {
  position: absolute;
  right: 16px;
  top: 50%;
  width: 28px;
  height: 28px;
  transform: translateY(-50%);
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
  color: #0f172a;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.home-notice-close:hover {
  background: rgba(255, 255, 255, 0.82);
}

.home-notice-close svg {
  width: 16px;
  height: 16px;
}

.preset-amber .home-notice-badge {
  background: rgba(245, 158, 11, 0.16);
  color: #92400e;
}

.preset-green .home-notice-badge {
  background: rgba(16, 185, 129, 0.16);
  color: #047857;
}

.preset-dark .home-notice-badge {
  background: rgba(255, 255, 255, 0.16);
  color: inherit;
}

.home-notice-enter-active,
.home-notice-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.home-notice-enter-from,
.home-notice-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.home-notice-page-enter-active,
.home-notice-page-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.home-notice-page-enter-from {
  opacity: 0;
  transform: translateY(-110%);
}

.home-notice-page-leave-to {
  opacity: 0;
  transform: translateY(110%);
}

@media (max-width: 768px) {
  .home-notice-bar {
    padding: 8px 44px 8px 10px;
    gap: 8px;
    align-items: center;
  }

  .home-notice-viewport {
    max-width: calc(100vw - 54px);
  }

  .home-notice-card {
    width: max-content;
    justify-content: center;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
  }

  .home-notice-copy {
    max-width: calc(100% - 50px);
    align-items: center;
    flex-direction: row;
    justify-content: center;
    gap: 8px;
  }

  .home-notice-content {
    width: auto;
  }

}
</style>
