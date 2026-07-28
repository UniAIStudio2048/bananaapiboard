<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { showToast } from '@/composables/useCanvasDialog'
import { translatePrompt } from '@/api/canvas/prompt-translation'

const props = defineProps({
  text: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['translated'])
const loading = ref(false)
const isDisabled = computed(() => props.disabled || loading.value || !props.text.trim())
const lightIconUrl = 'https://filescos.nananobanana.cn/_global_/ui-assets/canvas-icons/6cf6f931-a6b1-4ce4-b566-2949c0c8980f.png'
const darkIconUrl = 'https://filescos.nananobanana.cn/_global_/ui-assets/canvas-icons/d417c9eb-d6e4-4b86-8470-20e5bc070c94.png'
const isLightTheme = ref(false)
const translationIconSrc = computed(() => isLightTheme.value ? lightIconUrl : darkIconUrl)
let themeClassObserver = null

onMounted(() => {
  const root = document.documentElement
  const syncTheme = () => {
    isLightTheme.value = root.classList.contains('canvas-theme-light')
  }

  syncTheme()
  themeClassObserver = new MutationObserver(syncTheme)
  themeClassObserver.observe(root, { attributes: true, attributeFilter: ['class'] })
})

onUnmounted(() => themeClassObserver?.disconnect())

async function handleTranslate() {
  if (isDisabled.value) return
  loading.value = true
  try {
    const result = await translatePrompt(props.text)
    if (!result?.result) throw new Error('翻译服务返回空结果')
    emit('translated', result.result)
    showToast('提示词已翻译', 'success')
  } catch (error) {
    showToast(error.message || '提示词翻译失败', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <button
    type="button"
    class="prompt-translate-button nodrag"
    :disabled="isDisabled"
    title="翻译提示词（中译英 / 英译中）"
    aria-label="翻译提示词（中译英 / 英译中）"
    @mousedown.stop
    @pointerdown.stop
    @click.stop="handleTranslate"
  >
    <span v-if="loading" class="prompt-translate-loading" aria-hidden="true">…</span>
    <img v-else class="prompt-translate-icon" :src="translationIconSrc" alt="" draggable="false" aria-hidden="true">
  </button>
</template>

<style>
.prompt-translate-button {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 0;
  border-radius: 8px;
  color: #cbd5e1;
  background: #3a3a3a;
  cursor: pointer;
  pointer-events: auto;
  transition: background-color .15s ease, color .15s ease, opacity .15s ease;
}

.prompt-translate-button:hover:not(:disabled) {
  color: #f8fafc;
  background: #555;
}

.prompt-translate-button:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.prompt-translate-icon {
  width: 22px;
  height: 22px;
  display: block;
  flex: 0 0 22px;
  object-fit: contain;
  pointer-events: none;
}

:root.canvas-theme-light .prompt-translate-button {
  border: 1px solid #d1d5db;
  background: #fff;
}

:root.canvas-theme-light .prompt-translate-button:hover:not(:disabled) {
  color: #111827;
  background: #f3f4f6;
}

.prompt-translate-loading {
  font-size: 20px;
  line-height: 1;
}
</style>
