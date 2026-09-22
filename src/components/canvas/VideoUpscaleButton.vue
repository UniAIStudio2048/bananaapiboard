<script setup>
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
const priceLabel = resolution => `${formatPoints(config.value.points_per_second[resolution])} 积分/秒 · 预扣 10 秒 ${formatPoints(config.value.points_per_second[resolution] * 10)} 积分，按实际时长多退少补`

async function open() {
  if (busy.value) return
  if (opened.value) { opened.value = false; return }
  busy.value = true
  try {
    const response = await fetch(getApiUrl('/api/videos/upscale/config'), { headers: headers(), cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(result.message || '高清配置暂不可用')
    config.value = result
    if (result.enabled) opened.value = true
    else emit('legacy')
  } catch (error) { showToast(error.message || '高清配置加载失败', 'error') }
  finally { busy.value = false }
}

async function submit(resolution) {
  if (busy.value) return
  busy.value = true; opened.value = false
  let context, nodeId, taskId, submitted = false
  try {
    let videoUrl = props.videoUrl
    if (!videoUrl) throw new Error('没有可处理的视频')
    if (/^(blob:|data:)/.test(videoUrl)) {
      const blob = await (await fetch(videoUrl)).blob()
      const uploaded = await uploadCanvasMedia(new File([blob], 'video.mp4', { type: blob.type || 'video/mp4' }), 'video')
      if (!uploaded.url) throw new Error('视频上传失败')
      videoUrl = uploaded.url
    }
    context = await props.ensureWorkflow(props.nodeId)
    const source = canvasStore.nodes.find(node => node.id === props.nodeId)
    const requestId = globalThis.crypto.randomUUID()
    nodeId = `upscale_node_${requestId}`
    taskId = `upscale_${requestId}`
    const node = { id: nodeId, type: 'video', position: { x: source.position.x + 500, y: source.position.y }, data: {
      label: `高清放大 ${resolution.toUpperCase()}`, title: `高清放大 ${resolution.toUpperCase()}`, status: 'processing', progress: '正在提交高清放大...',
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
    if (!response.ok || !result.taskId) throw new Error(result.message || '高清放大提交失败')
    submitted = true
    taskId = result.taskId
    canvasStore.updateNodeData(nodeId, { taskId, pointsCost: result.prepaid, progress: '高清放大中...' })
    registerTask({ taskId, type: 'video-hd', nodeId, tabId: context.currentTab.id, metadata: { sourceUrl: videoUrl, sourceNodeId: props.nodeId, workflowId: context.workflowId } })
    showToast(`高清放大已提交，预扣 ${formatPoints(result.prepaid)} 积分`, 'success')
  } catch (error) {
    if (nodeId && context && !submitted) {
      // Keep the deterministic task ID: an accepted request survives a lost response and can be re-fetched.
      const data = { status: 'error', progress: null, error: error.message || '提交状态待确认，请重新获取', taskId }
      await patchWorkflowNode(context.workflowId, nodeId, { data }).catch(() => {})
      canvasStore.updateNodeData(nodeId, data)
    }
    showToast(error.message || '高清放大提交失败', 'error')
  } finally { busy.value = false }
}
</script>
<template>
  <div class="upscale-control nodrag nopan" @keydown.esc.stop="opened = false">
    <slot :open="open" :busy="busy" />
    <div v-if="opened" class="upscale-menu" role="menu" aria-label="超分分辨率" @mousedown.stop @wheel.stop>
      <div class="upscale-heading">选择超分分辨率 <button aria-label="关闭分辨率菜单" @click.stop="opened = false">×</button></div>
      <button v-for="resolution in resolutions" :key="resolution" class="resolution-option" role="menuitem" :title="priceLabel(resolution)" @click.stop="submit(resolution)">
        <span>{{ resolution.toUpperCase() }}</span><span class="resolution-price">{{ formatPoints(config.points_per_second[resolution]) }} 积分/秒</span>
      </button>
      <p>预扣 10 秒，按实际时长多退少补</p>
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
:global(.canvas-theme-light) .upscale-menu { background: #fff; color: #18181b; border-color: #d4d4d8; }
:global(.canvas-theme-light) .resolution-option:hover, :global(.canvas-theme-light) .resolution-option:focus-visible { background: #f4f4f5; }
:global(.canvas-theme-light) .resolution-price, :global(.canvas-theme-light) .upscale-heading, :global(.canvas-theme-light) p { color: #52525b; }
</style>
