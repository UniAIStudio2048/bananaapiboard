<script setup>
import { t as translateUi } from '@/i18n'

import { ref } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { uploadCanvasMedia, postWorkflowOps, patchWorkflowNode } from '@/api/canvas/workflow'
import { registerTask } from '@/stores/canvas/backgroundTaskManager'
import { showToast } from '@/composables/useCanvasDialog'
import { formatPoints } from '@/utils/format'

const props = defineProps({ nodeId: String, videoUrl: String, ensureWorkflow: Function })
const emit = defineEmits(['legacy'])
const canvasStore = useCanvasStore()
const config = ref(null)
const opened = ref(false)
const busy = ref(false)
const resolutions = ['720p', '1080p', '2k', '4k']
const headers = () => ({ ...getTenantHeaders(), 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` })
const priceLabel = resolution => translateUi('uiMessages.m3a7a27000ab2', { value1: (formatPoints(config.value.points_per_second[resolution])), value2: (formatPoints(config.value.points_per_second[resolution] * 10)) })

async function open() {
  if (busy.value) return
  if (opened.value) { opened.value = false; return }
  busy.value = true
  try {
    const response = await fetch(getApiUrl('/api/videos/upscale/config'), { headers: headers(), cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || translateUi('uiMessages.m7e9afbfb4bc5'))
    config.value = result
    if (result.enabled) opened.value = true
    else emit('legacy')
  } catch (error) { showToast(error.message || translateUi('uiMessages.m60d5d888a6da'), 'error') }
  finally { busy.value = false }
}

async function submit(resolution) {
  if (busy.value) return
  busy.value = true; opened.value = false
  let context, nodeId, taskId, submitted = false
  try {
    let videoUrl = props.videoUrl
    if (!videoUrl) throw new Error(translateUi('uiMessages.ma2cfc7387fcd'))
    if (/^(blob:|data:)/.test(videoUrl)) {
      const blob = await (await fetch(videoUrl)).blob()
      const uploaded = await uploadCanvasMedia(new File([blob], 'video.mp4', { type: blob.type || 'video/mp4' }), 'video')
      if (!uploaded.url) throw new Error(translateUi('uiMessages.m8bc76392a011'))
      videoUrl = uploaded.url
    }
    context = await props.ensureWorkflow(props.nodeId)
    const source = canvasStore.nodes.find(node => node.id === props.nodeId)
    const requestId = globalThis.crypto.randomUUID()
    nodeId = `upscale_node_${requestId}`
    taskId = `upscale_${requestId}`
    const node = { id: nodeId, type: 'video', position: { x: source.position.x + 500, y: source.position.y }, data: {
      label: translateUi('uiMessages.m3cb5cc87d0ba', { value1: (resolution.toUpperCase()) }), title: translateUi('uiMessages.m3cb5cc87d0ba', { value1: (resolution.toUpperCase()) }), status: 'processing', progress: translateUi('uiMessages.mfc53bbd666f5'),
      upscaleRequestId: requestId, taskId, taskType: 'video-hd', hdUpscaled: true, upscaleResolution: resolution,
      processingStartedAt: Date.now(), sourceNodeId: props.nodeId, sourceUrl: videoUrl, output: { type: 'video', url: '' }
    } }
    const edge = { id: `edge_${requestId}`, source: props.nodeId, target: nodeId, sourceHandle: 'output', targetHandle: 'input' }
    await postWorkflowOps(context.workflowId, [{ op: 'add', target: 'node', payload: node }, { op: 'add', target: 'edge', payload: edge }])
    canvasStore.addNode(node); canvasStore.addEdge(edge)
    const body = JSON.stringify({ videoUrl, resolution, requestId, workflowId: context.workflowId, nodeId })
    let response
    // The same request ID makes a lost-response retry safe for billing and upstream dispatch.
    for (let attempt = 0; attempt < 2; attempt++) {
      try { response = await fetch(getApiUrl('/api/videos/upscale/tasks'), { method: 'POST', headers: headers(), body }); break }
      catch (error) { if (attempt === 1) throw error }
    }
    const result = await response.json()
    if (!response.ok || !result.taskId) throw new Error(result.message || translateUi('uiMessages.meb6310ff276b'))
    submitted = true
    taskId = result.taskId
    canvasStore.updateNodeData(nodeId, { taskId, pointsCost: result.prepaid, progress: translateUi('uiMessages.me99ce7ce0f92') })
    registerTask({ taskId, type: 'video-hd', nodeId, tabId: context.currentTab.id, metadata: { sourceUrl: videoUrl, sourceNodeId: props.nodeId, workflowId: context.workflowId } })
    showToast(translateUi('uiMessages.m0fdbed3b6d5d', { value1: (formatPoints(result.prepaid)) }), 'success')
  } catch (error) {
    if (nodeId && context && !submitted) {
      // Keep the deterministic task ID: an accepted request survives a lost response and can be re-fetched.
      const data = { status: 'error', progress: null, error: error.message || translateUi('uiMessages.m5d2e4d8c79f2'), taskId }
      await patchWorkflowNode(context.workflowId, nodeId, { data }).catch(() => {})
      canvasStore.updateNodeData(nodeId, data)
    }
    showToast(error.message || translateUi('uiMessages.meb6310ff276b'), 'error')
  } finally { busy.value = false }
}
</script>
<template>
  <div class="upscale-control nodrag nopan" @keydown.esc.stop="opened = false">
    <slot :open="open" :busy="busy" />
    <div v-if="opened" class="upscale-menu" role="menu" :aria-label="translateUi('uiMessages.me69254355c31')" @mousedown.stop @wheel.stop>
      <div class="upscale-heading">{{ translateUi('uiMessages.m298f33ab2484') }} <button :aria-label="translateUi('uiMessages.m839118327010')" @click.stop="opened = false">×</button></div>
      <button v-for="resolution in resolutions" :key="resolution" class="resolution-option" role="menuitem" :title="priceLabel(resolution)" @click.stop="submit(resolution)">
        <span>{{ resolution.toUpperCase() }}</span><span class="resolution-price">{{ translateUi('uiMessages.m645a4df1e94c', { value1: (formatPoints(config.points_per_second[resolution])) }) }}</span>
      </button>
      <p>{{ translateUi('uiMessages.m2167621f1612') }}</p>
    </div>
  </div>
</template>
<style scoped>
.upscale-control { position: relative; display: flex; }
.upscale-menu { position: absolute; top: calc(100% + 10px); left: 0; z-index: 100; width: 245px; padding: 10px; border-radius: 10px; border: 1px solid #3f3f46; background: #18181b; color: #f4f4f5; box-shadow: 0 8px 24px #0005; }
.upscale-heading { display: flex; justify-content: space-between; align-items: center; padding: 4px 6px 8px; font-size: 12px; color: #a1a1aa; }
.upscale-heading button { padding: 0 4px; font-size: 18px; }
.resolution-option { display: flex; width: 100%; justify-content: space-between; align-items: center; padding: 10px 8px; border-radius: 6px; font-size: 13px; text-align: left; }
.resolution-option:hover, .resolution-option:focus-visible { background: #3f3f46; outline: none; }
.resolution-price, p { font-size: 11px; color: #a1a1aa; }
p { padding: 8px 6px 2px; margin: 0; white-space: normal; }
.canvas-theme-light .upscale-menu { background: #fff; color: #18181b; border-color: #d4d4d8; }
.canvas-theme-light .resolution-option:hover, .canvas-theme-light .resolution-option:focus-visible { background: #f4f4f5; }
.canvas-theme-light .resolution-price, .canvas-theme-light .upscale-heading, .canvas-theme-light p { color: #52525b; }
</style>
