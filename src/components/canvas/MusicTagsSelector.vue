<template>
  <div class="music-tags-selector">
    <!-- Tags Categories -->
    <div class="tags-container" @wheel.stop="handleWheel" ref="tagsContainerRef">
      <!-- Genre Tags -->
      <div class="tag-category">
        <div class="category-header">
          <span class="category-icon">♪</span>
          <span class="category-title">{{ getCategoryTitle('genre') }}</span>
          <span class="tag-count">({{ getSelectedCount('genre') }}/{{ getTotalCount('genre') }})</span>
        </div>
        <div class="tag-chips">
          <button
            v-for="tag in getLocalizedTags('genre', displayLang)"
            :key="tag.value"
            @click="toggleTag('genre', tag.value)"
            :class="['tag-chip', { selected: isTagSelected('genre', tag.value) }]"
          >
            {{ tag.label }}
          </button>
        </div>
      </div>

      <!-- Mood Tags -->
      <div class="tag-category">
        <div class="category-header">
          <span class="category-icon">☺</span>
          <span class="category-title">{{ getCategoryTitle('mood') }}</span>
          <span class="tag-count">({{ getSelectedCount('mood') }}/{{ getTotalCount('mood') }})</span>
        </div>
        <div class="tag-chips">
          <button
            v-for="tag in getLocalizedTags('mood', displayLang)"
            :key="tag.value"
            @click="toggleTag('mood', tag.value)"
            :class="['tag-chip', { selected: isTagSelected('mood', tag.value) }]"
          >
            {{ tag.label }}
          </button>
        </div>
      </div>

      <!-- Vocal Tags -->
      <div class="tag-category">
        <div class="category-header">
          <span class="category-icon">♬</span>
          <span class="category-title">{{ getCategoryTitle('vocal') }}</span>
          <span class="tag-count">({{ getSelectedCount('vocal') }}/{{ getTotalCount('vocal') }})</span>
        </div>
        <div class="tag-chips">
          <button
            v-for="tag in getLocalizedTags('vocal', displayLang)"
            :key="tag.value"
            @click="toggleTag('vocal', tag.value)"
            :class="['tag-chip', { selected: isTagSelected('vocal', tag.value) }]"
          >
            {{ tag.label }}
          </button>
        </div>
      </div>

      <!-- Instruments Tags -->
      <div class="tag-category">
        <div class="category-header">
          <span class="category-icon">♩</span>
          <span class="category-title">{{ getCategoryTitle('instruments') }}</span>
          <span class="tag-count">({{ getSelectedCount('instruments') }}/{{ getTotalCount('instruments') }})</span>
        </div>
        <div class="tag-chips">
          <button
            v-for="tag in getLocalizedTags('instruments', displayLang)"
            :key="tag.value"
            @click="toggleTag('instruments', tag.value)"
            :class="['tag-chip', { selected: isTagSelected('instruments', tag.value) }]"
          >
            {{ tag.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from '@/i18n'
import { getLocalizedTags, getTagsCount } from '@/i18n/musicTags'

const { currentLanguage } = useI18n()

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

// 标签容器引用
const tagsContainerRef = ref(null)

// 处理滚轮事件 - 阻止事件冒泡到画布
const handleWheel = (event) => {
  const container = tagsContainerRef.value
  if (!container) return
  
  // 滚动容器
  container.scrollTop += event.deltaY
}

// 使用当前用户语言版本显示
const displayLang = computed(() => {
  // 将当前语言映射到音乐标签支持的语言
  const lang = currentLanguage.value
  if (lang === 'zh-CN' || lang === 'zh-TW' || lang === 'en' || lang === 'ja' || lang === 'ko') {
    return lang
  }
  // 默认使用简体中文
  return 'zh-CN'
})

// Selected tags by category (stores English values)
const selectedTags = ref({
  genre: new Set(),
  mood: new Set(),
  vocal: new Set(),
  instruments: new Set()
})

// Initialize from modelValue
const initializeSelectedTags = () => {
  if (props.modelValue) {
    const tags = props.modelValue.split(',').map(t => t.trim()).filter(Boolean)

    // Clear all
    selectedTags.value.genre.clear()
    selectedTags.value.mood.clear()
    selectedTags.value.vocal.clear()
    selectedTags.value.instruments.clear()

    // Categorize tags
    tags.forEach(tag => {
      const allCategories = ['genre', 'mood', 'vocal', 'instruments']
      for (const category of allCategories) {
        const categoryTags = getLocalizedTags(category, 'en')
        if (categoryTags.some(t => t.value === tag)) {
          selectedTags.value[category].add(tag)
          break
        }
      }
    })
  }
}

initializeSelectedTags()

// Watch for external changes
watch(() => props.modelValue, () => {
  initializeSelectedTags()
})

// Toggle tag selection
const toggleTag = (category, value) => {
  if (selectedTags.value[category].has(value)) {
    selectedTags.value[category].delete(value)
  } else {
    selectedTags.value[category].add(value)
  }
  emitUpdate()
}

// Check if tag is selected
const isTagSelected = (category, value) => {
  return selectedTags.value[category].has(value)
}

// Get selected count for category
const getSelectedCount = (category) => {
  return selectedTags.value[category].size
}

// Get total count for category
const getTotalCount = (category) => {
  const counts = getTagsCount()
  return counts[category] || 0
}

// Get category title in current language
const getCategoryTitle = (category) => {
  const titles = {
    en: {
      genre: 'Genre',
      mood: 'Mood',
      vocal: 'Vocal',
      instruments: 'Instruments'
    },
    'zh-CN': {
      genre: '曲风',
      mood: '情绪',
      vocal: '人声',
      instruments: '乐器'
    },
    'zh-TW': {
      genre: '曲風',
      mood: '情緒',
      vocal: '人聲',
      instruments: '樂器'
    },
    'ja': {
      genre: 'ジャンル',
      mood: 'ムード',
      vocal: 'ボーカル',
      instruments: '楽器'
    },
    'ko': {
      genre: '장르',
      mood: '분위기',
      vocal: '보컬',
      instruments: '악기'
    }
  }

  return titles[displayLang.value]?.[category] || titles['zh-CN'][category]
}

// Get selected tags as comma-separated string (always in English)
const selectedTagsString = computed(() => {
  const allTags = []
  Object.values(selectedTags.value).forEach(set => {
    allTags.push(...Array.from(set))
  })
  return allTags.join(', ')
})

// Emit update to parent
const emitUpdate = () => {
  emit('update:modelValue', selectedTagsString.value)
}
</script>

<style scoped>
.music-tags-selector {
  display: flex;
  flex-direction: column;
  width: 100%;
}

/* Tags Container */
.tags-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
}

.tags-container::-webkit-scrollbar {
  width: 4px;
}

.tags-container::-webkit-scrollbar-track {
  background: transparent;
}

.tags-container::-webkit-scrollbar-thumb {
  background: #444444;
  border-radius: 2px;
}

.tag-category {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #888888;
}

.category-icon {
  font-size: 14px;
  color: #666666;
}

.category-title {
  font-weight: 500;
  color: #cccccc;
}

.tag-count {
  font-size: 11px;
  color: #555555;
  margin-left: auto;
}

.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-chip {
  padding: 6px 14px;
  border: 1px solid #333333;
  background: #252525;
  color: #aaaaaa;
  font-size: 13px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.tag-chip:hover {
  border-color: #555555;
  background: #2a2a2a;
  color: #ffffff;
}

.tag-chip.selected {
  border-color: #666666;
  background: #ffffff;
  color: #000000;
  font-weight: 500;
}
</style>

<!-- 白昼模式样式（非 scoped） -->
<style>
/* ========================================
   MusicTagsSelector 白昼模式样式适配
   ======================================== */

/* 滚动条 - 白昼模式 */
:root.canvas-theme-light .music-tags-selector .tags-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .music-tags-selector .tags-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}

/* 分类标题 - 白昼模式 */
:root.canvas-theme-light .music-tags-selector .category-header {
  color: #57534e;
}

:root.canvas-theme-light .music-tags-selector .category-icon {
  color: #78716c;
}

:root.canvas-theme-light .music-tags-selector .category-title {
  color: #1c1917;
}

:root.canvas-theme-light .music-tags-selector .tag-count {
  color: #a8a29e;
}

/* 标签按钮 - 白昼模式 */
:root.canvas-theme-light .music-tags-selector .tag-chip {
  border-color: rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.03);
  color: #57534e;
}

:root.canvas-theme-light .music-tags-selector .tag-chip:hover {
  border-color: rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.06);
  color: #1c1917;
}

:root.canvas-theme-light .music-tags-selector .tag-chip.selected {
  border-color: rgba(59, 130, 246, 0.5);
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}
</style>
