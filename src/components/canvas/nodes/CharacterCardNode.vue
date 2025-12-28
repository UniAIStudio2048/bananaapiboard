<script setup>
/**
 * CharacterCardNode.vue - Sora角色卡节点
 *
 * 功能：
 * - 黑白灰风格，与ImageNode一致
 * - 支持显示图片和视频
 * - 左下角name，右下角username
 * - 点击name或username直接复制@name或@username到剪贴板
 */
import { ref, computed, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useI18n } from '@/i18n'

const { t } = useI18n()

const props = defineProps({
  id: String,
  data: Object,
  selected: Boolean
})

// 本地状态
const copySuccess = ref(false)
const copyType = ref('') // 'name' 或 'username'
const videoRef = ref(null)
const imageLoadError = ref(false)

// 角色数据
const characterName = computed(() => props.data.name || '未命名角色')
const characterUsername = computed(() => props.data.username || '')
const characterAvatar = computed(() => props.data.avatar || props.data.url || props.data.cover || '')

// 监听头像变化，重置错误状态
watch(characterAvatar, () => {
  imageLoadError.value = false
})

// 判断是否是视频（根据URL后缀或MIME类型）
const isVideo = computed(() => {
  const url = characterAvatar.value
  if (!url) return false
  // 增加对API路径的支持
  if (url.includes('/api/images/file/') || url.includes('/videos/')) return true
  // 标准视频后缀
  return url.includes('.mp4') || url.includes('.webm') || url.includes('.mov')
})

// 处理图片加载错误
function handleImageError() {
  imageLoadError.value = true
}

// 复制到剪贴板
async function copyToClipboard(type, event) {
  event?.stopPropagation()

  const textToCopy = type === 'name'
    ? `@${characterName.value}`
    : `@${characterUsername.value}`

  try {
    await navigator.clipboard.writeText(textToCopy)
    showCopySuccess(type)
  } catch (error) {
    console.error('[CharacterCardNode] 复制失败:', error)
    // 降级方案：使用旧的 execCommand 方法
    fallbackCopy(textToCopy, type)
  }
}

// 降级复制方案
function fallbackCopy(text, type) {
  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.style.position = 'fixed'
  textArea.style.left = '-9999px'
  document.body.appendChild(textArea)
  textArea.select()
  try {
    document.execCommand('copy')
    showCopySuccess(type)
  } catch (err) {
    console.error('[CharacterCardNode] 降级复制也失败:', err)
  }
  document.body.removeChild(textArea)
}

// 显示复制成功提示
function showCopySuccess(type) {
  copySuccess.value = true
  copyType.value = type

  // 1.5秒后隐藏成功提示
  setTimeout(() => {
    copySuccess.value = false
    copyType.value = ''
  }, 1500)
}

// 鼠标悬停播放视频
function handleMouseEnter() {
  if (videoRef.value && isVideo.value) {
    videoRef.value.play().catch(() => {})
  }
}

// 鼠标离开暂停视频
function handleMouseLeave() {
  if (videoRef.value && isVideo.value) {
    videoRef.value.pause()
    videoRef.value.currentTime = 0
  }
}
</script>

<template>
  <div
    class="character-card-node"
    :class="{ 'selected': selected }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 输出连接点 -->
    <Handle
      type="source"
      :position="Position.Right"
      :id="`${id}-source`"
      class="node-handle"
    />

    <!-- 角色媒体预览 -->
    <div class="character-media">
      <!-- 视频预览 -->
      <video
        v-if="isVideo && characterAvatar"
        ref="videoRef"
        :src="characterAvatar"
        class="character-video"
        muted
        loop
        playsinline
      />
      <!-- 图片预览 -->
      <img
        v-else-if="!isVideo && characterAvatar && !imageLoadError"
        :src="characterAvatar"
        :alt="characterName"
        class="character-image"
        @error="handleImageError"
      />
      <!-- 占位符 (无媒体或加载失败时显示) -->
      <div v-else class="character-placeholder">
        <span class="placeholder-icon">👤</span>
      </div>
    </div>

    <!-- 底部信息栏 -->
    <div class="character-footer">
      <!-- 左下角：角色名称（可点击复制） -->
      <div
        class="character-name"
        @click="copyToClipboard('name', $event)"
        :title="`点击复制 @${characterName}`"
      >
        <span class="name-text">{{ characterName }}</span>
        <span class="copy-hint">📋</span>
      </div>

      <!-- 右下角：角色ID（可点击复制） -->
      <div
        v-if="characterUsername"
        class="character-username"
        @click="copyToClipboard('username', $event)"
        :title="`点击复制 @${characterUsername}`"
      >
        <span class="username-text">@{{ characterUsername }}</span>
        <span class="copy-hint">📋</span>
      </div>
    </div>

    <!-- 复制成功提示 -->
    <Transition name="toast">
      <div v-if="copySuccess" class="copy-toast">
        <span class="toast-icon">✓</span>
        <span class="toast-text">
          已复制 {{ copyType === 'name' ? `@${characterName}` : `@${characterUsername}` }}
        </span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 角色卡片节点 - 黑白灰风格 */
.character-card-node {
  min-width: 240px;
  max-width: 320px;
  background: #1a1a1c;
  border: 2px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
  cursor: grab;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.character-card-node:hover {
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.character-card-node.selected {
  border-color: rgba(99, 102, 241, 0.8); /* 紫色高亮 */
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3), 0 10px 15px -3px rgba(0, 0, 0, 0.3);
}

/* 连接点 */
.node-handle {
  width: 12px;
  height: 12px;
  background: #6366f1;
  border: 2px solid #1a1a1c;
  right: -6px; /* 微调位置 */
  transition: all 0.2s;
}

.node-handle:hover {
  width: 14px;
  height: 14px;
  background: #818cf8;
  border-color: #fff;
}

/* 媒体预览区域 */
.character-media {
  width: 100%;
  aspect-ratio: 1; /* 保持正方形比例，或根据需要调整 */
  max-height: 320px;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.character-video,
.character-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block; /* 消除底部空隙 */
}

.character-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #27272a 0%, #18181b 100%);
}

.placeholder-icon {
  font-size: 64px;
  opacity: 0.2;
  filter: grayscale(100%);
}

/* 底部信息栏 */
.character-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: #1a1a1c;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  gap: 10px;
}

/* 角色名称（左下角） */
.character-name {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 0;
  border: 1px solid transparent;
}

.character-name:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
}

.name-text {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 角色ID（右下角） */
.character-username {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 0;
  flex-shrink: 0;
  border: 1px solid transparent;
}

.character-username:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
}

.username-text {
  font-size: 12px;
  font-family: 'SF Mono', Monaco, Consolas, monospace; /* 优化等宽字体显示 */
  color: rgba(255, 255, 255, 0.5);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}

/* 复制提示图标 */
.copy-hint {
  font-size: 12px;
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.15s;
  color: rgba(255, 255, 255, 0.7);
}

.character-name:hover .copy-hint,
.character-username:hover .copy-hint {
  opacity: 1;
  transform: scale(1);
}

/* 复制成功提示 */
.copy-toast {
  position: absolute;
  top: 12px; /* 调整位置到顶部内侧 */
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(16, 185, 129, 0.95); /* 绿色半透明 */
  color: white;
  font-size: 13px;
  font-weight: 500;
  border-radius: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 10;
  white-space: nowrap;
  pointer-events: none;
  backdrop-filter: blur(4px);
}

.toast-icon {
  font-size: 14px;
  font-weight: bold;
}

/* 动画 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>
