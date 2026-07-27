<template>
  <div class="voice-picker-backdrop" @click.self="emit('close')">
    <section class="voice-picker" role="dialog" aria-modal="true" aria-label="音色选择">
      <header class="voice-picker-header">
        <h2>音色选择</h2>
        <button type="button" class="close-button" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <div class="voice-picker-toolbar">
        <div class="voice-picker-tabs" role="tablist" aria-label="音色分类">
          <button type="button" :class="{ active: activeTab === 'all' }" @click="activeTab = 'all'">音色库</button>
          <button type="button" :class="{ active: activeTab === 'favorites' }" @click="activeTab = 'favorites'">收藏音色</button>
          <button type="button" class="clone-tab" disabled title="声音克隆即将开放">克隆新音色（即将开放）</button>
        </div>
        <label class="voice-search">
          <span aria-hidden="true">⌕</span>
          <input v-model.trim="keyword" type="search" placeholder="搜索音色库" />
        </label>
      </div>

      <div class="voice-picker-filters">
        <select v-model="locale"><option value="">全部语种</option><option v-for="item in locales" :key="item" :value="item">{{ localeLabels[item] || item }}</option></select>
        <select v-model="gender"><option value="">全部性别</option><option value="female">女声</option><option value="male">男声</option></select>
        <select v-model="style"><option value="">全部风格</option><option v-for="item in styles" :key="item" :value="item">{{ styleLabels[item] || item }}</option></select>
      </div>

      <div class="voice-picker-list">
        <p v-if="loading" class="voice-empty">正在加载音色库…</p>
        <p v-else-if="error" class="voice-empty">{{ error }}</p>
        <p v-else-if="!filteredVoices.length" class="voice-empty">没有符合条件的音色</p>
        <article v-for="voice in paginatedVoices" :key="voice.id" class="voice-row" :class="{ selected: modelValue?.id === voice.id }">
          <button type="button" class="preview-button" :disabled="!voice.hasPreview" :title="voice.hasPreview ? '试听音色' : '试听素材准备中'" @click="togglePreview(voice)">
            {{ playingId === voice.id ? '■' : '▶' }}
          </button>
          <div class="voice-main">
            <strong>{{ voice.name }}</strong>
            <small v-if="voice.description">{{ voice.description }}</small>
            <span>{{ voice.tags?.join(' · ') }}</span>
          </div>
          <div class="voice-meta"><span>{{ localeLabels[voice.locale] || voice.locale }}</span><span>{{ genderLabel(voice.gender) }}</span><span>{{ styleLabels[voice.style] || voice.style }}</span></div>
          <button type="button" class="select-button" :disabled="!voice.hasPreview" @click="emit('select', voice)">{{ modelValue?.id === voice.id ? '已选' : '选择' }}</button>
          <button type="button" class="favorite-button" :class="{ active: voice.isFavorite }" :title="voice.isFavorite ? '取消收藏' : '收藏'" @click="toggleFavorite(voice)">{{ voice.isFavorite ? '★' : '☆' }}</button>
        </article>
      </div>
      <footer v-if="pageCount > 1" class="voice-picker-pagination" aria-label="音色分页">
        <button type="button" :disabled="currentPage === 1" @click="currentPage -= 1">上一页</button>
        <button v-for="page in pageCount" :key="page" type="button" :class="{ active: currentPage === page }" :aria-current="currentPage === page ? 'page' : undefined" @click="currentPage = page">{{ page }}</button>
        <button type="button" :disabled="currentPage === pageCount" @click="currentPage += 1">下一页</button>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import apiClient from '@/api/client'

const props = defineProps({ modelValue: { type: Object, default: null } })
const emit = defineEmits(['select', 'close'])
const voices = ref([])
const activeTab = ref('all')
const keyword = ref('')
const locale = ref('zh-CN')
const gender = ref('')
const style = ref('')
const loading = ref(false)
const error = ref('')
const playingId = ref('')
const currentPage = ref(1)
const pageSize = 12
let previewAudio = null

const styleLabels = { narration: '旁白', conversational: '对话', advertising: '广告', emotional: '情感', news: '资讯' }
const localeLabels = {
  'zh-CN': '中文（简体）',
  'zh-TW': '中文（台湾）',
  'yue-HK': '粤语（港澳）',
  'en-US': '英语（美国）',
  'ja-JP': '日语',
  'ko-KR': '韩语',
  'es-ES': '西班牙语（西班牙）',
  'es-MX': '西班牙语（墨西哥）',
  'es-AR': '西班牙语（阿根廷）',
  'fr-FR': '法语',
  'de-DE': '德语',
  'pt-BR': '葡萄牙语（巴西）',
  'pt-PT': '葡萄牙语（葡萄牙）',
  'ru-RU': '俄语',
  'ar-SA': '阿拉伯语',
  'hi-IN': '印地语',
  'id-ID': '印度尼西亚语',
  'tr-TR': '土耳其语'
}
const locales = computed(() => [...new Set(voices.value.map(item => item.locale))])
const styles = computed(() => [...new Set(voices.value.map(item => item.style))])
const filteredVoices = computed(() => {
  const query = keyword.value.toLocaleLowerCase()
  return voices.value.filter(voice => {
    const searchable = [voice.name, voice.description, voice.locale, voice.gender, voice.style, ...(voice.tags || [])].join(' ').toLocaleLowerCase()
    return (activeTab.value !== 'favorites' || voice.isFavorite) &&
      (!query || searchable.includes(query)) &&
      (!locale.value || voice.locale === locale.value) &&
      (!gender.value || voice.gender === gender.value) &&
      (!style.value || voice.style === style.value)
  })
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredVoices.value.length / pageSize)))
const paginatedVoices = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredVoices.value.slice(start, start + pageSize)
})

watch([keyword, locale, gender, style, activeTab], () => { currentPage.value = 1 })
watch(pageCount, count => {
  if (currentPage.value > count) currentPage.value = count
})

function genderLabel(value) {
  return value === 'female' ? '女' : value === 'male' ? '男' : value
}

async function loadVoices() {
  loading.value = true
  error.value = ''
  try {
    const response = await apiClient.get('/api/audio/voice-presets')
    voices.value = response.data || []
  } catch (requestError) {
    error.value = requestError?.message || '音色库加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function stopPreview() {
  previewAudio?.pause()
  previewAudio = null
  playingId.value = ''
}

function togglePreview(voice) {
  if (!voice.hasPreview) return
  if (playingId.value === voice.id) return stopPreview()
  stopPreview()
  previewAudio = new Audio(voice.previewUrl)
  previewAudio.onended = stopPreview
  previewAudio.onerror = stopPreview
  previewAudio.play().then(() => { playingId.value = voice.id }).catch(stopPreview)
}

async function toggleFavorite(voice) {
  try {
    const response = await apiClient.post(`/api/audio/voice-presets/${encodeURIComponent(voice.id)}/favorite`)
    voice.isFavorite = Boolean(response.isFavorite)
  } catch (requestError) {
    error.value = requestError?.message || '收藏音色失败，请稍后重试'
  }
}

onMounted(loadVoices)
onBeforeUnmount(stopPreview)
</script>

<style scoped>
.voice-picker-backdrop { position: fixed; inset: 0; z-index: 12000; display: grid; place-items: center; padding: 24px; background: rgba(0, 0, 0, .68); backdrop-filter: blur(8px); }
.voice-picker { display: flex; flex-direction: column; width: min(1120px, 100%); max-height: min(760px, calc(100vh - 48px)); overflow: hidden; color: #f5f5f5; background: #242424; border: 1px solid rgba(255,255,255,.1); border-radius: 22px; box-shadow: 0 28px 90px rgba(0,0,0,.5); }
.voice-picker-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 30px; border-bottom: 1px solid rgba(255,255,255,.08); }
.voice-picker-header h2 { margin: 0; font-size: 22px; }.close-button { color: #aaa; font-size: 36px; line-height: 1; background: none; border: 0; cursor: pointer; }.close-button:hover { color: #fff; }
.voice-picker-toolbar { display: flex; gap: 16px; align-items: center; padding: 26px 30px 14px; }.voice-picker-tabs { display: flex; gap: 4px; padding: 6px; background: #343434; border-radius: 14px; }.voice-picker-tabs button { padding: 10px 16px; color: #aaa; background: transparent; border: 0; border-radius: 10px; cursor: pointer; }.voice-picker-tabs button.active { color: #fff; background: #606060; }.voice-picker-tabs .clone-tab { cursor: not-allowed; opacity: .45; }
.voice-search { display: flex; flex: 1; gap: 10px; align-items: center; min-width: 180px; padding: 0 16px; background: #343434; border-radius: 14px; color: #aaa; }.voice-search span { font-size: 26px; }.voice-search input { width: 100%; height: 54px; color: #fff; font-size: 16px; background: transparent; border: 0; outline: 0; }
.voice-picker-filters { display: flex; gap: 10px; padding: 0 30px 14px; }.voice-picker-filters select { min-width: 120px; padding: 9px 12px; color: #ddd; background: #343434; border: 1px solid rgba(255,255,255,.08); border-radius: 9px; outline: 0; }
.voice-picker-list { min-height: 240px; padding: 0 30px 22px; overflow-y: auto; }.voice-row { display: flex; gap: 16px; align-items: center; min-height: 92px; margin: 9px 0; padding: 14px 20px; background: #323232; border: 1px solid transparent; border-radius: 18px; }.voice-row.selected { background: #414141; border-color: rgba(255,255,255,.18); }.preview-button { width: 46px; height: 46px; color: #fff; font-size: 16px; background: #515151; border: 0; border-radius: 12px; cursor: pointer; }.preview-button:disabled { cursor: wait; opacity: .4; }.voice-main { display: grid; flex: 1; min-width: 140px; gap: 5px; }.voice-main strong { font-size: 18px; }.voice-main small { overflow: hidden; color: #d5d5d5; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.voice-main span { overflow: hidden; color: #aaa; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.voice-meta { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }.voice-meta span { padding: 4px 7px; color: #aaa; font-size: 12px; background: #444; border-radius: 5px; }.select-button { min-width: 72px; padding: 10px 14px; color: #202020; font-weight: 700; background: #fff; border: 0; border-radius: 999px; cursor: pointer; }.select-button:disabled { cursor: not-allowed; color: #aaa; background: #555; }.favorite-button { padding: 6px; color: #aaa; font-size: 28px; background: transparent; border: 0; cursor: pointer; }.favorite-button.active { color: #f4cf49; }.voice-empty { padding: 80px 0; color: #aaa; text-align: center; }
.voice-picker-pagination { display: flex; justify-content: center; gap: 8px; padding: 0 30px 24px; }.voice-picker-pagination button { min-width: 36px; padding: 8px 12px; color: #ccc; background: #343434; border: 1px solid rgba(255,255,255,.08); border-radius: 8px; cursor: pointer; }.voice-picker-pagination button.active { color: #202020; background: #fff; }.voice-picker-pagination button:disabled { cursor: not-allowed; opacity: .4; }
@media (max-width: 760px) { .voice-picker-backdrop { padding: 12px; }.voice-picker-header, .voice-picker-toolbar, .voice-picker-filters, .voice-picker-list { padding-left: 16px; padding-right: 16px; }.voice-picker-toolbar { align-items: stretch; flex-direction: column; }.voice-picker-tabs { overflow-x: auto; }.voice-picker-tabs button { flex: 0 0 auto; }.voice-row { gap: 10px; padding: 12px; }.voice-meta { display: none; }.voice-main strong { font-size: 15px; } }
</style>
