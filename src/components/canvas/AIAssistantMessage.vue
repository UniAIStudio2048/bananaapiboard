<template>
  <div class="ai-message" :class="[`ai-message--${message.role}`]">
    <!-- 头像 -->
    <div class="ai-message__avatar">
      <template v-if="message.role === 'assistant'">
        <div class="ai-avatar">
          <div class="ai-avatar__ring"></div>
          <div class="ai-avatar__inner">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <defs>
                <linearGradient id="sparkle-gradient-msg" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#c084fc"/>
                  <stop offset="50%" stop-color="#818cf8"/>
                  <stop offset="100%" stop-color="#60a5fa"/>
                </linearGradient>
              </defs>
              <path
                d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
                fill="url(#sparkle-gradient-msg)"
              />
              <path
                d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z"
                fill="url(#sparkle-gradient-msg)"
                opacity="0.7"
              />
            </svg>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="user-avatar">
          <div class="user-avatar__inner">
            <span class="user-avatar__letter">{{ userInitial }}</span>
          </div>
        </div>
      </template>
    </div>

    <!-- 消息内容 -->
    <div class="ai-message__content">
      <!-- 思考过程（可折叠） -->
      <div v-if="message.thinking" class="ai-thinking">
        <button
          class="ai-thinking__toggle"
          @click="showThinking = !showThinking"
        >
          <svg class="w-4 h-4 transition-transform" :class="{ 'rotate-90': showThinking }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
          <span>思考过程</span>
        </button>
        <div v-if="showThinking" class="ai-thinking__content">
          {{ message.thinking }}
        </div>
      </div>

      <!-- 工具调用 -->
      <div v-if="message.tool_calls?.length" class="ai-tool-calls">
        <div v-for="tool in message.tool_calls" :key="tool.id" class="ai-tool-call">
          <div class="ai-tool-call__header">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
            </svg>
            <span>{{ getToolName(tool) }}</span>
          </div>
        </div>
      </div>

      <!-- 主要内容 -->
      <div
        class="ai-message__text"
        :class="{ 'is-loading': message.isStreaming && !message.content }"
        @contextmenu="handleContextMenu"
      >
        <template v-if="message.isStreaming && !message.content">
          <span class="loading-dots">AI 正在回复</span>
        </template>
        <template v-else>
          <div v-html="formattedContent"></div>
        </template>
      </div>

      <!-- 右键菜单 -->
      <Teleport to="body">
        <div
          v-if="showContextMenu"
          ref="contextMenuRef"
          class="ai-context-menu"
          :style="{ top: contextMenuY + 'px', left: contextMenuX + 'px' }"
          @click="handleCopyFromMenu"
        >
          <div class="ai-context-menu__item">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span>复制</span>
          </div>
        </div>
      </Teleport>

      <!-- 附件预览 -->
      <div v-if="message.attachments?.length" class="ai-attachments">
        <div
          v-for="(att, index) in message.attachments"
          :key="index"
          class="ai-attachment"
          draggable="true"
          @dragstart="handleAttachmentDragStart($event, att)"
        >
          <!-- 图片预览 -->
          <img
            v-if="att.type === 'image'"
            :src="att.url"
            :alt="att.name"
            class="ai-attachment__image"
            @click="$emit('preview-media', { type: 'image', url: att.url, name: att.name })"
          />
          <!-- 视频内联预览 -->
          <div v-else-if="att.type === 'video'" class="ai-attachment__video-wrapper" @click="$emit('preview-media', { type: 'video', url: att.url, name: att.name })">
            <video
              :src="att.url"
              class="ai-attachment__video"
              muted
              preload="metadata"
              @loadeddata="$event.target.currentTime = 0.5"
            ></video>
            <div class="ai-attachment__video-play">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
            <div class="ai-attachment__video-label">{{ att.name || '视频' }}</div>
          </div>
          <!-- 音频内联播放器 - 现代毛玻璃风格 -->
          <div v-else-if="att.type === 'audio'" class="ai-audio-player" @click.stop>
            <div class="ai-audio-player__cover">
              <div class="ai-audio-player__visualizer">
                <span v-for="i in 5" :key="i" class="ai-audio-player__bar" :style="{ animationDelay: `${i * 0.12}s` }"></span>
              </div>
            </div>
            <div class="ai-audio-player__info">
              <div class="ai-audio-player__name">{{ att.name || '音频' }}</div>
              <audio
                :ref="el => { if (el) audioRefs[index] = el }"
                :src="att.url"
                preload="metadata"
                @timeupdate="updateAudioProgress($event, index)"
                @loadedmetadata="initAudioDuration($event, index)"
                @ended="audioStates[index] = { ...audioStates[index], playing: false }"
              ></audio>
              <div class="ai-audio-player__progress">
                <div class="ai-audio-player__progress-bar">
                  <div class="ai-audio-player__progress-fill" :style="{ width: (audioStates[index]?.progress || 0) + '%' }"></div>
                  <div class="ai-audio-player__progress-dot" :style="{ left: (audioStates[index]?.progress || 0) + '%' }"></div>
                </div>
                <div class="ai-audio-player__time">
                  <span>{{ formatAudioTime(audioStates[index]?.currentTime || 0) }}</span>
                  <span>{{ formatAudioTime(audioStates[index]?.duration || 0) }}</span>
                </div>
              </div>
            </div>
            <div class="ai-audio-player__controls">
              <button class="ai-audio-player__play-btn" @click="toggleAudioPlay(index)">
                <svg v-if="audioStates[index]?.playing" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1"/>
                  <rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
                <svg v-else class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6 3 20 12 6 21 6 3"/>
                </svg>
              </button>
            </div>
          </div>
          <!-- 其他文件 -->
          <div v-else class="ai-attachment__file">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>{{ att.name }}</span>
          </div>
          <!-- 拖拽提示角标 -->
          <div class="ai-attachment__drag-hint" title="拖拽到画布">
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- 时间戳 -->
      <div v-if="showTimestamp" class="ai-message__time">
        {{ formatTime(message.timestamp) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const props = defineProps({
  message: {
    type: Object,
    required: true
  },
  userName: {
    type: String,
    default: 'U'
  },
  showTimestamp: {
    type: Boolean,
    default: false
  }
})

defineEmits(['preview-media'])

// 拖拽附件到画布
function handleAttachmentDragStart(e, att) {
  const dragData = {
    type: 'ai-chat-attachment',
    attachment: {
      type: att.type,
      url: att.url,
      name: att.name
    }
  }
  e.dataTransfer.setData('application/json', JSON.stringify(dragData))
  e.dataTransfer.effectAllowed = 'copy'
  
  // 图片拖拽预览
  if (att.type === 'image' && att.url) {
    const img = new Image()
    img.src = att.url
    e.dataTransfer.setDragImage(img, 50, 50)
  }
}

const showThinking = ref(false)
const showContextMenu = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuRef = ref(null)
const selectedText = ref('')

// 音频播放器状态
const audioRefs = ref({})
const audioStates = ref({})

function toggleAudioPlay(index) {
  const audio = audioRefs.value[index]
  if (!audio) return
  if (audio.paused) {
    // 暂停其他正在播放的音频
    Object.keys(audioRefs.value).forEach(k => {
      if (k !== String(index) && audioRefs.value[k] && !audioRefs.value[k].paused) {
        audioRefs.value[k].pause()
        audioStates.value[k] = { ...audioStates.value[k], playing: false }
      }
    })
    audio.play()
    audioStates.value[index] = { ...audioStates.value[index], playing: true }
  } else {
    audio.pause()
    audioStates.value[index] = { ...audioStates.value[index], playing: false }
  }
}

function updateAudioProgress(event, index) {
  const audio = event.target
  const progress = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0
  audioStates.value[index] = {
    ...audioStates.value[index],
    currentTime: audio.currentTime,
    progress
  }
}

function initAudioDuration(event, index) {
  audioStates.value[index] = {
    ...audioStates.value[index],
    duration: event.target.duration,
    currentTime: 0,
    progress: 0,
    playing: false
  }
}

function formatAudioTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const userInitial = computed(() => {
  return props.userName.charAt(0).toUpperCase()
})

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true
})

const formattedContent = computed(() => {
  if (!props.message.content) return ''

  try {
    // 使用 marked 解析 markdown
    const html = marked.parse(props.message.content)
    // 使用 DOMPurify 清理 HTML
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
      ALLOWED_ATTR: ['href', 'target', 'class']
    })
  } catch (e) {
    // 如果解析失败，返回原始文本
    return props.message.content.replace(/\n/g, '<br>')
  }
})

function getToolName(tool) {
  const names = {
    web_search: '联网搜索'
  }
  return names[tool.function?.name] || tool.function?.name || '工具调用'
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 右键菜单处理
function handleContextMenu(event) {
  event.preventDefault()

  // 获取选中的文本
  const selection = window.getSelection()
  const text = selection?.toString() || ''

  // 如果没有选中文本，复制整个消息内容
  if (!text && props.message.content) {
    selectedText.value = props.message.content
  } else {
    selectedText.value = text
  }

  // 设置菜单位置
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY

  // 显示菜单
  showContextMenu.value = true
}

// 从菜单复制
async function handleCopyFromMenu() {
  try {
    if (selectedText.value) {
      await navigator.clipboard.writeText(selectedText.value)
      console.log('[AI-Assistant] 已复制到剪贴板')
    }
  } catch (error) {
    console.error('[AI-Assistant] 复制失败:', error)
    // 降级方案：使用传统方法
    fallbackCopy(selectedText.value)
  } finally {
    showContextMenu.value = false
  }
}

// 降级复制方法
function fallbackCopy(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
    console.log('[AI-Assistant] 已复制到剪贴板（降级方法）')
  } catch (error) {
    console.error('[AI-Assistant] 降级复制也失败:', error)
  }
  document.body.removeChild(textarea)
}

// 点击外部关闭菜单
function handleClickOutside(event) {
  if (showContextMenu.value && contextMenuRef.value && !contextMenuRef.value.contains(event.target)) {
    showContextMenu.value = false
  }
}

// 生命周期
onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.ai-message {
  display: flex;
  gap: 12px;
  padding: 12px 0;
}

.ai-message--user {
  flex-direction: row-reverse;
}

.ai-message__avatar {
  flex-shrink: 0;
}

/* ========== AI 头像 - 毛玻璃灵动设计 ========== */
.ai-avatar {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-avatar__ring {
  position: absolute;
  inset: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 0.4) 0%,
    rgba(99, 102, 241, 0.3) 50%,
    rgba(59, 130, 246, 0.4) 100%
  );
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 
    0 4px 16px rgba(139, 92, 246, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  animation: avatarGlow 3s ease-in-out infinite;
}

@keyframes avatarGlow {
  0%, 100% {
    box-shadow: 
      0 4px 16px rgba(139, 92, 246, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }
  50% {
    box-shadow: 
      0 4px 24px rgba(139, 92, 246, 0.35),
      inset 0 1px 0 rgba(255, 255, 255, 0.15);
  }
}

.ai-avatar__inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-avatar__inner svg {
  filter: drop-shadow(0 2px 4px rgba(139, 92, 246, 0.3));
}

/* ========== 用户头像 - 毛玻璃现代设计 ========== */
.user-avatar {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar__inner {
  position: absolute;
  inset: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, 
    rgba(59, 130, 246, 0.5) 0%,
    rgba(37, 99, 235, 0.4) 100%
  );
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 
    0 4px 16px rgba(59, 130, 246, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar__letter {
  position: relative;
  z-index: 1;
  color: white;
  font-size: 14px;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.ai-message__content {
  flex: 1;
  min-width: 0;
  max-width: 85%;
}

.ai-message--user .ai-message__content {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/* ========== 消息气泡 - 毛玻璃灵动设计 ========== */
.ai-message__text {
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  cursor: text;
  position: relative;
  transition: all 0.3s ease;
}

.ai-message__text.is-loading {
  opacity: 0.7;
}

.loading-dots {
  display: inline-block;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
}

/* AI 消息气泡 - 深色毛玻璃 */
.ai-message--assistant .ai-message__text {
  background: linear-gradient(135deg, 
    rgba(45, 50, 65, 0.85) 0%,
    rgba(35, 40, 55, 0.9) 100%
  );
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: #e5e7eb;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom-left-radius: 6px;
  box-shadow: 
    0 4px 24px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

/* 用户消息气泡 - 蓝色毛玻璃 */
.ai-message--user .ai-message__text {
  background: linear-gradient(135deg, 
    rgba(59, 130, 246, 0.85) 0%,
    rgba(37, 99, 235, 0.9) 100%
  );
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-bottom-right-radius: 6px;
  box-shadow: 
    0 4px 24px rgba(59, 130, 246, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.ai-message__text :deep(p) {
  margin: 0 0 8px 0;
}

.ai-message__text :deep(p:last-child) {
  margin-bottom: 0;
}

.ai-message__text :deep(code) {
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
}

.ai-message__text :deep(pre) {
  background: rgba(0, 0, 0, 0.3);
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.ai-message__text :deep(pre code) {
  background: none;
  padding: 0;
}

.ai-message__text :deep(ul),
.ai-message__text :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

.ai-message__text :deep(li) {
  margin: 4px 0;
}

.ai-message__text :deep(a) {
  color: #60a5fa;
  text-decoration: underline;
}

.ai-message__text :deep(blockquote) {
  border-left: 3px solid #4b5563;
  padding-left: 12px;
  margin: 8px 0;
  color: #9ca3af;
}

.ai-thinking {
  margin-bottom: 8px;
}

.ai-thinking__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 6px;
  color: #a78bfa;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.ai-thinking__toggle:hover {
  background: rgba(139, 92, 246, 0.3);
}

.ai-thinking__content {
  margin-top: 8px;
  padding: 10px 12px;
  background: rgba(139, 92, 246, 0.1);
  border-radius: 8px;
  color: #c4b5fd;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.ai-tool-calls {
  margin-bottom: 8px;
}

.ai-tool-call {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
  margin-bottom: 4px;
}

.ai-tool-call__header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 6px;
  color: #60a5fa;
  font-size: 12px;
}

.ai-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.ai-attachment {
  position: relative;
  cursor: grab;
}

.ai-attachment:active {
  cursor: grabbing;
}

.ai-attachment__image {
  max-width: 200px;
  max-height: 150px;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.ai-attachment__image:hover {
  opacity: 0.8;
}

/* 视频内联预览 */
.ai-attachment__video-wrapper {
  position: relative;
  max-width: 220px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: #1a1a2e;
}

.ai-attachment__video-wrapper:hover .ai-attachment__video-play {
  background: rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%) scale(1.1);
}

.ai-attachment__video {
  width: 100%;
  max-height: 150px;
  object-fit: cover;
  display: block;
  border-radius: 8px;
}

.ai-attachment__video-play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 36px;
  height: 36px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  transition: all 0.2s;
  pointer-events: none;
}

.ai-attachment__video-play svg {
  margin-left: 2px;
}

.ai-attachment__video-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 4px 8px;
  background: linear-gradient(transparent, rgba(0,0,0,0.7));
  color: #e5e7eb;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 0 0 8px 8px;
}

/* 拖拽提示角标 */
.ai-attachment__drag-hint {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.8);
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.ai-attachment:hover .ai-attachment__drag-hint {
  opacity: 1;
}

.ai-attachment__file {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #374151;
  border-radius: 6px;
  color: #d1d5db;
  font-size: 12px;
}

/* 音频内联播放器 - 毛玻璃现代设计 */
.ai-attachment__audio {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  background: linear-gradient(135deg, 
    rgba(45, 50, 65, 0.8) 0%,
    rgba(35, 40, 55, 0.85) 100%
  );
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  min-width: 240px;
  max-width: 320px;
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: all 0.3s ease;
}

.ai-attachment__audio:hover {
  box-shadow: 
    0 6px 28px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
}

.ai-attachment__audio-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #e5e7eb;
  font-size: 13px;
  font-weight: 500;
}

.ai-attachment__audio-header svg {
  flex-shrink: 0;
  color: #a78bfa;
  filter: drop-shadow(0 2px 4px rgba(167, 139, 250, 0.3));
}

.ai-attachment__audio-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-attachment__audio-player {
  width: 100%;
  height: 36px;
  border-radius: 8px;
  outline: none;
  background: rgba(0, 0, 0, 0.2);
}

/* 让 audio 控件在暗色背景下更协调 */
.ai-attachment__audio-player::-webkit-media-controls-panel {
  background: linear-gradient(135deg, 
    rgba(30, 35, 50, 0.9) 0%,
    rgba(25, 30, 45, 0.95) 100%
  );
  border-radius: 8px;
}

.ai-message__time {
  margin-top: 4px;
  font-size: 11px;
  color: #6b7280;
}

.rotate-90 {
  transform: rotate(90deg);
}

/* 右键菜单 */
.ai-context-menu {
  position: fixed;
  z-index: 10000;
  background: rgba(30, 32, 40, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  min-width: 120px;
  animation: contextMenuFadeIn 0.15s ease;
}

@keyframes contextMenuFadeIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.ai-context-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.ai-context-menu__item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 1);
}

.ai-context-menu__item svg {
  flex-shrink: 0;
}

/* ========== 白昼模式适配 ========== */

/* AI 头像 - 白昼模式 */
:root.canvas-theme-light .ai-avatar__ring {
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 0.25) 0%,
    rgba(99, 102, 241, 0.2) 50%,
    rgba(59, 130, 246, 0.25) 100%
  );
  border-color: rgba(139, 92, 246, 0.2);
  box-shadow: 
    0 4px 16px rgba(139, 92, 246, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

:root.canvas-theme-light .ai-avatar__inner svg path {
  stop-color: #8b5cf6;
}

/* 用户头像 - 白昼模式 */
:root.canvas-theme-light .user-avatar__inner {
  background: linear-gradient(135deg, 
    rgba(59, 130, 246, 0.35) 0%,
    rgba(37, 99, 235, 0.3) 100%
  );
  border-color: rgba(59, 130, 246, 0.25);
  box-shadow: 
    0 4px 16px rgba(59, 130, 246, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

:root.canvas-theme-light .user-avatar__letter {
  color: #1e40af;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.5);
}

/* AI 消息气泡 - 白昼模式 */
:root.canvas-theme-light .ai-message--assistant .ai-message__text {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.75) 0%,
    rgba(248, 250, 252, 0.85) 100%
  );
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: #1c1917;
  border-color: rgba(0, 0, 0, 0.06);
  box-shadow: 
    0 4px 24px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

/* 用户消息气泡 - 白昼模式 */
:root.canvas-theme-light .ai-message--user .ai-message__text {
  background: linear-gradient(135deg, 
    rgba(59, 130, 246, 0.9) 0%,
    rgba(37, 99, 235, 0.95) 100%
  );
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 
    0 4px 24px rgba(59, 130, 246, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

/* 代码块 - 白昼模式 */
:root.canvas-theme-light .ai-message--assistant .ai-message__text :deep(code) {
  background: rgba(0, 0, 0, 0.06);
  color: #1c1917;
}

:root.canvas-theme-light .ai-message--assistant .ai-message__text :deep(pre) {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .ai-message--assistant .ai-message__text :deep(a) {
  color: #2563eb;
}

:root.canvas-theme-light .ai-message--assistant .ai-message__text :deep(blockquote) {
  border-left-color: #d1d5db;
  color: #57534e;
}

/* 思考过程 - 白昼模式 */
:root.canvas-theme-light .ai-thinking__toggle {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.2);
  color: #7c3aed;
}

:root.canvas-theme-light .ai-thinking__toggle:hover {
  background: rgba(139, 92, 246, 0.15);
}

:root.canvas-theme-light .ai-thinking__content {
  background: rgba(139, 92, 246, 0.08);
  color: #6d28d9;
}

/* 工具调用 - 白昼模式 */
:root.canvas-theme-light .ai-tool-call__header {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.2);
  color: #2563eb;
}

/* 附件文件 - 白昼模式 */
:root.canvas-theme-light .ai-attachment__file {
  background: rgba(0, 0, 0, 0.04);
  color: #44403c;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

/* 音频播放器 - 白昼模式 */
:root.canvas-theme-light .ai-attachment__audio {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.8) 0%,
    rgba(248, 250, 252, 0.85) 100%
  );
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

:root.canvas-theme-light .ai-attachment__audio:hover {
  box-shadow: 
    0 6px 28px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .ai-attachment__audio-header {
  color: #1c1917;
}

:root.canvas-theme-light .ai-attachment__audio-header svg {
  color: #8b5cf6;
}

:root.canvas-theme-light .ai-attachment__audio-player {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .ai-attachment__audio-player::-webkit-media-controls-panel {
  background: linear-gradient(135deg, 
    rgba(248, 250, 252, 0.95) 0%,
    rgba(241, 245, 249, 0.98) 100%
  );
}

/* 视频预览 - 白昼模式 */
:root.canvas-theme-light .ai-attachment__video-wrapper {
  background: rgba(0, 0, 0, 0.04);
}

:root.canvas-theme-light .ai-attachment__video-label {
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.5));
}

/* 图片附件 - 白昼模式 */
:root.canvas-theme-light .ai-attachment__image {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* 右键菜单 - 白昼模式 */
:root.canvas-theme-light .ai-context-menu {
  background: rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .ai-context-menu__item {
  color: #1c1917;
}

:root.canvas-theme-light .ai-context-menu__item:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #0c0a09;
}

/* 时间戳 - 白昼模式 */
:root.canvas-theme-light .ai-message__time {
  color: #78716c;
}
</style>
