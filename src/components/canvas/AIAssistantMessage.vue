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
      <!-- 本轮引用：Skill、模型和附件都以紧凑标签呈现，避免抢占正文空间。 -->
      <div v-if="message.role === 'user' && (message.skillRef || message.modelRef || visibleAttachments.length)" class="ai-message__references">
        <div v-if="message.skillRef" class="ai-message-reference ai-message-reference--skill" :title="message.skillRef.label">
          <svg class="ai-message-reference__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M8 13h8M8 17h5" />
          </svg>
          <span>{{ message.skillRef.label }}</span>
        </div>
        <div v-if="message.modelRef" class="ai-message-reference ai-message-reference--model" :title="message.modelRef.modelId">
          <svg class="ai-message-reference__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <circle cx="9" cy="10" r="1.8" />
            <path stroke-linecap="round" stroke-linejoin="round" d="m5.5 17.5 4.5-4.5 3 3 3-3 2.5 2.5" />
          </svg>
          <span>{{ message.modelRef.label || message.modelRef.modelId }}</span>
        </div>
        <button
          v-for="(att, index) in visibleAttachments"
          :key="`${att.url}-${index}`"
          type="button"
          class="ai-message-reference ai-message-reference--attachment"
          :title="att.name"
          @click="$emit('preview-media', { type: att.type, url: toSameOriginUrl(att.url), name: att.name })"
        >
          <img v-if="att.type === 'image'" :src="toSameOriginUrl(att.url)" :alt="att.name" class="ai-message-reference__thumbnail" />
          <svg v-else class="ai-message-reference__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
          <span>{{ att.name || (att.type === 'image' ? '图片附件' : '附件') }}</span>
        </button>
      </div>

      <!-- 思考过程（默认收起，只显示一行） -->
      <div v-if="message.thinking || message.isThinking" class="ai-thinking">
        <button
          class="ai-thinking__toggle"
          type="button"
          :aria-expanded="showThinking"
          @click="showThinking = !showThinking"
        >
          <span v-if="message.isThinking" class="ai-thinking__spinner" aria-hidden="true"></span>
          <svg v-else class="w-4 h-4 transition-transform" :class="{ 'rotate-90': showThinking }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
          <span :class="{ 'ai-live-shimmer': message.isThinking }">{{ message.isThinking ? '思考中…' : '思考过程' }}</span>
        </button>
        <div v-if="showThinking && message.thinking" class="ai-thinking__content">
          {{ message.thinking }}
        </div>
      </div>

      <div v-if="message.preGenerationContent" class="ai-message__text ai-message__text--pre-generation" @contextmenu="handleContextMenu">
        <div v-html="formatContent(message.preGenerationContent)"></div>
      </div>

      <!-- 媒体生成中 -->
      <div
        v-if="message.mediaGenerating"
        class="media-generating"
        :class="[`media-generating--${message.mediaGenerating}`, { 'media-generating--stopped': message.mediaStopped }]"
      >
        <div class="media-generating__header">
          <div class="media-generating__icon">
          <svg v-if="message.mediaGenerating === 'video'" class="media-generating__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="5" width="13" height="14" rx="2.5" />
            <path stroke-linecap="round" stroke-linejoin="round" d="m20.5 9.5-4.5 2.5 4.5 2.5v-5Z" />
          </svg>
          <svg v-else class="media-generating__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <circle cx="9" cy="10" r="1.8" />
            <path stroke-linecap="round" stroke-linejoin="round" d="m5.5 17.5 4.5-4.5 3 3 3-3 2.5 2.5" />
          </svg>
          </div>
          <span class="media-generating__label">{{ message.mediaGenerating === 'video' ? (message.mediaStopped ? '视频生成已停止' : '视频生成中…') : (message.mediaStopped ? '图片生成已停止' : '图片生成中…') }}</span>
        </div>
        <div v-if="message.mediaGenerating === 'image'" class="media-generating__grid">
          <!-- 逐格填充：已完成的图片原位显示在对应占位格，未完成保持灰格 -->
          <template v-for="(_, slotIndex) in mediaGeneratingCount" :key="slotIndex">
            <img
              v-if="mediaPlaceholderFill[slotIndex]"
              :src="toSameOriginUrl(mediaPlaceholderFill[slotIndex].url)"
              :alt="mediaPlaceholderFill[slotIndex].name"
              class="media-generating__placeholder media-generating__placeholder--filled"
              loading="lazy"
              @click="previewImage(mediaPlaceholderFill[slotIndex], mediaResults)"
            />
            <!-- 空占位格按请求比例显示（比例来自任务状态事件，未知时回退 1:1 方格子） -->
            <div v-else class="media-generating__placeholder" :style="{ aspectRatio: imageGeneratingAspect.ratio }" aria-hidden="true"></div>
          </template>
          <!-- 有比例来源时标注请求比例（右下角徽标），未知时只展示占位格不猜测 -->
          <span v-if="message.mediaGeneratingRatio" class="media-generating__grid-ratio">{{ imageGeneratingAspect.label }}</span>
        </div>
        <!-- 视频生成中：按视频实际画幅比例显示占位框并标注比例（比例来自任务状态事件，未知时回退 16:9；
             图片生成中占位格同样按请求比例展示，见上方） -->
        <div v-if="message.mediaGenerating === 'video'" class="media-generating__video" aria-hidden="true">
          <div class="media-generating__video-frame" :style="{ aspectRatio: videoGeneratingAspect.ratio }">
            <span class="media-generating__video-ratio">{{ videoGeneratingAspect.label }}</span>
          </div>
        </div>
      </div>

      <!-- 回合终态：失败 / 已停止（reliability design 12.1 — 失败无正文时仍有可读错误消息） -->
      <div v-if="message.turnState === 'failed'" class="ai-message-turn-state ai-message-turn-state--failed" role="status">
        <span class="ai-message-turn-state__dot" aria-hidden="true"></span>
        <span class="ai-message-turn-state__summary">
          {{ message.error_message || '回合执行失败' }}
        </span>
        <button
          v-if="message.retryable !== false"
          type="button"
          class="ai-message-turn-state__retry"
          aria-label="重试这个回合"
          @click="$emit('retry', message)"
        >
          重试
        </button>
      </div>
      <div v-else-if="message.turnState === 'cancelled'" class="ai-message-turn-state ai-message-turn-state--cancelled" role="status">
        <span class="ai-message-turn-state__dot" aria-hidden="true"></span>
        <span class="ai-message-turn-state__summary">已停止{{ message.cancel_reason ? `（${message.cancel_reason}）` : '' }}</span>
      </div>

      <!-- 主要内容 -->
      <div
        v-if="!message.isThinking && (!message.mediaGenerating || message.content)"
        class="ai-message__text ai-message__text--after-generation"
        :class="{ 'is-loading': message.isStreaming && !message.content }"
        @contextmenu="handleContextMenu"
      >
        <template v-if="message.isStreaming && !message.content">
          <span class="loading-dots">AI 正在回复</span>
        </template>
        <template v-else-if="message.isStreaming && message.content">
          <div class="ai-message__text-stream">{{ message.content }}</div>
        </template>
        <template v-else>
          <div v-html="formattedContent"></div>
        </template>
      </div>

      <!-- 选择卡片独立子组件：选项选择只重渲染卡片本身，不触发整条消息的 markdown 重渲染 -->
      <AIAssistantChoiceCard
        v-if="message.role === 'assistant' && assistantChoices && !message.isStreaming"
        :choices="assistantChoices"
        @select="emitChoiceSelect"
      />

      <!-- 图片生成结果组：默认展开，可折叠为首图叠层。
           图片生成中期间隐藏（已完成图片已在占位格原位显示），全部完成/视频时正常展示 -->
      <div v-if="message.role === 'assistant' && mediaResults.length && message.mediaGenerating !== 'image'" class="ai-media-results">
        <button type="button" class="ai-media-results__toggle" :aria-expanded="showMediaResults" @click="showMediaResults = !showMediaResults">
          <svg class="ai-media-results__toggle-icon" :class="{ 'is-expanded': showMediaResults }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          <span>{{ mediaResults[0].type === 'video' ? '视频已生成' : '图片已生成' }} ×{{ mediaResults.length }}</span>
        </button>
        <button v-if="!showMediaResults" type="button" class="ai-media-results__collapsed" @click="showMediaResults = true">
          <!-- 真实图片堆叠：前 3 张错位露出边缘，其余并入 +N 角标；背面图片带轻微倾斜（分镜格子折叠感），层内缩不超出按钮边界，不与相邻文字重叠 -->
          <span
            v-for="(media, index) in collapsedStack"
            :key="media.url"
            class="ai-media-results__collapsed-layer"
            :style="{ inset: `${index * 5}px ${(collapsedStack.length - 1 - index) * 12}px ${(collapsedStack.length - 1 - index) * 12}px ${index * 5}px`, transform: `rotate(${index * 1.5}deg)`, zIndex: collapsedStack.length - index }"
            :aria-hidden="index > 0 ? 'true' : undefined"
          >
            <img v-if="media.type === 'image'" :src="toSameOriginUrl(media.url)" :alt="index === 0 ? media.name : ''" loading="lazy" />
            <video v-else :src="toSameOriginUrl(media.url)" :aria-label="index === 0 ? media.name : ''" preload="metadata"></video>
            <!-- 收起态首个视频叠加播放键，提示这是可播放的视频而非静态封面 -->
            <span v-if="index === 0 && media.type === 'video'" class="ai-media-results__collapsed-play" aria-hidden="true">
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
            </span>
          </span>
          <span v-if="mediaResults.length > collapsedStack.length" class="ai-media-results__remaining">+{{ mediaResults.length - collapsedStack.length }}</span>
        </button>
        <div v-else class="ai-media-results__grid">
        <div v-for="media in mediaResults" :key="media.url" class="ai-media-card">
          <img
            v-if="media.type === 'image'"
            :src="toSameOriginUrl(media.url)"
            :alt="media.name"
            class="ai-media-card__preview"
            :style="imagePreviewStyle(media)"
            loading="lazy"
            @load="onImageLoad(media, $event)"
            @click="previewImage(media, mediaResults)"
          />
          <video
            v-else
            :src="toSameOriginUrl(media.url)"
            class="ai-media-card__preview"
            :style="videoPreviewStyle(media)"
            controls
            preload="metadata"
            @loadedmetadata="onVideoMetadata(media, $event)"
            @click="$emit('preview-media', { type: 'video', url: toSameOriginUrl(media.url), name: media.name })"
          ></video>
          <button
            type="button"
            class="ai-media-card__download"
            title="下载"
            aria-label="下载媒体文件"
            @click.stop="startStreamDownload(media.url, media.name)"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>下载</span>
          </button>
        </div>
        </div>
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
      <div v-if="message.role !== 'user' && visibleAttachments.length && !mediaResults.length" class="ai-attachments">
        <div
          v-for="(att, index) in visibleAttachments"
          :key="index"
          class="ai-attachment"
          draggable="true"
          @dragstart="handleAttachmentDragStart($event, att)"
        >
          <!-- 图片预览 -->
          <img
            v-if="att.type === 'image'"
            :src="toSameOriginUrl(att.url)"
            :alt="att.name"
            class="ai-attachment__image"
            @click="$emit('preview-media', { type: 'image', url: toSameOriginUrl(att.url), name: att.name })"
          />
          <!-- 视频内联预览 -->
          <div v-else-if="att.type === 'video'" class="ai-attachment__video-wrapper" @click="$emit('preview-media', { type: 'video', url: toSameOriginUrl(att.url), name: att.name })">
            <video
              :src="toSameOriginUrl(att.url)"
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

      <div v-if="message.role === 'assistant' && message.turn_id && !message.isStreaming && message.turnState !== 'cancelled'" class="ai-message-feedback" role="group" aria-label="回答反馈">
        <span class="ai-message-feedback__label">这次回答有帮助吗？</span>
        <button type="button" class="ai-message-feedback__button" :class="{ selected: message.feedback === 'up' }" :aria-pressed="message.feedback === 'up'" aria-label="有帮助" @click="$emit('feedback', { message, rating: 'up' })">👍</button>
        <button type="button" class="ai-message-feedback__button" :class="{ selected: message.feedback === 'down' }" :aria-pressed="message.feedback === 'down'" aria-label="没帮助" @click="$emit('feedback', { message, rating: 'down' })">👎</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { toSameOriginUrl } from '@/utils/canvasThumbnail'
import { startStreamDownload } from '@/api/client'
import { parseAssistantContent } from '@/utils/aiAssistantContent'
import AIAssistantChoiceCard from './AIAssistantChoiceCard.vue'

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

// 归一化附件渲染：按 URL 去重；视频只保留第一个可播放地址，
// 避免历史数据中混入封面/临时 URL 出现无法播放的重复视频框。
const visibleAttachments = computed(() => {
  const atts = Array.isArray(props.message.attachments) ? props.message.attachments : []
  const seen = new Set()
  const result = []
  for (const att of atts) {
    if (!att?.url || seen.has(att.url)) continue
    seen.add(att.url)
    if (att.type === 'video' && result.some(item => item.type === 'video')) continue
    result.push(att)
  }
  return result
})

const emit = defineEmits(['preview-media', 'select-choice', 'retry', 'feedback'])

function previewImage(media, images) {
  const imageGroup = images
    .filter(item => item.type === 'image')
    .map(item => ({
      type: 'image',
      url: toSameOriginUrl(item.url),
      name: item.name
    }))
  emit('preview-media', {
    type: 'image',
    url: toSameOriginUrl(media.url),
    name: media.name,
    images: imageGroup
  })
}

const parsedContent = computed(() => parseAssistantContent(props.message.content))
const assistantChoices = computed(() => props.message.role === 'assistant' ? parsedContent.value.choices : null)

// 选择卡片选中/输入状态已内聚到 AIAssistantChoiceCard，这里只转发选择结果
function emitChoiceSelect(value) {
  emit('select-choice', value)
}

// 从 MCP 工具结果（task-status / image-gen / video-gen）中提取媒体 URL
const MEDIA_TOOL_NAMES = ['task-status', 'image-gen', 'video-gen']
const MEDIA_URL_RE = /https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|webp|gif|mp4|webm|mov)(?:[?#][^\s"'<>]*)?/gi

function extractUrlsFromToolResult(result) {
  if (!result) return []
  const texts = []
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block && typeof block.text === 'string') texts.push(block.text)
    }
  } else if (typeof result === 'string') {
    texts.push(result)
  }
  const urls = []
  const collect = (obj, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 5) return
    for (const key of ['result_urls', 'preview_urls', 'urls', 'images']) {
      const list = Array.isArray(obj[key]) ? obj[key] : []
      for (const item of list) {
        const u = typeof item === 'string' ? item : item && item.url
        if (typeof u === 'string' && u.startsWith('http')) urls.push(u)
      }
    }
    for (const nested of ['task', 'result', 'data']) {
      if (obj[nested] && typeof obj[nested] === 'object') collect(obj[nested], depth + 1)
    }
  }
  for (const text of texts) {
    try {
      collect(JSON.parse(text))
    } catch {
      // 非 JSON 文本，跳过
    }
  }
  return urls
}

function mediaTypeFromUrl(url) {
  const ext = (url.split('?')[0].split('#')[0].match(/\.([a-zA-Z0-9]+)$/) || [])[1]?.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video'
  return null
}

// 汇总消息中可可视化的媒体：工具结果 + 最终回复文本中的媒体 URL
const mediaResults = computed(() => {
  const list = []
  const push = (url, attachment = null) => {
    const cleanUrl = String(url || '').trim().replace(/[),.;]+$/, '')
    if (!cleanUrl || list.some(item => item.url === cleanUrl)) return
    const type = attachment?.type || mediaTypeFromUrl(cleanUrl)
    if (!type) return
    if (!['image', 'video'].includes(type)) return
    list.push({
      url: cleanUrl,
      type,
      name: attachment?.name || decodeURIComponent(cleanUrl.split('?')[0].split('/').pop() || 'download'),
      task_id: attachment?.task_id || null,
    })
  }
  for (const attachment of visibleAttachments.value) push(attachment.url, attachment)
  for (const tool of Array.isArray(props.message.toolEvents) ? props.message.toolEvents : []) {
    if (tool.status !== 'done') continue
    const toolName = String(tool.name || '').toLowerCase()
    if (!MEDIA_TOOL_NAMES.some(name => toolName.includes(name))) continue
    for (const url of extractUrlsFromToolResult(tool.result)) push(url)
  }
  const content = typeof props.message.content === 'string' ? props.message.content : ''
  for (const match of content.matchAll(MEDIA_URL_RE)) push(match[0])
  return list
})

// 占位网格总格数恒定：优先 mediaGeneratingTotal（进入生成中时记录的一次性请求数量，
// 不会随完成递减）；历史消息无该字段时回退递减中的 mediaGeneratingCount。
// 若直接用 mediaGeneratingCount 渲染格子，8 张生成 6 张后只剩 2 格（占位格数随生成变少）。
const mediaGeneratingCount = computed(() => Math.max(1, Number(props.message.mediaGeneratingTotal) || Number(props.message.mediaGeneratingCount) || 1))

// 多图生成中逐格填充：已完成图片按提交顺序（mediaSubmissionOrder 中的 task_id 次序）
// 固定入格——先完成的后序图不会挤占前面空位，全部完成时也不会“刷新跳动”。
// 无提交顺序记录时（历史消息/单图）退化为按返回顺序逐格填充。
const mediaPlaceholderFill = computed(() => {
  const images = mediaResults.value.filter(m => m.type === 'image')
  const total = mediaGeneratingCount.value
  const order = Array.isArray(props.message.mediaSubmissionOrder) ? props.message.mediaSubmissionOrder : []
  if (!order.length || images.length === 0) return images
  const orderIndex = new Map(order.map((taskId, index) => [taskId, index]))
  const slots = new Array(total).fill(null)
  const hasKnown = images.some(img => img.task_id && orderIndex.has(img.task_id))
  if (!hasKnown) return images
  for (const img of images) {
    const idx = img.task_id && orderIndex.has(img.task_id) ? orderIndex.get(img.task_id) : null
    if (idx !== null && idx >= 0 && idx < total) slots[idx] = img
  }
  // 已知槽位填充完，剩余的（历史消息无 task_id）按序填入空槽
  let cursor = 0
  for (const img of images) {
    if (slots.includes(img)) continue
    while (cursor < total && slots[cursor] !== null) cursor += 1
    if (cursor >= total) break
    slots[cursor] = img
    cursor += 1
  }
  return slots
})

// 视频实际尺寸：loadedmetadata 后按视频自身宽高比展示（竖屏 9:16 不再被 16:9 容器压扁/裁切），
// 加载前 CSS 保底 16:9，避免高度塌陷
const videoDimensions = ref({})
function onVideoMetadata(media, event) {
  const video = event?.target
  const w = Number(video?.videoWidth) || 0
  const h = Number(video?.videoHeight) || 0
  if (w > 0 && h > 0) {
    videoDimensions.value = { ...videoDimensions.value, [media.url]: { w, h } }
  }
}
function videoPreviewStyle(media) {
  const dim = videoDimensions.value[media.url]
  return dim ? { aspectRatio: `${dim.w} / ${dim.h}` } : null
}

// 图片实际尺寸：@load 后按图片自身宽高比展示（横屏 16:9 不再被 min-height: 160px 撑成近正方形），
// 加载前 CSS min-height: 160px 保底，避免高度塌陷
const imageDimensions = ref({})
function onImageLoad(media, event) {
  const img = event?.target
  const w = Number(img?.naturalWidth) || 0
  const h = Number(img?.naturalHeight) || 0
  if (w > 0 && h > 0) {
    imageDimensions.value = { ...imageDimensions.value, [media.url]: { w, h } }
  }
}
function imagePreviewStyle(media) {
  const dim = imageDimensions.value[media.url]
  // 加载后以真实宽高比覆盖 CSS min-height 兜底（minHeight: '0'），
  // 否则横屏图会被 160px 最小高度撑高；加载前返回 null 沿用 CSS 保底
  return dim ? { aspectRatio: `${dim.w} / ${dim.h}`, minHeight: '0' } : null
}

/**
 * 视频生成中占位框的实际画幅比例：优先任务状态事件带出的 aspect_ratio
 * （video_history.aspect_ratio，用户提交时写入），未知时回退 16:9。
 * 返回 { label: '16:9', ratio: '16 / 9' } 供模板与样式绑定使用。
 */
const videoGeneratingAspect = computed(() => {
  const raw = String(props.message.mediaGeneratingRatio || '').trim().toLowerCase()
  const valid = /^\d{1,2}\s*:\s*\d{1,2}$/.test(raw)
  const ratio = valid ? raw : '16:9'
  const [w = '16', h = '9'] = ratio.split(':')
  const numW = Number(w)
  const numH = Number(h)
  const ratioStyle = (numW > 0 && numH > 0) ? `${numW} / ${numH}` : '16 / 9'
  return { label: ratio, ratio: ratioStyle }
})

/**
 * 图片生成中占位格的实际画幅比例：与视频一致，优先任务状态事件带出的 aspect_ratio
 * （image_history.aspect_ratio，用户提交时写入），未知时回退 1:1。
 * 返回 { label: '9:16', ratio: '9 / 16' } 供模板与样式绑定使用。
 */
const imageGeneratingAspect = computed(() => {
  const raw = String(props.message.mediaGeneratingRatio || '').trim().toLowerCase()
  const valid = /^\d{1,2}\s*:\s*\d{1,2}$/.test(raw)
  const ratio = valid ? raw : '1:1'
  const [w = '1', h = '1'] = ratio.split(':')
  const numW = Number(w)
  const numH = Number(h)
  const ratioStyle = (numW > 0 && numH > 0) ? `${numW} / ${numH}` : '1 / 1'
  return { label: ratio, ratio: ratioStyle }
})

// 折叠态堆叠层：最多展示前 3 张真实图片，其余并入 +N 角标
const collapsedStack = computed(() => mediaResults.value.slice(0, 3))

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
const showMediaResults = ref(true)
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

const markdownRenderer = new marked.Renderer()
markdownRenderer.table = function (token) {
  const renderCell = (cell) => this.parser.parseInline(cell.tokens || [])
  const header = Array.isArray(token.header) ? token.header : []
  const rows = Array.isArray(token.rows) ? token.rows : []
  const items = rows.map((row, rowIndex) => {
    const cells = Array.isArray(row) ? row : []
    const fallbackTitle = { tokens: [{ type: 'text', raw: `项目 ${rowIndex + 1}`, text: `项目 ${rowIndex + 1}` }] }
    const title = renderCell(cells[0] || fallbackTitle)
    const properties = cells.slice(1).map((cell, cellIndex) => {
      const label = header[cellIndex + 1] ? renderCell(header[cellIndex + 1]) : `字段 ${cellIndex + 2}`
      return `<div class="ai-table-list__property"><span class="ai-table-list__label">${label}</span><span class="ai-table-list__value">${renderCell(cell)}</span></div>`
    }).join('')
    const fallback = cells.length <= 1 ? cells.map((cell) => `<div class="ai-table-list__value">${renderCell(cell)}</div>`).join('') : ''
    return `<article class="ai-table-list__item"><h4 class="ai-table-list__title">${title}</h4>${properties || fallback}</article>`
  }).join('')
  const empty = header.length ? `<article class="ai-table-list__item"><h4 class="ai-table-list__title">${header.map(renderCell).join(' · ')}</h4></article>` : ''
  return `<div class="ai-table-list">${items || empty}</div>`
}

// 按 content 缓存 markdown 渲染结果：同一条消息正文不变时（选择选项、展开折叠、
// hover、preGenerationContent 重复渲染）不重复跑 marked.parse + DOMPurify.sanitize。
const formatContentCache = new Map()

function formatContent(content) {
  if (!content) return ''
  const cached = formatContentCache.get(content)
  if (cached !== undefined) return cached

  let result
  try {
    const plain = parseAssistantContent(content).content
    // 使用 marked 解析 markdown
    const html = marked.parse(plain, { renderer: markdownRenderer })
    // 使用 DOMPurify 清理 HTML
    result = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'a', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'article', 'span'],
      ALLOWED_ATTR: ['href', 'target', 'class']
    })
  } catch (e) {
    // 如果解析失败，返回原始文本
    result = DOMPurify.sanitize(content.replace(/\n/g, '<br>'), { ALLOWED_TAGS: ['br'] })
  }
  // 防缓存无界增长：超过上限时清空最旧的一半（消息正文内容唯一，数量有限）
  if (formatContentCache.size >= 500) {
    const oldest = [...formatContentCache.keys()].slice(0, 250)
    for (const key of oldest) formatContentCache.delete(key)
  }
  formatContentCache.set(content, result)
  return result
}

const formattedContent = computed(() => {
  return formatContent(parsedContent.value.content)
})

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

.ai-message--assistant .ai-message__content {
  display: flex;
  flex-direction: column;
}

.ai-message--user .ai-message__content {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

/* ========== 消息气泡 - 毛玻璃灵动设计 ========== */
.ai-message__text {
  padding: 8px 0;
  border-radius: 0;
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

.ai-message__text-stream {
  padding: 8px 0;
  border-radius: 0;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
  user-select: text;
  -webkit-user-select: text;
  -moz-user-select: text;
  -ms-user-select: text;
  cursor: text;
  background: transparent;
  color: var(--ai-message-assistant-text, #e5e7eb);
}

.media-generating {
  order: 2;
  margin-top: 4px;
}

.media-generating__header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(226, 232, 240, 0.72);
}

.media-generating__icon {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  flex-shrink: 0;
  border-radius: 7px;
  color: rgba(226, 232, 240, 0.76);
  background: rgba(148, 163, 184, 0.1);
  animation: media-generating-pulse 1.6s ease-in-out infinite;
}

.media-generating--video .media-generating__icon {
  color: #60a5fa;
  background: rgba(96, 165, 250, 0.12);
}

.media-generating__svg {
  width: 15px;
  height: 15px;
}

.media-generating__label {
  font-size: 13px;
  font-weight: 500;
}

.media-generating__grid,
.ai-media-results__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 16px;
  /* 网格项顶对齐：不同比例图片（竖屏/横屏/方形）各自按高度展示，互不拉伸 */
  align-items: start;
  /* 图片有尺寸上限：面板/对话框再宽，网格也不随之放大（单图最大 256px，与折叠态一致） */
  width: min(100%, 532px);
}

/* 图片生成中：网格为绝对定位比例徽标提供定位锚点（徽标悬浮在右下角，不参与布局） */
.media-generating__grid {
  position: relative;
}

.media-generating__placeholder {
  aspect-ratio: 1;
  min-height: 180px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 22px;
  background-color: rgba(148, 163, 184, 0.065);
  background-image: radial-gradient(circle, rgba(226, 232, 240, 0.14) 1.2px, transparent 1.4px);
  background-position: 16px calc(100% - 16px);
  background-size: 12px 12px;
  animation: media-generating-placeholder 1.8s ease-in-out infinite alternate;
}
/* 生成被中断停止（mediaStopped）：占位格停止脉冲动画并降透明度，视觉上「冻结」，
   占位网格与图片保持可见（不删除 mediaGenerating 相关字段）。 */
.media-generating--stopped .media-generating__icon,
.media-generating--stopped .media-generating__placeholder,
.media-generating--stopped .media-generating__video-frame {
  animation: none;
  opacity: 0.55;
}
.media-generating--stopped .media-generating__header {
  color: rgba(226, 232, 240, 0.45);
}
/* 多图生成中：已完成图片原位填充占位格（覆盖灰格底色与动画，显示真实图片） */
.media-generating__placeholder--filled {
  width: 100%;
  height: 100%;
  object-fit: cover;
  padding: 0;
  cursor: pointer;
  animation: none;
  background: rgba(127, 127, 127, 0.08);
}

/* 视频生成中：画幅占位框按实际比例展示（未知时回退 16:9，与图片 1:1 方格子对应） */
.media-generating__video {
  margin-top: 16px;
  width: min(100%, 532px);
}
.media-generating__video-frame {
  position: relative;
  aspect-ratio: 16 / 9;
  min-height: 160px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 22px;
  background-color: rgba(148, 163, 184, 0.065);
  background-image: radial-gradient(circle, rgba(226, 232, 240, 0.14) 1.2px, transparent 1.4px);
  background-position: 16px calc(100% - 16px);
  background-size: 12px 12px;
  animation: media-generating-placeholder 1.8s ease-in-out infinite alternate;
}
.media-generating__video-ratio {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 500;
  color: rgba(226, 232, 240, 0.9);
  background: rgba(15, 23, 42, 0.55);
}

/* 图片生成中：请求比例徽标，样式与视频占位框的比例徽标一致 */
.media-generating__grid-ratio {
  position: absolute;
  right: 12px;
  bottom: 12px;
  padding: 4px 9px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 500;
  z-index: 1;
  color: rgba(226, 232, 240, 0.9);
  background: rgba(15, 23, 42, 0.55);
}

@keyframes media-generating-pulse {
  0%, 100% {
    opacity: 0.55;
    transform: scale(0.96);
  }
  50% {
    opacity: 1;
    transform: scale(1.04);
  }
}

@keyframes media-generating-placeholder {
  from { opacity: 0.5; }
  to { opacity: 1; }
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
  background: transparent;
  color: var(--ai-message-assistant-text, #e5e7eb);
}

/* 用户消息气泡 - 蓝色毛玻璃 */
.ai-message--user .ai-message__text {
  padding: 10px 14px;
  border-radius: 12px;
  background: #292929;
  color: #f4f4f5;
  border: 1px solid #525252;
  box-shadow: none;
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

.ai-message__text :deep(.ai-table-list) {
  display: grid;
  gap: 8px;
  margin: 10px 0;
}

.ai-message__text :deep(.ai-table-list__item) {
  padding: 10px 12px;
  border: 1px solid var(--ai-message-border, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  background: var(--ai-message-list-bg, rgba(255, 255, 255, 0.035));
}

.ai-message__text :deep(.ai-table-list__title) {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.ai-message__text :deep(.ai-table-list__property) {
  display: grid;
  grid-template-columns: minmax(70px, 0.35fr) minmax(0, 1fr);
  gap: 8px;
  padding: 4px 0;
}

.ai-message__text :deep(.ai-table-list__label) {
  color: var(--ai-message-muted, #a1a1aa);
  font-size: 12px;
}

.ai-message__text :deep(.ai-table-list__value) {
  min-width: 0;
}

.ai-thinking {
  order: 0;
  margin-bottom: 8px;
}

.ai-thinking__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 4px 0;
  background: transparent;
  border: 0;
  color: rgba(148, 163, 184, 0.9);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: color 0.2s;
}

.ai-thinking__toggle:hover {
  color: #e2e8f0;
}

.ai-thinking__spinner {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  border: 2px solid rgba(148, 163, 184, 0.36);
  border-right-color: rgba(226, 232, 240, 0.9);
  border-radius: 50%;
  animation: ai-thinking-spin 0.8s linear infinite;
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

.ai-live-shimmer {
  background: linear-gradient(110deg, rgba(148, 163, 184, 0.85) 20%, rgba(255, 255, 255, 0.98) 45%, rgba(148, 163, 184, 0.85) 70%);
  background-size: 220% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: ai-status-shimmer 1.45s linear infinite;
}

@keyframes ai-status-shimmer {
  to { background-position: -220% 0; }
}

@keyframes ai-thinking-spin {
  to { transform: rotate(360deg); }
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

:root.canvas-theme-light .ai-message__text-stream {
  background: linear-gradient(135deg,
    rgba(255, 255, 255, 0.75) 0%,
    rgba(248, 250, 252, 0.85) 100%
  );
  color: #1c1917;
  border-color: rgba(0, 0, 0, 0.06);
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

:root.canvas-theme-light .media-generating {
  background: linear-gradient(135deg,
    rgba(255, 255, 255, 0.75) 0%,
    rgba(248, 250, 252, 0.85) 100%
  );
  border-color: rgba(0, 0, 0, 0.06);
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

:root.canvas-theme-light .media-generating__label {
  color: #1c1917;
}

:root.canvas-theme-light .media-generating__header,
:root.canvas-theme-light .ai-media-results__toggle {
  color: #57534e;
}

:root.canvas-theme-light .media-generating__placeholder,
:root.canvas-theme-light .media-generating__video-frame {
  border-color: rgba(15, 23, 42, 0.12);
  background-color: rgba(15, 23, 42, 0.035);
  background-image: radial-gradient(circle, rgba(15, 23, 42, 0.13) 1.2px, transparent 1.4px);
}

:root.canvas-theme-light .media-generating__video-ratio,
:root.canvas-theme-light .media-generating__grid-ratio {
  color: rgba(28, 25, 23, 0.9);
  background: rgba(255, 255, 255, 0.82);
}

:root.canvas-theme-light .ai-message-reference {
  border-color: rgba(15, 23, 42, 0.14);
  color: #292524;
  background: rgba(255, 255, 255, 0.74);
}

:root.canvas-theme-light .ai-message-reference--attachment:hover {
  border-color: rgba(15, 23, 42, 0.24);
  background: #fff;
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
  background: transparent;
  border: 0;
  padding: 4px 0;
  color: #7c3aed;
}

:root.canvas-theme-light .ai-thinking__toggle:hover {
  background: transparent;
  color: #6d28d9;
}

:root.canvas-theme-light .ai-thinking__content {
  background: rgba(139, 92, 246, 0.08);
  color: #6d28d9;
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

/* ========== 音频播放器卡片样式（长方条） ========== */
.ai-audio-player {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: linear-gradient(135deg, 
    rgba(45, 50, 65, 0.85) 0%,
    rgba(35, 40, 55, 0.9) 100%
  );
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  min-width: 280px;
  max-width: 100%;
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: all 0.3s ease;
  cursor: default;
}

.ai-audio-player:hover {
  box-shadow: 
    0 6px 28px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-1px);
}

/* 音频封面/图标区域 */
.ai-audio-player__cover {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 0.3) 0%,
    rgba(99, 102, 241, 0.25) 100%
  );
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}

.ai-audio-player__visualizer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
  height: 100%;
  padding: 8px;
}

.ai-audio-player__bar {
  width: 3px;
  background: linear-gradient(to top, 
    rgba(168, 85, 247, 0.8) 0%,
    rgba(99, 102, 241, 0.9) 50%,
    rgba(59, 130, 246, 0.8) 100%
  );
  border-radius: 2px;
  animation: audioWave 1.2s ease-in-out infinite;
}

@keyframes audioWave {
  0%, 100% {
    height: 20%;
    opacity: 0.6;
  }
  50% {
    height: 80%;
    opacity: 1;
  }
}

/* 音频信息区域 */
.ai-audio-player__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ai-audio-player__name {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 进度条 */
.ai-audio-player__progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-audio-player__progress-bar {
  position: relative;
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  cursor: pointer;
}

.ai-audio-player__progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, 
    rgba(168, 85, 247, 0.9) 0%,
    rgba(99, 102, 241, 0.95) 50%,
    rgba(59, 130, 246, 0.9) 100%
  );
  border-radius: 2px;
  transition: width 0.1s linear;
}

.ai-audio-player__progress-dot {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 12px;
  height: 12px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 50%;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  transition: left 0.1s linear;
  opacity: 0;
}

.ai-audio-player__progress-bar:hover .ai-audio-player__progress-dot {
  opacity: 1;
}

.ai-audio-player__time {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

/* 控制按钮 */
.ai-audio-player__controls {
  flex-shrink: 0;
}

.ai-audio-player__play-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 0.8) 0%,
    rgba(99, 102, 241, 0.85) 100%
  );
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 
    0 2px 8px rgba(139, 92, 246, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.ai-audio-player__play-btn:hover {
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 0.95) 0%,
    rgba(99, 102, 241, 1) 100%
  );
  transform: scale(1.05);
  box-shadow: 
    0 4px 12px rgba(139, 92, 246, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.ai-audio-player__play-btn:active {
  transform: scale(0.95);
}

/* 白昼模式适配 */
:root.canvas-theme-light .ai-audio-player {
  background: linear-gradient(135deg, 
    rgba(255, 255, 255, 0.85) 0%,
    rgba(248, 250, 252, 0.9) 100%
  );
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 
    0 4px 20px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

:root.canvas-theme-light .ai-audio-player:hover {
  box-shadow: 
    0 6px 28px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.95);
  border-color: rgba(0, 0, 0, 0.12);
}

:root.canvas-theme-light .ai-audio-player__cover {
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 0.15) 0%,
    rgba(99, 102, 241, 0.12) 100%
  );
}

:root.canvas-theme-light .ai-audio-player__bar {
  background: linear-gradient(to top, 
    rgba(168, 85, 247, 0.6) 0%,
    rgba(99, 102, 241, 0.7) 50%,
    rgba(59, 130, 246, 0.6) 100%
  );
}

:root.canvas-theme-light .ai-audio-player__name {
  color: #1c1917;
}

:root.canvas-theme-light .ai-audio-player__progress-bar {
  background: rgba(0, 0, 0, 0.08);
}

:root.canvas-theme-light .ai-audio-player__progress-fill {
  background: linear-gradient(90deg, 
    rgba(168, 85, 247, 0.7) 0%,
    rgba(99, 102, 241, 0.75) 50%,
    rgba(59, 130, 246, 0.7) 100%
  );
}

:root.canvas-theme-light .ai-audio-player__progress-dot {
  background: rgba(0, 0, 0, 0.8);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

:root.canvas-theme-light .ai-audio-player__time {
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .ai-audio-player__play-btn {
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 0.9) 0%,
    rgba(99, 102, 241, 0.95) 100%
  );
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 
    0 2px 8px rgba(139, 92, 246, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

:root.canvas-theme-light .ai-audio-player__play-btn:hover {
  background: linear-gradient(135deg, 
    rgba(168, 85, 247, 1) 0%,
    rgba(99, 102, 241, 1) 100%
  );
  box-shadow: 
    0 4px 12px rgba(139, 92, 246, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

/* Conversation redesign: AI is inline text; user is a neutral monochrome card. */
.ai-message--assistant .ai-message__text,
.ai-message__text-stream {
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  color: var(--ai-message-assistant-text, #e5e7eb) !important;
}

.ai-message--user .ai-message__text {
  background: #292929 !important;
  border: 1px solid #525252 !important;
  border-radius: 12px !important;
  box-shadow: none !important;
  color: #f4f4f5 !important;
}

:root.canvas-theme-light .ai-message--assistant .ai-message__text,
:root.canvas-theme-light .ai-message__text-stream {
  --ai-message-assistant-text: #292524;
  --ai-message-border: rgba(41, 37, 36, 0.16);
  --ai-message-list-bg: rgba(41, 37, 36, 0.035);
  --ai-message-muted: #78716c;
  --ai-message-choice-active: #57534e;
  --ai-message-choice-active-bg: rgba(41, 37, 36, 0.08);
}

:root.canvas-theme-light .ai-message--user .ai-message__text {
  background: #f1f1f1 !important;
  border-color: #c7c7c7 !important;
  color: #242424 !important;
}
.ai-message__references {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-bottom: 8px;
}

.ai-message-reference {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 220px;
  height: 34px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(15, 23, 42, 0.35);
  font-size: 12px;
  line-height: 1;
}

.ai-message-reference > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-message-reference--attachment {
  cursor: pointer;
}

.ai-message-reference--attachment:hover {
  border-color: rgba(255, 255, 255, 0.34);
  background: rgba(15, 23, 42, 0.55);
}

.ai-message-reference--skill {
  border-color: rgba(196, 181, 253, 0.35);
}

.ai-message-reference--model {
  border-color: rgba(147, 197, 253, 0.32);
}

.ai-message-reference__icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: #c4b5fd;
}

.ai-message-reference__thumbnail {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 5px;
  object-fit: cover;
}

.ai-media-results {
  order: 3;
  margin-top: 16px;
}

.ai-message__text--pre-generation {
  order: 1;
}

.ai-message__text--after-generation {
  order: 4;
}

.ai-media-results__toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0;
  border: 0;
  color: rgba(226, 232, 240, 0.72);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}

.ai-media-results__toggle:hover {
  color: rgba(255, 255, 255, 0.94);
}

.ai-media-results__toggle-icon {
  width: 16px;
  height: 16px;
  transition: transform 0.18s ease;
  transform: rotate(-90deg);
}

.ai-media-results__toggle-icon.is-expanded {
  transform: rotate(0deg);
}

.ai-media-results__collapsed {
  position: relative;
  display: block;
  width: min(100%, 256px);
  aspect-ratio: 1;
  margin-top: 14px;
  padding: 0;
  border: 0;
  border-radius: 22px;
  background: transparent;
  cursor: pointer;
}

.ai-media-results__collapsed-layer {
  position: absolute;
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(127, 127, 127, 0.2);
  background: rgba(127, 127, 127, 0.08);
}
.ai-media-results__collapsed-layer img,
.ai-media-results__collapsed-layer video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* 收起态首个视频的播放键：居中半透明圆底，提示可播放 */
.ai-media-results__collapsed-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.ai-media-results__collapsed-play svg {
  width: 40px;
  height: 40px;
  padding: 9px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.ai-media-results__remaining {
  position: absolute;
  z-index: 4;
  right: 10px;
  top: 10px;
  padding: 5px 8px;
  border-radius: 999px;
  color: #1f2937;
  background: rgba(255, 255, 255, 0.88);
  font-size: 13px;
  font-weight: 600;
}

.ai-media-card {
  position: relative;
  min-width: 0;
  max-width: 100%;
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid rgba(127, 127, 127, 0.2);
  background: rgba(127, 127, 127, 0.08);
}
/* 图片按自身比例展示（竖屏图显示竖屏高度，无灰色边框留白）；加载前给保底高度避免塌陷 */
img.ai-media-card__preview {
  display: block;
  width: 100%;
  height: auto;
  min-height: 160px;
  object-fit: cover;
  cursor: pointer;
  background: rgba(127, 127, 127, 0.1);
}
/* 视频无固有宽高比，保底 16:9 */
video.ai-media-card__preview {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  cursor: pointer;
  background: rgba(127, 127, 127, 0.1);
}
.ai-media-card__download {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.4;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  cursor: pointer;
}
.ai-media-card__download:hover {
  background: rgba(0, 0, 0, 0.75);
}

.ai-message-turn-state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.3;
}
.ai-message-turn-state--failed {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #b91c1c;
}
.ai-message-turn-state--cancelled {
  background: rgba(107, 114, 128, 0.08);
  border: 1px solid rgba(107, 114, 128, 0.25);
  color: #6b7280;
}
.ai-message-turn-state__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
}
.ai-message-turn-state__summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ai-message-turn-state__retry {
  flex: none;
  padding: 2px 10px;
  border-radius: 6px;
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.08);
  color: #b91c1c;
  font-size: 11px;
  cursor: pointer;
}
.ai-message-turn-state__retry:focus-visible {
  outline: 2px solid rgba(239, 68, 68, 0.6);
  outline-offset: 2px;
}

.ai-message-feedback {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  color: rgba(100, 116, 139, 0.9);
  font-size: 11px;
}
.ai-message-feedback__label { margin-right: 2px; }
.ai-message-feedback__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 25px;
  height: 25px;
  padding: 0;
  border: 1px solid rgba(148, 163, 184, 0.32);
  border-radius: 7px;
  background: rgba(148, 163, 184, 0.08);
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}
.ai-message-feedback__button:hover,
.ai-message-feedback__button.selected {
  border-color: rgba(129, 140, 248, 0.65);
  background: rgba(129, 140, 248, 0.18);
}
.ai-message-feedback__button:focus-visible {
  outline: 2px solid rgba(129, 140, 248, 0.75);
  outline-offset: 2px;
}

</style>
