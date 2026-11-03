<template>
  <Teleport to="body">
    <div ref="host" />
    <div v-if="loading || status !== 'saved' || error" class="editor-save-status" role="status">
      {{ error || (loading ? '正在加载剪辑…' : '正在保存剪辑…') }}
      <button v-if="error && !loadFailed" type="button" @click="retrySave">重试保存</button>
      <button v-if="loadFailed" type="button" @click="close">关闭剪辑</button>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useCanvasStore } from '@/stores/canvas/canvasStore'
import { postWorkflowOps, uploadCanvasMedia } from '@/api/canvas/workflow'
import { getMediaUrl } from '@/config/tenant'
import { createVideoEditDraftWriter } from '@/utils/videoEditDraftWriter'
import { createBananaEditorApi, createBananaEditorLibrary } from './editor/banana-adapter'
import { bindEditorStorage } from './editor/storage'
import './editor/theme.css'

const props = defineProps({ nodeId: String, initialSource: Object, loadDraft: Function, saveDraft: Function })
const emit = defineEmits(['close'])
const host = ref(null)
const loading = ref(true)
const loadFailed = ref(false)
const status = ref('saved')
const error = ref('')
const store = useCanvasStore()
let dispose, unbind, activeTab
let disposed = false
const writer = createVideoEditDraftWriter(value => props.saveDraft(value), (state, failure) => {
  status.value = state
  error.value = failure?.message || ''
})

async function retrySave() {
  try { await writer.retry() } catch (failure) { error.value = failure.message }
}

async function close() {
  try { await writer.flush(); emit('close') } catch (failure) { error.value = `${failure.message}；保存成功后才能关闭` }
}

async function createResult(request) {
  if (store.getCurrentTab()?.id !== activeTab.id) throw new Error('画布已切换，请重新打开剪辑')
  const source = store.nodes.find(node => node.id === props.nodeId)
  if (!source) throw new Error('源节点不存在')
  const uploaded = await uploadCanvasMedia(request.file, request.modality)
  if (disposed || store.getCurrentTab()?.id !== activeTab.id) throw new Error('画布已切换，请重新打开剪辑')
  const url = uploaded.url || uploaded.data?.url
  if (!url) throw new Error('结果上传失败')
  const id = `video_edit_${crypto.randomUUID()}`
  const node = {
    id, type: request.modality, position: { x: source.position.x + (Number(source.data?.width) || 420) + 120, y: source.position.y + request.offset.y },
    data: { label: request.name, title: request.name, status: 'success', sourceNodeId: props.nodeId, output: { type: request.modality, url } }
  }
  await postWorkflowOps(activeTab.workflowId, [{ op: 'add', target: 'node', payload: node }])
  if (store.getCurrentTab()?.id === activeTab.id) {
    store.addNode(node)
    store.applyWorkflowSaveVersions({ id: activeTab.workflowId, node_versions: { ...store.getCurrentTab().savedNodeVersions, [id]: 1 } })
  }
  window.dispatchEvent(new CustomEvent('canvas-history-invalidate', { detail: { type: request.modality, phase: 'tool-completed', nodeId: id } }))
  return { ok: true }
}

onMounted(async () => {
  const tabId = store.getCurrentTab()?.id
  try {
    const saved = await props.loadDraft()
    if (disposed) return
    if (store.getCurrentTab()?.id !== tabId) throw new Error('画布已切换，请重新打开剪辑')
    activeTab = { ...store.getCurrentTab() }
    if (!activeTab.workflowId) throw new Error('当前画布尚未保存，请重新打开剪辑')
    const resource = props.initialSource.url
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${activeTab.workflowId}:${props.nodeId}`))
    if (disposed) return
    if (store.getCurrentTab()?.id !== tabId) throw new Error('画布已切换，请重新打开剪辑')
    const identity = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
    const project = activeTab.workflowId
    const draftKey = `media-video-draft:${project}:${resource}:identity:${identity}`
    const storage = saved?.editorStorage || {}
    if (!storage[draftKey] && saved?.clips?.length) {
      storage[draftKey] = JSON.stringify({ clips: saved.clips.map(clip => ({ resource_uuid: clip.url, start: clip.startTime, end: clip.endTime, rate: clip.playbackRate || 1, volume_db: clip.volumeDb || 0 })) })
    }
    unbind = bindEditorStorage(storage, values => writer.save({ version: 2, sourceUrl: resource, editorStorage: values }), writer.flush)
    const sources = { video: [], audio: [], image: [] }
    for (const node of store.nodes) {
      const kind = node.type
      const output = node.data?.output
      const url = output?.url || (typeof output === 'string' ? output : '')
      if (sources[kind] && url) sources[kind].push({ resource: url, name: node.data?.title || node.data?.label || kind })
    }
    const api = createBananaEditorApi()
    const [config, { mountVideoEditor }] = await Promise.all([api.config(), import('./editor/mount')])
    if (disposed) return
    if (store.getCurrentTab()?.id !== tabId) throw new Error('画布已切换，请重新打开剪辑')
    dispose = mountVideoEditor(host.value, {
      api, project, clipboardNamespace: identity, preferenceNamespace: `media-canvas-preferences:v1:${identity}`,
      sources: sources.video, audioSources: sources.audio, imageSources: sources.image,
      config, readOnly: false, library: createBananaEditorLibrary()
    }, { resource, sourceUrl: getMediaUrl(resource), onClose: close, onCreate: createResult })
    loading.value = false
  } catch (failure) {
    if (disposed) return
    unbind?.(); unbind = undefined
    error.value = failure.message; loadFailed.value = true; loading.value = false
  }
})

onBeforeUnmount(() => { disposed = true; dispose?.(); unbind?.() })
</script>

<style scoped>
.editor-save-status { position: fixed; bottom: 8px; right: 16px; z-index: 1900; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--canvas-border, #3f3f46); background: var(--canvas-bg, #18181b); color: var(--canvas-text, #d4d4d8); font-size: 12px; }
.editor-save-status button { margin-left: 12px; text-decoration: underline; }
</style>
