<template>
  <Teleport to="body">
    <Transition name="mention-fade">
      <div
        v-if="visible && items.length > 0"
        class="prompt-mention-popup"
        :style="popupStyle"
        @mousedown.prevent
      >
        <div class="mention-popup-header">
          <span class="mention-popup-icon">@</span>
          <span class="mention-popup-title">插入引用</span>
        </div>
        <div class="mention-popup-list" ref="listRef">
          <div
            v-for="(item, index) in items"
            :key="item.type + '-' + item.index"
            class="mention-popup-item"
            :class="{ active: index === activeIndex }"
            @click="$emit('select', item)"
            @mouseenter="$emit('update:activeIndex', index)"
          >
            <div class="mention-item-preview">
              <template v-if="item.type === 'image'">
                <img v-if="getMentionPreviewImageSrc(item)" :src="getMentionPreviewImageSrc(item)" class="mention-item-thumb" />
                <div v-else class="mention-item-thumb mention-item-placeholder-thumb"></div>
              </template>
              <template v-else-if="item.type === 'video'">
                <div class="mention-item-thumb mention-item-video-thumb">
                  <img v-if="hasExplicitThumbnail(item)" :src="getMentionPreviewImageSrc(item)" class="mention-item-thumb" />
                  <video v-else :src="item.url" muted preload="metadata" :poster="getVideoPosterUrl(item.url)" @loadeddata="$event.target.currentTime = 0.1" />
                  <span class="mention-video-badge">▶</span>
                </div>
              </template>
              <template v-else-if="item.type === 'audio'">
                <div class="mention-item-thumb mention-item-audio-thumb">
                  <span class="mention-audio-icon">🎵</span>
                </div>
              </template>
            </div>
            <div class="mention-item-info">
              <span class="mention-item-label">@{{ item.label }}</span>
              <span class="mention-item-type">{{ typeLabel(item.type) }}</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, watch, ref, nextTick } from 'vue'
import { getVideoPosterUrl } from '@/utils/canvasThumbnail'
import { getMentionPreviewImageSrc, getMentionPreviewUrl } from '@/utils/promptMention'

const props = defineProps({
  visible: { type: Boolean, default: false },
  items: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
  position: { type: Object, default: () => ({ top: 0, left: 0 }) }
})

defineEmits(['select', 'update:activeIndex'])

const listRef = ref(null)

const popupStyle = computed(() => ({
  position: 'fixed',
  top: `${props.position.top}px`,
  left: `${props.position.left}px`,
  zIndex: 99999
}))

function typeLabel(type) {
  const map = { image: '参考图片', video: '参考视频', audio: '参考音频' }
  return map[type] || type
}

function hasExplicitThumbnail(item) {
  const previewUrl = getMentionPreviewUrl(item)
  return !!previewUrl && previewUrl !== item.url
}

watch(() => props.activeIndex, async () => {
  await nextTick()
  if (!listRef.value) return
  const activeEl = listRef.value.querySelector('.mention-popup-item.active')
  if (activeEl) {
    activeEl.scrollIntoView({ block: 'nearest' })
  }
})
</script>

<style scoped>
.prompt-mention-popup {
  border-radius: 10px;
  min-width: 200px;
  max-width: 280px;
  max-height: 260px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.mention-popup-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 6px;
}

.mention-popup-icon {
  font-weight: 700;
  font-size: 14px;
}

.mention-popup-title {
  font-size: 11px;
}

.mention-popup-list {
  overflow-y: auto;
  padding: 4px;
}

.mention-popup-list::-webkit-scrollbar {
  width: 4px;
}

.mention-popup-list::-webkit-scrollbar-thumb {
  border-radius: 2px;
}

.mention-popup-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.mention-item-preview {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
}

.mention-item-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
}

.mention-item-video-thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.mention-item-video-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mention-video-badge {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: white;
  background: rgba(0, 0, 0, 0.35);
}

.mention-item-audio-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.mention-item-placeholder-thumb {
  background: rgba(255, 255, 255, 0.08);
}

.mention-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mention-item-label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mention-item-type {
  font-size: 11px;
}

/* Transition */
.mention-fade-enter-active,
.mention-fade-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.mention-fade-enter-from,
.mention-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>

<!-- 画布始终是深色背景，颜色用非 scoped 确保 Teleport 下生效 -->
<style>
.prompt-mention-popup {
  background: #1c1c1e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.prompt-mention-popup .mention-popup-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.prompt-mention-popup .mention-popup-icon { color: #aaa; }
.prompt-mention-popup .mention-popup-title { color: rgba(255, 255, 255, 0.45); }
.prompt-mention-popup .mention-popup-list::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); }
.prompt-mention-popup .mention-popup-item:hover,
.prompt-mention-popup .mention-popup-item.active { background: rgba(255, 255, 255, 0.08); }
.prompt-mention-popup .mention-item-video-thumb { background: #222; }
.prompt-mention-popup .mention-item-audio-thumb { background: #333; }
.prompt-mention-popup .mention-item-label { color: #e5e5e5; }
.prompt-mention-popup .mention-item-type { color: rgba(255, 255, 255, 0.4); }
</style>
