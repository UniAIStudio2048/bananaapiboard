<script setup>
import { t as translateUi } from '@/i18n'

import { ref, computed, onMounted, nextTick } from 'vue'
import { getVideoAnalysisConfig } from '@/api/canvas/video-analysis'
import { formatPoints } from '@/utils/format'
const emit = defineEmits(['close', 'confirm'])
const config = ref(null), model = ref(''), error = ref(''), loading = ref(true), dialog = ref(null)
const price = computed(() => !config.value ? '' : config.value.billing_mode === 'fixed'
  ? translateUi('uiMessages.md576682f3b27', { value1: (formatPoints(config.value.points_cost)) })
  : translateUi('uiMessages.m0448c37922e4', { value1: (formatPoints(config.value.points_per_second)) }))
onMounted(async () => {
  await nextTick(); dialog.value?.focus()
  try {
    config.value = await getVideoAnalysisConfig(); model.value = config.value.default_model
    if (!config.value.enabled || !config.value.models?.length) throw new Error(translateUi('uiMessages.me64e2c242d1a'))
  } catch (e) { error.value = e.message || translateUi('uiMessages.mb91496e63aef') }
  finally { loading.value = false }
})
function onKeydown(event) {
  if (event.key === 'Escape') emit('close')
  if (event.key !== 'Tab') return
  const targets = [...dialog.value.querySelectorAll('button:not(:disabled),select:not(:disabled)')]
  const first = targets[0], last = targets.at(-1)
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
</script>
<template>
  <Teleport to="body">
    <div class="analysis-overlay" @mousedown.self="emit('close')">
      <section ref="dialog" class="analysis-dialog" role="dialog" aria-modal="true" aria-labelledby="video-analysis-title" tabindex="-1" @keydown="onKeydown" @mousedown.stop @wheel.stop>
        <header><h3 id="video-analysis-title">{{ translateUi('uiMessages.mc3d51f9bfa05') }}</h3><button type="button" :aria-label="translateUi('uiMessages.m8882758b4d38')" @click="emit('close')">×</button></header>
        <p v-if="loading" role="status">{{ translateUi('uiMessages.m8f34a208b762') }}</p>
        <p v-else-if="error" role="alert">{{ error }}</p>
        <template v-else>
          <label for="video-analysis-model">{{ translateUi('uiMessages.m66976c1516cc') }}</label>
          <select id="video-analysis-model" v-model="model"><option v-for="item in config.models" :key="item.id" :value="item.id">{{ item.name }}</option></select>
          <p>{{ price }}</p><p class="analysis-note">{{ translateUi('uiMessages.m63f40d9c5c21') }}</p>
        </template>
        <footer><button type="button" @click="emit('close')">{{ translateUi('common.cancel') }}</button><button type="button" class="analysis-submit" :disabled="loading || !!error || !model" @click="emit('confirm', model)">{{ translateUi('uiMessages.m56ee8423df95') }}</button></footer>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.analysis-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.45); display: grid; place-items: center; padding: 16px; }
.analysis-dialog { width: min(440px,100%); padding: 22px; border-radius: 16px; background: var(--canvas-bg-secondary,#202020); color: var(--canvas-text-primary,#fff); border: 1px solid var(--canvas-border-color,#444); box-shadow: 0 12px 40px rgba(0,0,0,.2); outline: none; }
header,footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h3 { font-size: 16px; font-weight: 600; margin: 0; }
label { display: block; margin-top: 22px; font-size: 13px; }
select { width: 100%; margin-top: 8px; padding: 9px; border-radius: 8px; color: inherit; background: var(--canvas-bg-primary,#171717); border: 1px solid var(--canvas-border-color,#444); }
p { font-size: 13px; line-height: 1.6; margin-top: 14px; }
.analysis-note { color: var(--canvas-text-secondary,#aaa); }
footer { justify-content: flex-end; margin-top: 22px; }
button { padding: 8px 12px; border-radius: 8px; color: inherit; background: var(--canvas-bg-primary,#171717); }
header button { font-size: 20px; line-height: 1; }
.analysis-submit { background: #3b82f6; color: #fff; }
button:disabled { opacity: .5; cursor: not-allowed; }
button:focus-visible,select:focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
.canvas-theme-light .analysis-dialog { background: #fff; color: #171717; border-color: #ddd; }
.canvas-theme-light .analysis-dialog select,.canvas-theme-light .analysis-dialog button:not(.analysis-submit) { background: #f4f4f4; border-color: #ddd; }
.canvas-theme-light .analysis-note { color: #666; }
</style>
