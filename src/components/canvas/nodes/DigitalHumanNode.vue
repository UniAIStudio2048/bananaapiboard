<script setup>
import { ref } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import DigitalHumanSelector from '../DigitalHumanSelector.vue'

const props = defineProps({
  id: String,
  data: { type: Object, default: () => ({}) },
  selected: Boolean
})

const canvasStore = useCanvasStore()
const showSelector = ref(false)

function openSelector() {
  showSelector.value = true
}

function handleSelect(asset) {
  if (!asset?.id) return
  const assetMetadata = typeof asset?.metadata === 'string'
    ? (() => { try { return JSON.parse(asset.metadata) } catch { return {} } })()
    : (asset?.metadata || {})
  const nextPreviewUrl = assetMetadata.previewUrl || asset?.thumbnail_url || asset?.url || ''
  const node = canvasStore.nodes.find(item => item.id === props.id)
  if (!node) return

  node.type = 'image-input'
  canvasStore.edges
    .filter(edge => edge.source === props.id && edge.sourceHandle === 'digital-human')
    .forEach(edge => { edge.sourceHandle = 'output' })

  canvasStore.updateNodeData(props.id, {
    title: `${asset.name || '数字人'}形象图`,
    label: asset.name || '图片',
    sourceImages: [nextPreviewUrl],
    nodeRole: 'source',
    assetId: asset.id,
    metadata: {
      ...assetMetadata,
      digitalHumanAssetId: asset.id
    },
    digitalHumanAssetId: asset.id,
    digitalHumanChannelId: assetMetadata.channelId || '',
    assetType: 'digital-human',
    thumbnailUrl: nextPreviewUrl,
    fromAsset: true
  })
}
</script>

<template>
  <div class="digital-human-node" :class="{ selected }" @dblclick.stop="openSelector">
    <div class="digital-human-label">HeyGen 数字人</div>
    <div class="digital-human-card">
      <div class="digital-human-empty" @click="openSelector">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5" />
          <path d="M5 20C5 16.134 8.134 13 12 13C15.866 13 19 16.134 19 20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
        <span class="digital-human-empty-text">点击选择角色</span>
      </div>
    </div>
    <DigitalHumanSelector
      v-model:visible="showSelector"
      :current-asset-id="data?.assetId"
      @select="handleSelect"
    />
  </div>
</template>

<style scoped>
.digital-human-node { position: relative; contain: layout style; }
.digital-human-label { color: var(--canvas-text-secondary, #a0a0a0); font-size: 13px; font-weight: 500; margin-bottom: 8px; padding: 4px 8px; text-align: center; user-select: none; }
.digital-human-card { width: 220px; overflow: hidden; background: var(--canvas-bg-tertiary, #1a1a1a); border: 1px solid var(--canvas-border-subtle, #2a2a2a); border-radius: 12px; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
.digital-human-node:hover .digital-human-card { border-color: var(--canvas-border-active, #4a4a4a); }
.digital-human-node.selected .digital-human-card { border-color: var(--canvas-accent-primary, #3b82f6); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2), 0 4px 20px rgba(0, 0, 0, 0.3); }
.digital-human-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 120px; gap: 10px; padding: 32px 16px; color: var(--canvas-text-tertiary); cursor: pointer; transition: color 0.2s; }
.digital-human-empty:hover { color: var(--canvas-text-secondary); }
.digital-human-empty-text { font-size: 13px; }

:root.canvas-theme-light .digital-human-node .digital-human-card { background: var(--canvas-bg-tertiary, #ffffff); border-color: var(--canvas-border-subtle, #e5e7eb); }
</style>
