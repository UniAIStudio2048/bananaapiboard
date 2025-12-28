<template>
  <div class="ai-message" :class="[`ai-message--${message.role}`]">
    <!-- 头像 -->
    <div class="ai-message__avatar">
      <template v-if="message.role === 'assistant'">
        <div class="ai-avatar">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <defs>
              <linearGradient id="sparkle-gradient-msg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#e5e7eb"/>
                <stop offset="50%" stop-color="#d1d5db"/>
                <stop offset="100%" stop-color="#9ca3af"/>
              </linearGradient>
            </defs>
            <!-- 主星 -->
            <path
              d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
              fill="url(#sparkle-gradient-msg)"
            />
            <!-- 小星1 -->
            <path
              d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z"
              fill="url(#sparkle-gradient-msg)"
              opacity="0.7"
            />
            <!-- 小星2 -->
            <path
              d="M5 15L5.5 16.5L7 17L5.5 17.5L5 19L4.5 17.5L3 17L4.5 16.5L5 15Z"
              fill="url(#sparkle-gradient-msg)"
              opacity="0.5"
            />
          </svg>
        </div>
      </template>
      <template v-else>
        <div class="user-avatar">
          {{ userInitial }}
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
        >
          <img
            v-if="att.type === 'image'"
            :src="att.url"
            :alt="att.name"
            class="ai-attachment__image"
            @click="$emit('preview-image', att.url)"
          />
          <div v-else class="ai-attachment__file">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>{{ att.name }}</span>
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

defineEmits(['preview-image'])

const showThinking = ref(false)
const showContextMenu = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuRef = ref(null)
const selectedText = ref('')

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

.ai-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #374151, #1f2937);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #374151;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  font-weight: 500;
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

.ai-message__text {
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  cursor: text;
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

.ai-message--assistant .ai-message__text {
  background: #1f2937;
  color: #e5e7eb;
  border-bottom-left-radius: 4px;
}

.ai-message--user .ai-message__text {
  background: #3b82f6;
  color: white;
  border-bottom-right-radius: 4px;
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
</style>
