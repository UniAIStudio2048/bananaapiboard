<template>
  <Teleport to="body">
    <div ref="host" />
    <div v-if="loading || status !== 'saved' || error" class="editor-save-status" role="status">
      {{ error || (loading ? translateUi('uiMessages.m9eec72624e59') : translateUi('uiMessages.m06daacb46018')) }}
      <button v-if="error && !loadFailed" type="button" @click="retrySave">{{ translateUi('uiMessages.m917e75040547') }}</button>
      <button v-if="loadFailed" type="button" @click="close">{{ translateUi('uiMessages.m02a3bc31b217') }}</button>
    </div>
  </Teleport>
</template>

<script setup>
import { t as translateUi } from '@/i18n'

import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useCanvasStore } from '@/stores/canvas/canvasStore'
import { postWorkflowOps, uploadCanvasMedia } from '@/api/canvas/workflow'
import { getMediaUrl } from '@/config/tenant'
import { createVideoEditDraftWriter } from '@/utils/videoEditDraftWriter'
import { createBananaEditorApi, createBananaEditorLibrary } from './editor/banana-adapter'
import { bindAccountEditorStorage } from './editor/storage'
import './editor/theme.css'

const props = defineProps({ nodeId: String, initialSource: Object, loadDraft: Function, saveDraft: Function })
const emit = defineEmits(['close'])
const host = ref(null)
const loading = ref(true)
const loadFailed = ref(false)
const status = ref('saved')
const error = ref('')
const store = useCanvasStore()
let dispose, unbind, activeTab, api
let disposed = false
const writer = createVideoEditDraftWriter(value => value.editorPreferences ? api.savePreferences(value.editorPreferences) : props.saveDraft(value), (state, failure) => {
  status.value = state
  error.value = failure?.message || ''
})

async function retrySave() {
  try { await writer.retry() } catch (failure) { error.value = failure.message }
}

async function close() {
  try { await writer.flush(); emit('close') } catch (failure) { error.value = translateUi('uiMessages.m4d6f2f4eeeba', { value1: (failure.message) }) }
}

async function createResult(request) {
  if (store.getCurrentTab()?.id !== activeTab.id) throw new Error(translateUi('uiMessages.m8d896f9bb12f'))
  const source = store.nodes.find(node => node.id === props.nodeId)
  if (!source) throw new Error(translateUi('uiMessages.me46fe3c110bb'))
  const uploaded = await uploadCanvasMedia(request.file, request.modality)
  if (disposed || store.getCurrentTab()?.id !== activeTab.id) throw new Error(translateUi('uiMessages.m8d896f9bb12f'))
  const url = uploaded.url || uploaded.data?.url
  if (!url) throw new Error(translateUi('uiMessages.m38f195f4cf18'))
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
    api = createBananaEditorApi()
    const [saved, preferences] = await Promise.all([props.loadDraft(), api.preferences()])
    if (disposed) return
    if (store.getCurrentTab()?.id !== tabId) throw new Error(translateUi('uiMessages.m8d896f9bb12f'))
    activeTab = { ...store.getCurrentTab() }
    if (!activeTab.workflowId) throw new Error(translateUi('uiMessages.m4ea74629cc27'))
    const resource = props.initialSource.url
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${activeTab.workflowId}:${props.nodeId}`))
    if (disposed) return
    if (store.getCurrentTab()?.id !== tabId) throw new Error(translateUi('uiMessages.m8d896f9bb12f'))
    const identity = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('')
    const project = activeTab.workflowId
    const previousKey = `media-video-draft:${project}:${resource}:identity:${identity}`
    const draftKey = `media-video-draft:${project}:${resource}:identity:${preferences.namespace}`
    const storage = { ...saved?.editorStorage }
    let migrated = false
    for (const key of Object.keys(storage)) {
      if (key !== previousKey && !key.startsWith(`${previousKey}:`)) continue
      const nextKey = `${draftKey}${key.slice(previousKey.length)}`
      if (!(nextKey in storage)) storage[nextKey] = storage[key]
      if (key !== nextKey) { delete storage[key]; migrated = true }
    }
    if (!storage[draftKey] && saved?.clips?.length) {
      storage[draftKey] = JSON.stringify({ clips: saved.clips.map(clip => ({ resource_uuid: clip.url, start: clip.startTime, end: clip.endTime, rate: clip.playbackRate || 1, volume_db: clip.volumeDb || 0 })) })
    }
    if (migrated) writer.save({ version: 2, sourceUrl: resource, editorStorage: storage })
    unbind = bindAccountEditorStorage(storage, preferences, values => writer.save({ version: 2, sourceUrl: resource, editorStorage: values }), values => writer.save({ editorPreferences: values }), writer.flush)
    const sources = { video: [], audio: [], image: [] }
    for (const node of store.nodes) {
      const kind = node.type
      const output = node.data?.output
      const url = output?.url || (typeof output === 'string' ? output : '')
      if (sources[kind] && url) sources[kind].push({ resource: url, name: node.data?.title || node.data?.label || kind })
    }
    const [config, { mountVideoEditor }] = await Promise.all([api.config(), import('./editor/mount')])
    if (disposed) return
    if (store.getCurrentTab()?.id !== tabId) throw new Error(translateUi('uiMessages.m8d896f9bb12f'))
    dispose = mountVideoEditor(host.value, {
      api, project, clipboardNamespace: preferences.namespace, preferenceNamespace: `media-canvas-preferences:v1:${preferences.namespace}`,
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
.editor-save-status { position: fixed; bottom: 8px; right: 16px; z-index: 10400; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--canvas-border, #3f3f46); background: var(--canvas-bg, #18181b); color: var(--canvas-text, #d4d4d8); font-size: 12px; }
.editor-save-status button { margin-left: 12px; text-decoration: underline; }
</style>
