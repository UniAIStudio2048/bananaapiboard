<script setup>
import { computed, inject, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { Camera, Maximize2 } from '@lucide/vue'
import { useI18n } from '@/i18n'
import { useCanvasStore } from '@/stores/canvas'
import DirectorStudioShell from '@/components/canvas/director/DirectorStudioShell.vue'
import { appendDirectorSnapshotHistory } from '@/utils/directorStudioState.js'
import { persistDirectorStudioImageSource, isDirectorDataImageUrl } from '@/utils/directorStudioMedia.js'
import { buildDirectorStudioPrompt } from '@/utils/directorStudioPrompt.js'
import {
  resolveDirectorAspectRatio,
  resolveDirectorAiRequestAspectRatio
} from '@/utils/directorStudioSceneExport.js'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false }
})

const readonlyPreview = inject('canvasReadonlyPreview', false)
const canvasStore = useCanvasStore()
const { t } = useI18n()

const directorStudioOpen = ref(false)
const selectedItemId = ref(null)
const addingSnapshotToCanvas = ref(false)

const openLabel = computed(() => translateWithFallback('directorStudio.nodeCard.enter', '打开导演台'))
const snapshotLabel = computed(() => translateWithFallback('directorStudio.addToCanvas', '截图到画布'))
const title = computed(() => props.data.title || translateWithFallback('directorStudio.title', '3D导演台'))
const elementsLabel = computed(() => translateWithFallback('directorStudio.elements', '元素'))
const referencesLabel = computed(() => translateWithFallback('node.imageNode.refImage', '参考'))
const projectsLabel = computed(() => translateWithFallback('directorStudio.projects', '项目'))
const items = computed(() => Array.isArray(props.data.items) ? props.data.items : [])
const canvasImageAssets = computed(() => readonlyPreview ? [] : collectDirectorStudioCanvasImageAssets(canvasStore.nodes))
const imageAssets = computed(() => mergeDirectorStudioAssetLists([
  props.data.imageAssets,
  canvasImageAssets.value
]))
const panoramaAssets = computed(() => mergeDirectorStudioAssetLists([
  props.data.panoramaAssets,
  canvasImageAssets.value
]))
const referenceImages = computed(() => {
  if (readonlyPreview) {
    return mergeDirectorStudioReferenceImages(props.id, props.data, [], [])
  }
  return mergeDirectorStudioReferenceImages(props.id, props.data, canvasStore.nodes, canvasStore.edges)
})
const projects = computed(() => Array.isArray(props.data.directorStudioProjects) ? props.data.directorStudioProjects : [])
const snapshotUrl = computed(() => props.data.snapshotUrl || null)

function translateWithFallback(key, fallback) {
  const value = t(key)
  return value === key ? fallback : value
}

function openDirectorStudio(event) {
  event?.stopPropagation()
  if (readonlyPreview) return
  directorStudioOpen.value = true
}

function closeDirectorStudio() {
  directorStudioOpen.value = false
}

function handleDirectorItemsChange(nextItems) {
  if (readonlyPreview) return
  canvasStore.updateNodeData(props.id, { items: nextItems })
}

function handleDirectorNodeDataChange(patch) {
  if (readonlyPreview || !patch || typeof patch !== 'object' || Array.isArray(patch)) return
  canvasStore.updateNodeData(props.id, patch)
}

async function handleAddSnapshotToCanvas(payloadOrEvent) {
  const isEvent = payloadOrEvent && typeof payloadOrEvent.stopPropagation === 'function'
  if (isEvent) payloadOrEvent.stopPropagation()
  if (addingSnapshotToCanvas.value) return
  const payloadUrl = typeof payloadOrEvent === 'string'
    ? payloadOrEvent
    : !isEvent && typeof payloadOrEvent?.snapshotUrl === 'string'
      ? payloadOrEvent.snapshotUrl
      : null
  const nextSnapshotUrl = payloadUrl || snapshotUrl.value
  if (!nextSnapshotUrl || readonlyPreview) return

  addingSnapshotToCanvas.value = true
  try {
    const persistentSnapshotUrl = await persistDirectorStudioImageSource(nextSnapshotUrl)
    if (!persistentSnapshotUrl) return

    const currentNode = canvasStore.nodes.find(node => node.id === props.id)
    const currentPosition = currentNode?.position || { x: 0, y: 0 }
    const sourceNodeId = `node_${Date.now()}_source_${Math.random().toString(36).slice(2, 11)}`
    const generationNodeId = `node_${Date.now()}_generation_${Math.random().toString(36).slice(2, 11)}`
    const aspectRatio = resolveDirectorAspectRatio(props.data)
    const aiAspectRatio = resolveDirectorAiRequestAspectRatio(props.data)
    const prompt = buildDirectorStudioPrompt({
      ...props.data,
      mode: props.data.mode,
      backgroundImageUrl: props.data.backgroundImageUrl || props.data.backgroundPanoramaUrl || null,
      items: items.value,
      referenceImages: referenceImages.value,
      basePrompt: props.data.basePrompt || '',
      referenceTokenStartIndex: 2,
      referenceTokenPrefix: '图'
    })
    const generationReferenceImages = [
      persistentSnapshotUrl,
      ...referenceImages.value.map(item => item?.url).filter(url => url && url !== persistentSnapshotUrl)
    ]
    const savedTriggerNodeId = canvasStore.triggerNodeId

    try {
      canvasStore.triggerNodeId = null
      canvasStore.addNode({
        id: sourceNodeId,
        type: 'image-input',
        position: {
          x: currentPosition.x + 500,
          y: currentPosition.y
        },
        data: {
          title: '导演台截图',
          nodeRole: 'source',
          sourceImages: generationReferenceImages,
          imageUrl: persistentSnapshotUrl,
          aspectRatio,
          status: 'success'
        }
      })
      canvasStore.addNode({
        id: generationNodeId,
        type: 'image-to-image',
        position: {
          x: currentPosition.x + 960,
          y: currentPosition.y
        },
        data: {
          title: '导演台生成',
          prompt,
          userPrompt: prompt,
          referenceImages: generationReferenceImages,
          sourceImages: generationReferenceImages,
          aspectRatio: aiAspectRatio,
          aspectRatioMode: aspectRatio,
          requestAspectRatio: aiAspectRatio,
          status: 'idle'
        }
      })
    } finally {
      canvasStore.triggerNodeId = savedTriggerNodeId
    }

    canvasStore.addEdge({
      source: sourceNodeId,
      sourceHandle: 'output',
      target: generationNodeId,
      targetHandle: 'input'
    })
    canvasStore.selectNode(generationNodeId)

    if (isDirectorDataImageUrl(nextSnapshotUrl) && persistentSnapshotUrl !== nextSnapshotUrl) {
      canvasStore.updateNodeData(props.id, {
        snapshotUrl: persistentSnapshotUrl,
        snapshotHistory: appendDirectorSnapshotHistory(props.data.snapshotHistory, persistentSnapshotUrl),
        sourceImages: [persistentSnapshotUrl],
        output: { url: persistentSnapshotUrl, urls: [persistentSnapshotUrl] },
        status: 'success'
      })
    }

    directorStudioOpen.value = false
  } catch (error) {
    canvasStore.updateNodeData(props.id, {
      status: 'error',
      errorMessage: error?.message || '导演台截图添加失败'
    })
  } finally {
    addingSnapshotToCanvas.value = false
  }
}

function mergeDirectorStudioReferenceImages(nodeId, data, nodes, edges) {
  const merged = []
  const seen = new Set()

  function add(url, label = '参考图', color = '#60a5fa', id = null) {
    const normalizedUrl = typeof url === 'string' ? url.trim() : ''
    if (!normalizedUrl || seen.has(normalizedUrl)) return
    seen.add(normalizedUrl)
    merged.push({
      id: id || `ref-${merged.length + 1}`,
      url: normalizedUrl,
      label,
      color
    })
  }

  const nodeById = new Map(
    (Array.isArray(nodes) ? nodes : [])
      .filter(node => node && typeof node === 'object' && typeof node.id === 'string' && node.id.trim())
      .map(node => [node.id, node])
  )
  ;(Array.isArray(edges) ? edges : [])
    .filter(edge => {
      if (!edge || typeof edge !== 'object') return false
      const source = typeof edge.source === 'string' ? edge.source.trim() : ''
      const target = typeof edge.target === 'string' ? edge.target.trim() : ''
      return source && target && target === nodeId
    })
    .forEach(edge => {
      const source = nodeById.get(edge.source)
      const sourceData = source?.data || {}
      const label = sourceData.title || sourceData.label || '上游参考'

      if (Array.isArray(sourceData.sourceImages)) {
        sourceData.sourceImages.forEach(url => add(url, label, '#38bdf8', `edge-${edge.id || edge.source}-${url}`))
      }
      if (Array.isArray(sourceData.output?.urls)) {
        sourceData.output.urls.forEach(url => add(url, label, '#a78bfa', `edge-${edge.id || edge.source}-${url}`))
      }
      add(sourceData.output?.url, label, '#a78bfa', `edge-${edge.id || edge.source}-output`)
      add(sourceData.imageUrl, label, '#f59e0b', `edge-${edge.id || edge.source}-image`)
    })

  if (Array.isArray(data?.referenceImages)) {
    data.referenceImages.forEach((entry, index) => {
      if (typeof entry === 'string') {
        add(entry, '参考图', '#22c55e', `reference-${index}`)
      } else if (entry && typeof entry === 'object') {
        add(entry?.url, entry?.label || '参考图', entry?.color || '#22c55e', entry?.id || `reference-${index}`)
      }
    })
  }

  if (Array.isArray(data?.items)) {
    data.items.forEach((item, index) => {
      if (!item || typeof item !== 'object') return
      add(item.refImageUrl, item.title || item.name || `镜头 ${index + 1}`, item.color || '#fb7185', item.id || `item-${index}`)
    })
  }

  return merged
}

function mergeDirectorStudioAssetLists(lists) {
  const merged = []
  const seen = new Set()

  ;(Array.isArray(lists) ? lists : []).forEach(list => {
    ;(Array.isArray(list) ? list : []).forEach((entry, index) => {
      const source = entry && typeof entry === 'object' ? entry : { url: entry }
      const url = typeof source.url === 'string' && source.url.trim()
        ? source.url.trim()
        : typeof source.imageUrl === 'string' && source.imageUrl.trim()
          ? source.imageUrl.trim()
          : ''
      if (!url || seen.has(url)) return
      seen.add(url)
      merged.push({
        id: source.id || `asset-${merged.length + 1}-${index}`,
        url,
        label: source.label || source.title || source.name || `图片 ${merged.length + 1}`,
        color: source.color || '#38bdf8'
      })
    })
  })

  return merged
}

function collectDirectorStudioCanvasImageAssets(nodes) {
  const imageNodeTypes = new Set(['image', 'image-input', 'image-gen', 'text-to-image', 'image-to-image', 'grid-preview'])
  const assets = []
  const seen = new Set()

  function add(url, label, id, color = '#38bdf8') {
    const normalizedUrl = typeof url === 'string' ? url.trim() : ''
    if (!normalizedUrl || seen.has(normalizedUrl)) return
    seen.add(normalizedUrl)
    assets.push({
      id: id || `canvas-image-${assets.length + 1}`,
      url: normalizedUrl,
      label: label || `画布图片 ${assets.length + 1}`,
      color
    })
  }

  ;(Array.isArray(nodes) ? nodes : []).forEach((node, index) => {
    if (!node || !imageNodeTypes.has(node.type)) return
    const data = node.data || {}
    const label = data.title || data.label || `画布图片 ${index + 1}`

    if (Array.isArray(data.sourceImages)) {
      data.sourceImages.forEach((url, urlIndex) => add(url, label, `${node.id}-source-${urlIndex}`, '#38bdf8'))
    }
    if (Array.isArray(data.output?.urls)) {
      data.output.urls.forEach((url, urlIndex) => add(url, label, `${node.id}-output-${urlIndex}`, '#a78bfa'))
    }
    add(data.output?.url, label, `${node.id}-output`, '#a78bfa')
    add(data.imageUrl, label, `${node.id}-image`, '#f59e0b')
    add(data.thumbnailUrl, label, `${node.id}-thumb`, '#22c55e')
  })

  return assets
}
</script>

<template>
  <div
    class="director-studio-node"
    :class="{ selected }"
    @dblclick.stop="openDirectorStudio"
  >
    <Handle
      type="target"
      :position="Position.Left"
      id="input"
      class="director-handle director-handle-input"
    />
    <Handle
      type="source"
      :position="Position.Right"
      id="output"
      class="director-handle director-handle-output"
    />

    <div class="director-header">
      <div class="director-title-block">
        <span class="director-kicker">Director Studio</span>
        <h3>{{ title }}</h3>
      </div>
      <span class="director-status">{{ props.data.status || 'idle' }}</span>
    </div>

    <button
      type="button"
      class="director-preview nodrag nopan"
      @click.stop="openDirectorStudio"
      :disabled="readonlyPreview"
    >
      <img v-if="snapshotUrl" :src="snapshotUrl" alt="" class="director-preview-image">
      <span v-else class="director-preview-empty">
        <Maximize2 :size="22" stroke-width="1.8" />
        {{ openLabel }}
      </span>
    </button>

    <div class="director-counters">
      <div>
        <strong>{{ items.length }}</strong>
        <span>{{ elementsLabel }}</span>
      </div>
      <div>
        <strong>{{ referenceImages.length }}</strong>
        <span>{{ referencesLabel }}</span>
      </div>
      <div>
        <strong>{{ projects.length }}</strong>
        <span>{{ projectsLabel }}</span>
      </div>
    </div>

    <div class="director-actions nodrag nopan">
      <button type="button" class="director-action primary nodrag nopan" @click.stop="openDirectorStudio">
        <Maximize2 :size="15" stroke-width="2" />
        <span>{{ openLabel }}</span>
      </button>
      <button
        type="button"
        class="director-action nodrag nopan"
        :disabled="!snapshotUrl || readonlyPreview || addingSnapshotToCanvas"
        @click.stop="handleAddSnapshotToCanvas"
      >
        <Camera :size="15" stroke-width="2" />
        <span>{{ snapshotLabel }}</span>
      </button>
    </div>

    <Teleport to="body">
      <DirectorStudioShell
        v-if="directorStudioOpen"
        :source-node-id="id"
        :data="props.data"
        :reference-images="referenceImages"
        :image-assets="imageAssets"
        :panorama-assets="panoramaAssets"
        :selected-item-id="selectedItemId"
        @update:selected-item-id="selectedItemId = $event"
        @items-change="handleDirectorItemsChange"
        @update-node-data="handleDirectorNodeDataChange"
        @add-snapshot-to-canvas="handleAddSnapshotToCanvas"
        @close="closeDirectorStudio"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.director-studio-node {
  position: relative;
  width: 440px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: #18181b;
  color: #f4f4f5;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  overflow: visible;
  cursor: grab;
  contain: layout style;
}

.director-studio-node.selected {
  border-color: rgba(96, 165, 250, 0.75);
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.28), 0 14px 36px rgba(0, 0, 0, 0.28);
}

.director-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px 12px;
}

.director-title-block {
  min-width: 0;
}

.director-kicker {
  display: block;
  margin-bottom: 4px;
  color: #a1a1aa;
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0;
  text-transform: uppercase;
}

.director-title-block h3 {
  margin: 0;
  color: #fafafa;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.director-status {
  flex: none;
  max-width: 112px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #d4d4d8;
  font-size: 11px;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.director-preview {
  display: block;
  width: calc(100% - 32px);
  height: 236px;
  margin: 0 16px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  background: #0f0f12;
  color: #d4d4d8;
  overflow: hidden;
  cursor: pointer;
}

.director-preview:disabled {
  cursor: default;
}

.director-preview-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.director-preview-empty {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #a1a1aa;
  font-size: 14px;
}

.director-counters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 12px 16px 0;
}

.director-counters div {
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
}

.director-counters strong {
  display: block;
  color: #f4f4f5;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.1;
}

.director-counters span {
  display: block;
  margin-top: 2px;
  color: #a1a1aa;
  font-size: 11px;
  line-height: 1.2;
}

.director-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px 16px;
}

.director-action {
  display: inline-flex;
  min-width: 0;
  height: 34px;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #e4e4e7;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.director-action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.director-action.primary {
  border-color: rgba(96, 165, 250, 0.32);
  background: rgba(59, 130, 246, 0.18);
  color: #dbeafe;
}

.director-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.director-handle {
  width: 14px;
  height: 14px;
  border: 2px solid #18181b;
  background: #60a5fa;
}

.director-handle-input {
  left: -7px;
}

.director-handle-output {
  right: -7px;
}

:root.canvas-theme-light .director-studio-node {
  border-color: rgba(24, 24, 27, 0.12);
  background: #ffffff;
  color: #18181b;
  box-shadow: 0 10px 30px rgba(24, 24, 27, 0.12);
}

:root.canvas-theme-light .director-title-block h3 {
  color: #18181b;
}

:root.canvas-theme-light .director-preview {
  border-color: rgba(24, 24, 27, 0.12);
  background: #f4f4f5;
}

:root.canvas-theme-light .director-status,
:root.canvas-theme-light .director-counters div,
:root.canvas-theme-light .director-action {
  background: rgba(24, 24, 27, 0.06);
  color: #3f3f46;
}
</style>
