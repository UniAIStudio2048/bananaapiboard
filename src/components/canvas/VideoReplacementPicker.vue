<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Check, Film, FolderOpen, History, X } from '@lucide/vue'
import { getAssets } from '@/api/canvas/assets'
import { getHistory } from '@/api/canvas/history'
import { getVideoPosterUrl, toSameOriginUrl } from '@/utils/canvasThumbnail'

const props = defineProps({
  spaceParams: { type: Object, default: () => ({}) },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'select'])
const activeSource = ref('history')
const items = ref([])
const historyItems = ref(null)
const selected = ref(null)
const loading = ref(false)
const errorMessage = ref('')
const page = ref(1)
const hasNextPage = ref(false)
const closeButton = ref(null)
let requestId = 0
const pageSize = 24

function normalizeVideoSources(rows, source) {
  return (Array.isArray(rows) ? rows : [])
    .filter(item => item?.type === 'video' && typeof item.url === 'string' && item.url.trim() && item.url !== 'null' &&
      (source !== 'history' || !item.status || ['completed', 'success', 'succeeded'].includes(String(item.status).toLowerCase())))
    .map(item => ({ ...item, source, url: item.url.trim(), name: item.name || item.title || '视频', posterFailed: false, previewFailed: false }))
}

async function loadSource(nextPage = 1) {
  const currentRequest = ++requestId
  const source = activeSource.value
  loading.value = true
  errorMessage.value = ''
  try {
    if (source === 'history') {
      if (!historyItems.value) {
        const result = await getHistory({ ...props.spaceParams, type: 'video', limit: 100 })
        if (currentRequest !== requestId) return
        historyItems.value = normalizeVideoSources(result.history, source)
      }
      items.value = historyItems.value.slice((nextPage - 1) * pageSize, nextPage * pageSize)
      hasNextPage.value = historyItems.value.length > nextPage * pageSize
    } else {
      const result = await getAssets({ ...props.spaceParams, type: 'video', page: nextPage, pageSize })
      if (currentRequest !== requestId) return
      const rows = result.assets
      items.value = normalizeVideoSources(rows, source)
      hasNextPage.value = Array.isArray(rows) && rows.length >= pageSize
    }
    page.value = nextPage
  } catch (error) {
    if (currentRequest !== requestId) return
    items.value = []
    errorMessage.value = error?.message || '素材加载失败，请重试'
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

function switchSource(source) {
  if (source === activeSource.value || props.busy) return
  activeSource.value = source
  selected.value = null
  loadSource()
}

function changePage(nextPage) {
  selected.value = null
  loadSource(nextPage)
}

function posterUrl(item) {
  const url = item.thumbnail_url || item.thumbnailUrl || item.cover_url || item.coverUrl
  return url ? toSameOriginUrl(url) : getVideoPosterUrl(toSameOriginUrl(item.url), 320)
}

function handleKeydown(event) {
  event.stopPropagation()
  if (event.key === 'Escape' && !props.busy) emit('close')
  if (event.key === 'Tab') {
    const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled)')].filter(element => element.getClientRects().length)
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
}

onMounted(() => {
  nextTick(() => closeButton.value?.focus())
  loadSource()
})
onUnmounted(() => { requestId++ })
</script>

<template>
  <Teleport to="body">
    <div class="video-replacement-overlay" @click.self="!busy && emit('close')" @keydown="handleKeydown">
      <section class="video-replacement-dialog" role="dialog" aria-modal="true" aria-label="选择视频素材">
        <aside class="replacement-sidebar">
          <div class="replacement-heading">素材库</div>
          <button type="button" :class="{ active: activeSource === 'history' }" :disabled="busy" @click="switchSource('history')"><History :size="16" />生成历史</button>
          <button type="button" :class="{ active: activeSource === 'asset' }" :disabled="busy" @click="switchSource('asset')"><FolderOpen :size="16" />我的资产</button>
        </aside>
        <div class="replacement-content">
          <header>
            <div><strong>{{ activeSource === 'history' ? '生成历史' : '我的资产' }}</strong><span>视频</span></div>
            <button ref="closeButton" type="button" class="replacement-close" aria-label="关闭素材选择" :disabled="busy" @click="emit('close')"><X :size="18" /></button>
          </header>
          <div class="replacement-list nowheel" @wheel.stop>
            <div v-if="loading" class="replacement-state">正在加载视频…</div>
            <div v-else-if="errorMessage" class="replacement-state"><span>{{ errorMessage }}</span><button type="button" @click="loadSource(page)">重试</button></div>
            <div v-else-if="!items.length" class="replacement-state">暂无可用视频</div>
            <div v-else class="replacement-grid">
              <button v-for="item in items" :key="item.id || item.url" type="button" class="replacement-item" :class="{ selected: selected === item }" :aria-pressed="selected === item" :disabled="busy" @click="selected = item">
                <span class="replacement-thumbnail">
                  <img v-if="posterUrl(item) && !item.posterFailed" :src="posterUrl(item)" alt="" loading="lazy" @error="item.posterFailed = true" />
                  <video v-else-if="!item.previewFailed" :src="toSameOriginUrl(item.url)" muted playsinline preload="metadata" @loadeddata="$event.target.currentTime = 0.1" @error="item.previewFailed = true"></video>
                  <Film v-else :size="28" aria-hidden="true" />
                  <span v-if="selected === item" class="replacement-check"><Check :size="14" /></span>
                </span>
                <span class="replacement-name" :title="item.name">{{ item.name }}</span>
              </button>
            </div>
          </div>
          <footer>
            <div v-if="page > 1 || hasNextPage" class="replacement-pages">
              <button type="button" :disabled="page <= 1 || loading || busy" @click="changePage(page - 1)">上一页</button>
              <span>{{ page }}</span>
              <button type="button" :disabled="!hasNextPage || loading || busy" @click="changePage(page + 1)">下一页</button>
            </div>
            <span v-else class="replacement-footer-spacer"></span>
            <button type="button" :disabled="busy" @click="emit('close')">取消</button>
            <button type="button" class="replacement-confirm" :disabled="!selected || busy" @click="emit('select', selected)">{{ busy ? '替换中…' : '确认选择' }}</button>
          </footer>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.video-replacement-overlay { position: fixed; inset: 0; z-index: 12000; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0, 0, 0, .68); }
.video-replacement-dialog { display: flex; width: min(100%, 1060px); height: min(80vh, 780px); min-height: 320px; overflow: hidden; border: 1px solid var(--canvas-border-default, #3a3a3a); border-radius: 16px; background: var(--canvas-bg-primary, #141414); color: var(--canvas-text-primary, #fff); box-shadow: var(--canvas-shadow-lg); font: 13px system-ui, sans-serif; }
.replacement-sidebar { flex: 0 0 170px; padding: 16px 8px; border-right: 1px solid var(--canvas-border-subtle, #2a2a2a); }
.replacement-heading { padding: 0 8px 14px; color: var(--canvas-text-secondary, #aaa); font-weight: 600; }
.replacement-sidebar button { display: flex; width: 100%; align-items: center; gap: 10px; padding: 10px 9px; border: 0; border-radius: 8px; color: var(--canvas-text-secondary, #aaa); background: transparent; text-align: left; cursor: pointer; }
.replacement-sidebar button:hover, .replacement-sidebar button.active { color: var(--canvas-text-primary, #fff); background: var(--canvas-bg-elevated, #242424); }
.replacement-content { display: flex; flex: 1; min-width: 0; flex-direction: column; }
.replacement-content header { display: flex; flex: 0 0 60px; align-items: center; justify-content: space-between; padding: 0 20px; border-bottom: 1px solid var(--canvas-border-subtle, #2a2a2a); }
.replacement-content header strong { font-size: 14px; }
.replacement-content header span { margin-left: 12px; color: var(--canvas-text-secondary, #aaa); }
.replacement-close { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: 0; border-radius: 8px; color: var(--canvas-text-secondary, #aaa); background: transparent; cursor: pointer; }
.replacement-close:hover { color: var(--canvas-text-primary, #fff); background: var(--canvas-bg-elevated, #242424); }
.replacement-list { flex: 1; min-height: 0; overflow: auto; padding: 18px 20px; }
.replacement-state { display: flex; height: 100%; align-items: center; justify-content: center; gap: 12px; color: var(--canvas-text-secondary, #aaa); }
.replacement-state button, .replacement-pages button { border: 0; color: inherit; background: transparent; cursor: pointer; }
.replacement-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
.replacement-item { min-width: 0; padding: 0; border: 0; border-radius: 9px; color: var(--canvas-text-primary, #fff); background: transparent; text-align: left; cursor: pointer; }
.replacement-thumbnail { position: relative; display: flex; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; align-items: center; justify-content: center; border: 1px solid var(--canvas-border-default, #3a3a3a); border-radius: 8px; color: var(--canvas-text-secondary, #aaa); background: var(--canvas-bg-tertiary, #1a1a1a); }
.replacement-thumbnail img, .replacement-thumbnail video { width: 100%; height: 100%; object-fit: cover; }
.replacement-item:hover .replacement-thumbnail, .replacement-item.selected .replacement-thumbnail { border-color: var(--canvas-text-primary, #fff); }
.replacement-check { position: absolute; top: 6px; right: 6px; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; color: var(--canvas-bg-primary, #141414); background: var(--canvas-text-primary, #fff); }
.replacement-name { display: block; overflow: hidden; margin-top: 7px; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.replacement-content footer { display: flex; flex: 0 0 64px; align-items: center; gap: 8px; padding: 0 20px; border-top: 1px solid var(--canvas-border-subtle, #2a2a2a); }
.replacement-footer-spacer, .replacement-pages { flex: 1; }
.replacement-pages { display: flex; align-items: center; gap: 10px; color: var(--canvas-text-secondary, #aaa); }
.replacement-content footer > button { padding: 8px 14px; border: 1px solid var(--canvas-border-default, #3a3a3a); border-radius: 8px; color: var(--canvas-text-primary, #fff); background: var(--canvas-bg-elevated, #242424); cursor: pointer; }
.replacement-content footer > .replacement-confirm { color: var(--canvas-bg-primary, #141414); background: var(--canvas-text-primary, #fff); }
.replacement-content button:disabled, .replacement-sidebar button:disabled { opacity: .45; cursor: not-allowed; }
.replacement-content button:focus-visible, .replacement-sidebar button:focus-visible { outline: 2px solid var(--canvas-text-primary, #fff); outline-offset: 2px; }
@media (max-width: 600px) { .video-replacement-overlay { padding: 12px; } .replacement-sidebar { flex-basis: 120px; } .replacement-grid { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); } }
</style>
