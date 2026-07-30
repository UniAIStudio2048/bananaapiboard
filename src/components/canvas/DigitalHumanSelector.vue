<script setup>
import { computed, ref, watch } from 'vue'
import { getAssets } from '@/api/canvas/assets'

const props = defineProps({
  visible: Boolean,
  currentAssetId: String
})

const emit = defineEmits(['update:visible', 'select'])
const loading = ref(false)
const assets = ref([])
const selectedAsset = ref(null)

function metadata(asset) {
  if (typeof asset?.metadata === 'string') {
    try { return JSON.parse(asset.metadata) } catch { return {} }
  }
  return asset?.metadata || {}
}

const completedHumans = computed(() => assets.value.filter(asset => metadata(asset).status === 'completed'))

function previewUrl(asset) {
  return metadata(asset).previewUrl || asset?.thumbnail_url || asset?.url || ''
}

async function loadAssets() {
  loading.value = true
  try {
    const result = await getAssets({
      type: 'digital-human',
      spaceType: 'all',
      pageSize: 500
    })
    assets.value = result.assets || []
  } catch (error) {
    console.error('[DigitalHumanSelector] 加载数字人失败:', error)
    assets.value = []
  } finally {
    loading.value = false
  }
}

function selectAsset(asset) {
  selectedAsset.value = asset
}

function confirm() {
  if (!selectedAsset.value) return
  emit('select', selectedAsset.value)
  emit('update:visible', false)
}

function close() {
  emit('update:visible', false)
}

watch(() => props.visible, visible => {
  if (!visible) return
  selectedAsset.value = null
  loadAssets()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="digital-human-selector-overlay" @click.self="close">
      <section class="digital-human-selector" role="dialog" aria-modal="true" aria-label="选择 HeyGen 数字人">
        <header class="digital-human-selector-header">
          <div>
            <h3>选择 HeyGen 数字人</h3>
            <p>仅显示训练完成的数字人</p>
          </div>
          <button type="button" class="digital-human-selector-close" aria-label="关闭" @click="close">✕</button>
        </header>

        <div v-if="loading" class="digital-human-selector-empty">加载中…</div>
        <div v-else-if="completedHumans.length === 0" class="digital-human-selector-empty">暂无可用数字人</div>
        <div v-else class="digital-human-selector-grid">
          <button
            v-for="asset in completedHumans"
            :key="asset.id"
            type="button"
            class="digital-human-selector-card"
            :class="{
              selected: selectedAsset?.id === asset.id,
              current: currentAssetId === asset.id
            }"
            @click="selectAsset(asset)"
          >
            <img v-if="previewUrl(asset)" :src="previewUrl(asset)" :alt="asset.name" />
            <span v-else class="digital-human-selector-placeholder">🧑</span>
            <span class="digital-human-selector-name">{{ asset.name || '未命名数字人' }}</span>
            <small>{{ metadata(asset).kind === 'digital_twin' ? 'Digital Twin' : 'Photo Avatar' }}</small>
          </button>
        </div>

        <footer class="digital-human-selector-footer">
          <button type="button" class="digital-human-selector-cancel" @click="close">取消</button>
          <button type="button" class="digital-human-selector-confirm" :disabled="!selectedAsset" @click="confirm">选择角色</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.digital-human-selector-overlay { position: fixed; inset: 0; z-index: 10001; display: grid; place-items: center; padding: 24px; background: rgba(2, 6, 23, .7); }
.digital-human-selector { width: min(680px, 100%); max-height: min(680px, calc(100vh - 48px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto; overflow: hidden; border: 1px solid rgba(148, 163, 184, .28); border-radius: 12px; background: #111827; color: #e5e7eb; box-shadow: 0 24px 64px rgba(0, 0, 0, .38); }
.digital-human-selector-header { display: flex; align-items: start; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid rgba(148, 163, 184, .16); }
.digital-human-selector-header h3 { margin: 0; font-size: 16px; }.digital-human-selector-header p { margin: 4px 0 0; color: #94a3b8; font-size: 12px; }
.digital-human-selector-close, .digital-human-selector-cancel, .digital-human-selector-confirm { border: 0; border-radius: 7px; padding: 8px 12px; font: inherit; font-size: 12px; cursor: pointer; }
.digital-human-selector-close { padding: 4px 7px; background: transparent; color: #94a3b8; font-size: 16px; }.digital-human-selector-close:hover { background: rgba(148, 163, 184, .14); color: #e5e7eb; }
.digital-human-selector-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; overflow: auto; padding: 18px 20px; }
.digital-human-selector-card { display: grid; gap: 6px; min-width: 0; padding: 8px; border: 1px solid rgba(148, 163, 184, .2); border-radius: 9px; background: rgba(15, 23, 42, .5); color: inherit; text-align: left; cursor: pointer; }.digital-human-selector-card:hover { border-color: rgba(125, 211, 252, .68); }.digital-human-selector-card.selected { border-color: #38bdf8; box-shadow: 0 0 0 2px rgba(56, 189, 248, .18); }.digital-human-selector-card.current { border-style: dashed; }
.digital-human-selector-card img, .digital-human-selector-placeholder { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px; background: #1e293b; }.digital-human-selector-placeholder { display: grid; place-items: center; font-size: 30px; }
.digital-human-selector-name { overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }.digital-human-selector-card small { overflow: hidden; color: #94a3b8; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.digital-human-selector-empty { display: grid; min-height: 180px; place-items: center; padding: 20px; color: #94a3b8; font-size: 13px; }.digital-human-selector-footer { display: flex; justify-content: end; gap: 8px; padding: 14px 20px; border-top: 1px solid rgba(148, 163, 184, .16); }.digital-human-selector-cancel { background: rgba(148, 163, 184, .14); color: #cbd5e1; }.digital-human-selector-confirm { background: linear-gradient(135deg, #0ea5e9, #2563eb); color: #fff; }.digital-human-selector-confirm:disabled { cursor: not-allowed; opacity: .45; }
</style>
