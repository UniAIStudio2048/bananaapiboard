<script setup>
import { ref, computed, watch, onMounted, onUnmounted, inject, unref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { AudioLines, Check, Film, LoaderCircle, PanelsTopLeft, Play, RotateCcw, Upload } from '@lucide/vue'
import { useCanvasStore } from '@/stores/canvas'
import { useTeamStore } from '@/stores/team'
import { saveWorkflow, uploadCanvasMedia, postWorkflowOps, patchWorkflowNode, getWorkflowNodesBatch } from '@/api/canvas/workflow'
import { requestVideoBreakdown } from '@/api/canvas/video-breakdown'
import { getBreakdownSource, mergeBreakdownResult, formatBreakdownTime } from '@/utils/videoBreakdown'

const props = defineProps({ id: String, data: { type: Object, default: () => ({}) }, selected: Boolean })
const store = useCanvasStore(), teamStore = useTeamStore()
const previewMode = inject('canvasReadonlyPreview', false)
const readonly = computed(() => unref(previewMode) || props.data.readonly === true)
const config = ref(null), error = ref(''), progress = ref(''), submitting = ref(false), uploading = ref(false)
const uploadInput = ref(null), videoMetadata = ref(null)
const source = computed(() => getBreakdownSource(props.id, store.nodes, store.edges))
const sourceUrl = computed(() => source.value?.data.output?.url || source.value?.data.videoUrl || source.value?.data.url || '')
const dimensions = computed(() => props.data.breakdownDimensions || ['shots', 'motions', 'audio'])
const modelId = computed(() => props.data.breakdownModelId || config.value?.default_model || '')
const active = ref(props.data.status === 'processing')
const busy = computed(() => submitting.value || uploading.value || active.value)
const estimatedCost = computed(() => !config.value ? null : config.value.billing_mode === 'fixed' ? Number(config.value.points_cost).toFixed(2) : videoMetadata.value ? (videoMetadata.value.duration * config.value?.points_per_second).toFixed(2) : null)
const statusText = computed(() => progress.value || props.data.processingText || '')
const summary = computed(() => props.data.breakdownSummary)
const alive = new AbortController()
let timer, persistence = Promise.resolve(), pollingTask

function assertTab(tabId) {
  if (alive.signal.aborted || store.getCurrentTab?.()?.id !== tabId) throw new Error('画布已切换，请在原画布查看任务')
}
async function ensureWorkflow() {
  const tab = store.getCurrentTab?.()
  if (!tab?.id) throw new Error('当前画布不可用')
  if (tab.workflowId) return { tabId: tab.id, workflowId: tab.workflowId }
  const space = tab.workflowSpaceType ? { spaceType: tab.workflowSpaceType, teamId: tab.workflowTeamId } : teamStore.getSpaceParams('current')
  const result = await saveWorkflow({ name: tab.name || '逐帧拉片', isDraft: true, uploadToCloud: false, ...space, ...store.exportWorkflowForSave() })
  assertTab(tab.id)
  const workflow = result.workflow || result
  if (!workflow.id) throw new Error('画布保存失败')
  store.markCurrentTabSaved(workflow.id, workflow.workflow_uid, { space_type: space.spaceType, team_id: space.teamId })
  return { tabId: tab.id, workflowId: workflow.id }
}
async function persistNode(context, node, patch) {
  const loaded = await getWorkflowNodesBatch(context.workflowId, [node.id])
  assertTab(context.tabId)
  const remote = loaded.nodes?.find(item => item.id === node.id)
  if (!remote) {
    await postWorkflowOps(context.workflowId, [{ op: 'add', target: 'node', payload: node }])
    const latest = await getWorkflowNodesBatch(context.workflowId, [node.id])
    assertTab(context.tabId)
    const saved = latest.nodes?.find(item => item.id === node.id)
    if (saved) store.applyIncrementalNode(saved)
  }
  else if (patch) {
    const saved = await patchWorkflowNode(context.workflowId, node.id, { data: patch }, remote.version)
    assertTab(context.tabId)
    store.applyIncrementalNode({ id: node.id, data: {}, version: saved.version })
  } else store.applyIncrementalNode(remote)
}
function persistSettings(data) {
  store.updateNodeData(props.id, data)
  persistence = persistence.catch(() => {}).then(async () => {
    const context = await ensureWorkflow()
    await persistNode(context, store.nodes.find(node => node.id === props.id), data)
  }).catch(e => { error.value = e.message; throw e })
  // Keep failures visible without an unhandled promise; submit still awaits the original promise.
  persistence.catch(() => {})
}
function toggleDimension(key) {
  if (busy.value || readonly.value) return
  const next = dimensions.value.includes(key) ? dimensions.value.filter(item => item !== key) : [...dimensions.value, key]
  persistSettings({ breakdownDimensions: next })
}
async function upload(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || readonly.value || busy.value) return
  uploading.value = true; error.value = ''
  try {
    if (file.size > 500 * 1024 * 1024) throw new Error('视频超过 500 MB 限制')
    if (!source.value && store.edges.some(edge => edge.target === props.id)) throw new Error('请先移除多余的输入连线')
    const tabId = store.getCurrentTab?.()?.id
    const uploaded = await uploadCanvasMedia(file, 'video')
    assertTab(tabId)
    if (!uploaded.url) throw new Error('视频上传失败')
    let input = source.value
    if (input) {
      store.updateNodeData(input.id, { output: { type: 'video', url: uploaded.url }, videoUrl: uploaded.url, title: file.name })
    } else {
      if (store.edges.some(edge => edge.target === props.id)) throw new Error('请先移除多余的输入连线')
      const node = store.nodes.find(item => item.id === props.id)
      input = { id: `video_${crypto.randomUUID()}`, type: 'video', position: { x: node.position.x - 460, y: node.position.y }, data: { title: file.name, output: { type: 'video', url: uploaded.url }, videoUrl: uploaded.url } }
      store.addNode(input)
      store.addEdge({ id: `edge_${crypto.randomUUID()}`, source: input.id, target: props.id, sourceHandle: 'output', targetHandle: 'input' })
    }
    const context = await ensureWorkflow()
    input = store.nodes.find(node => node.id === input.id)
    await persistNode(context, input, { output: input.data.output, videoUrl: input.data.videoUrl, title: input.data.title })
    const reset = { status: 'idle', breakdownTaskId: null, breakdownSummary: null, breakdownNotices: [], error: null, processingText: null }
    store.updateNodeData(props.id, reset)
    progress.value = ''
    await persistNode(context, store.nodes.find(node => node.id === props.id), reset)
    const edge = store.edges.find(edge => edge.source === input.id && edge.target === props.id)
    await postWorkflowOps(context.workflowId, [{ op: 'add', target: 'edge', payload: edge }])
  } catch (e) { error.value = e.message } finally { uploading.value = false }
}
function readMetadata(event) {
  videoMetadata.value = { duration: event.target.duration, width: event.target.videoWidth, height: event.target.videoHeight }
}
async function poll(taskId, context) {
  pollingTask = taskId
  clearTimeout(timer)
  try {
    const state = await requestVideoBreakdown(`/tasks/${encodeURIComponent(taskId)}`, null, { signal: alive.signal })
    assertTab(context.tabId)
    if (taskId !== pollingTask) return
    if (state.node) store.applyIncrementalNode(state.node)
    progress.value = state.progress || ''
    if (state.status === 'completed') {
      const restore = state.node && state.node.data?.status !== 'success'
      // A stale canvas save can overwrite the node after the task has committed.
      // Restore from the task result using the current canvas version for saving.
      const result = restore ? { ...state.result, node: { ...state.result.node, version: state.node.version } } : state.result
      mergeBreakdownResult(store, result)
      if (restore) {
        const tab = store.getCurrentTab()
        const space = tab.workflowSpaceType ? { spaceType: tab.workflowSpaceType, teamId: tab.workflowTeamId } : teamStore.getSpaceParams('current')
        await saveWorkflow({ id: context.workflowId, name: tab.name, uploadToCloud: false, ...space, ...store.exportWorkflowForSave() })
        assertTab(context.tabId)
      }
      active.value = false; error.value = ''; progress.value = '分析完成'
      window.dispatchEvent(new CustomEvent('user-info-updated'))
      return
    }
    if (state.status === 'failed') {
      active.value = false; progress.value = ''; error.value = state.error || '拉片失败，未扣积分'
      store.updateNodeData(props.id, { status: 'error', error: error.value })
      return
    }
    active.value = true
  } catch (e) {
    if (alive.signal.aborted || store.getCurrentTab?.()?.id !== context.tabId) return
    if ([401,403,404].includes(e.status)) { active.value = false; progress.value = ''; error.value = e.message; return }
    error.value = `状态读取失败：${e.message}，正在重连`
  }
  timer = setTimeout(() => poll(taskId, context), 1500)
}
async function start(retry = false) {
  if (busy.value || readonly.value || !sourceUrl.value || !dimensions.value.length) return
  submitting.value = true; error.value = ''; progress.value = retry ? '恢复分析…' : '读取视频与计算费用…'
  try {
    await persistence
    const context = await ensureWorkflow()
    let taskId
    if (retry) {
      taskId = (await requestVideoBreakdown(`/tasks/${props.data.breakdownTaskId}/retry`, {})).taskId
    } else {
      const input = source.value
      if (/^(blob:|data:)/.test(sourceUrl.value)) throw new Error('请等待视频上传保存完成后再分析')
      await persistNode(context, input)
      await persistNode(context, store.nodes.find(node => node.id === props.id))
      await postWorkflowOps(context.workflowId, [{ op: 'add', target: 'edge', payload: store.edges.find(edge => edge.source === input.id && edge.target === props.id) }])
      const quote = await requestVideoBreakdown('/estimate', { workflowId: context.workflowId, nodeId: props.id, sourceNodeId: input.id, modelId: modelId.value, dimensions: dimensions.value }, { signal: alive.signal })
      assertTab(context.tabId)
      videoMetadata.value = quote.metadata
      taskId = (await requestVideoBreakdown('/tasks', { quoteId: quote.quoteId, requestId: crypto.randomUUID() })).taskId
    }
    assertTab(context.tabId)
    store.updateNodeData(props.id, { breakdownTaskId: taskId, status: 'processing', error: null })
    active.value = true
    poll(taskId, context)
  } catch (e) { error.value = e.message; progress.value = '' } finally { submitting.value = false }
}
onMounted(() => {
  if (readonly.value) return
  requestVideoBreakdown('/config', null, { signal: alive.signal })
    .then(value => { config.value = value })
    .catch(e => { if (!alive.signal.aborted) error.value = e.message })
  const tab = store.getCurrentTab?.()
  if (props.data.breakdownTaskId && tab?.workflowId && ['processing', 'error'].includes(props.data.status)) {
    active.value = true
    poll(props.data.breakdownTaskId, { tabId: tab.id, workflowId: tab.workflowId })
  }
})
watch(sourceUrl, () => { videoMetadata.value = null })
onUnmounted(() => { alive.abort(); clearTimeout(timer) })
</script>

<template>
  <section class="breakdown-node" :class="{ selected }" :aria-busy="busy" aria-label="逐帧拉片">
    <header class="node-header">
      <Film class="icon" aria-hidden="true" />
      <strong>逐帧拉片</strong>
      <span class="badge">视频分析</span>
    </header>
    <Handle id="input" type="target" :position="Position.Left" :connectable="!readonly && !busy" />

    <div class="node-body">
      <div class="section-label">
        <span>视频素材</span>
        <span v-if="videoMetadata" class="metadata">{{ formatBreakdownTime(videoMetadata.duration) }} · {{ videoMetadata.width }}×{{ videoMetadata.height }}</span>
      </div>
      <div v-if="sourceUrl" class="preview nodrag nopan">
        <video :src="sourceUrl" controls preload="metadata" @loadedmetadata="readMetadata" />
        <button v-if="!readonly" type="button" class="replace" :disabled="busy" @click="uploadInput.click()">
          <Upload class="icon" aria-hidden="true" />替换素材
        </button>
      </div>
      <button v-else type="button" class="empty nodrag nopan" :disabled="readonly || busy" @click="uploadInput.click()">
        <span class="upload-icon"><LoaderCircle v-if="uploading" class="icon spinning" aria-hidden="true" /><Upload v-else class="icon" aria-hidden="true" /></span>
        <span class="upload-title">{{ uploading ? '上传中…' : '上传视频' }}</span>
        <span class="upload-hint">或从左侧连接视频节点</span>
        <span class="upload-limit">最大 500 MB</span>
      </button>
      <input ref="uploadInput" class="hidden-input" type="file" accept="video/*" @change="upload">

      <div class="section-label dimension-label"><span>拆解维度</span><span class="section-hint">多选</span></div>
      <div class="dimensions nodrag nopan" role="group" aria-label="拆解维度">
        <button v-for="item in [{key:'shots',label:'分镜',icon:PanelsTopLeft},{key:'motions',label:'动态',icon:Play},{key:'audio',label:'音乐',icon:AudioLines}]" :key="item.key" type="button" :class="{ chosen: dimensions.includes(item.key) }" :aria-pressed="dimensions.includes(item.key)" :disabled="busy || readonly" @click="toggleDimension(item.key)">
          <component :is="item.icon" class="icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
          <Check class="check-icon" :class="{ unchecked: !dimensions.includes(item.key) }" aria-hidden="true" />
        </button>
      </div>
      <select v-if="config?.models?.length > 1" class="model-select nodrag nopan" aria-label="拉片模型" :value="modelId" :disabled="busy || readonly" @change="persistSettings({breakdownModelId:$event.target.value})"><option v-for="model in config.models" :key="model.id" :value="model.id">{{ model.name }}</option></select>
      <p v-if="config?.enabled === false" class="notice">租户尚未启用逐帧拉片</p>
      <p v-if="!dimensions.length" class="notice">请至少选择一个拆解维度</p>
      <p v-if="statusText" class="progress" role="status">
        <LoaderCircle v-if="busy" class="icon spinning" aria-hidden="true" />
        <Check v-else-if="summary" class="icon" aria-hidden="true" />
        <span>{{ statusText }}</span>
      </p>
      <p v-if="error || data.error" class="error" role="alert">{{ error || data.error }}</p>
      <div v-if="summary" class="summary" aria-label="拆解结果">
        <span><strong>{{ summary.shots ?? 0 }}</strong>张分镜</span>
        <span><strong>{{ summary.motions ?? 0 }}</strong>段动态</span>
        <span><strong>{{ summary.audio ?? 0 }}</strong>段音频</span>
      </div>
      <p v-for="notice in (data.breakdownNotices || []).filter(text => !text.startsWith('音频按分镜截取原视频音轨'))" :key="notice" class="notice">{{ notice }}</p>
    </div>

    <footer class="node-footer">
      <button type="button" class="start nodrag nopan" :disabled="readonly || busy || !sourceUrl || !dimensions.length || !config?.enabled" @click="start()">
        <LoaderCircle v-if="busy" class="icon spinning" aria-hidden="true" /><Play v-else class="icon" aria-hidden="true" />
        <span>{{ busy ? (uploading ? '上传中…' : '分析中…') : '开始拉片' }}</span>
        <span v-if="!busy && estimatedCost !== null" class="cost">{{ estimatedCost }} 积分</span>
      </button>
      <button v-if="data.status === 'error' && data.breakdownTaskId" type="button" class="retry nodrag nopan" :disabled="busy || readonly" @click="start(true)"><RotateCcw class="icon" aria-hidden="true" />重试未完成的分析</button>
      <p v-if="config?.enabled" class="price-note">{{ config.billing_mode === 'per_second' ? `${config.points_per_second} 积分/秒，以实际时长结算` : `${config.points_cost} 积分/次` }} · 成功后扣费</p>
    </footer>
    <Handle id="output" type="source" :position="Position.Right" :connectable="false" />
  </section>
</template>

<style scoped>
.breakdown-node {
  width: 340px;
  border: 1px solid var(--canvas-border-default);
  border-radius: 12px;
  background: var(--canvas-bg-tertiary);
  color: var(--canvas-text-primary);
  box-shadow: var(--canvas-shadow-md);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  line-height: 1.5;
}
.breakdown-node.selected {
  border-color: var(--canvas-text-secondary);
  box-shadow: 0 0 0 1px var(--canvas-text-secondary), var(--canvas-shadow-md);
}
.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--canvas-border-subtle);
}
.node-header strong { font-size: 13px; font-weight: 600; }
.icon { width: 16px; height: 16px; flex-shrink: 0; stroke-width: 1.75; }
.badge {
  padding: 1px 6px;
  border: 1px solid var(--canvas-border-subtle);
  border-radius: 4px;
  background: var(--canvas-bg-secondary);
  color: var(--canvas-text-secondary);
  font-size: 10px;
  font-weight: 400;
}
.node-body { padding: 14px 16px 16px; }
.section-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 500;
}
.metadata, .section-hint { color: var(--canvas-text-secondary); font-size: 11px; font-weight: 400; }
.metadata { font-variant-numeric: tabular-nums; }
.preview { position: relative; border-radius: 8px; overflow: hidden; background: var(--canvas-bg-primary); }
.preview video { display: block; width: 100%; max-height: 300px; object-fit: contain; }
.replace {
  position: absolute;
  right: 8px;
  top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--canvas-border-default);
  border-radius: 6px;
  background: var(--canvas-bg-secondary);
  color: var(--canvas-text-primary);
  font-size: 11px;
  box-shadow: var(--canvas-shadow-sm);
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 1px dashed var(--canvas-border-default);
  border-radius: 8px;
  background: var(--canvas-bg-secondary);
  color: var(--canvas-text-secondary);
}
.upload-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin-bottom: 3px;
  border: 1px solid var(--canvas-border-subtle);
  border-radius: 8px;
  background: var(--canvas-bg-tertiary);
}
.upload-title { color: var(--canvas-text-primary); font-size: 13px; font-weight: 500; }
.upload-hint, .upload-limit { font-size: 11px; }
.upload-limit { margin-top: 3px; }
.hidden-input { display: none; }
.dimension-label { margin-top: 16px; }
.dimensions { display: flex; gap: 6px; }
.dimensions button {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 0;
  min-height: 34px;
  padding: 6px;
  border: 1px solid var(--canvas-border-subtle);
  border-radius: 8px;
  background: transparent;
  color: var(--canvas-text-secondary);
  font-size: 12px;
}
.dimensions button.chosen {
  border-color: var(--canvas-border-active);
  background: var(--canvas-bg-secondary);
  color: var(--canvas-text-primary);
}
.check-icon { width: 12px; height: 12px; flex-shrink: 0; stroke-width: 2; }
.check-icon.unchecked { visibility: hidden; }
.node-footer { padding: 12px 16px; border-top: 1px solid var(--canvas-border-subtle); }
.start, .retry {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  min-height: 36px;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
}
.start { background: var(--canvas-text-primary); color: var(--canvas-bg-primary); }
.start:not(:disabled):hover { opacity: .85; }
.start:disabled { opacity: 1; background: var(--canvas-bg-secondary); color: var(--canvas-text-secondary); border-color: var(--canvas-border-subtle); }
.cost { padding-left: 8px; border-left: 1px solid currentColor; font-size: 11px; font-variant-numeric: tabular-nums; }
.retry { margin-top: 8px; border-color: var(--canvas-border-default); background: transparent; color: var(--canvas-text-primary); }
button { cursor: pointer; }
button:disabled, select:disabled { opacity: .55; cursor: not-allowed; }
.empty:not(:disabled):hover, .replace:not(:disabled):hover, .retry:not(:disabled):hover, .dimensions button:not(:disabled):hover {
  border-color: var(--canvas-text-secondary);
  background: var(--canvas-bg-elevated);
  color: var(--canvas-text-primary);
}
button:focus-visible, select:focus-visible { outline: 2px solid var(--canvas-text-primary); outline-offset: 3px; }
.notice, .price-note { margin: 10px 0 0; color: var(--canvas-text-secondary); font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.price-note { margin-top: 8px; text-align: center; }
.progress { display: flex; align-items: flex-start; gap: 8px; margin: 12px 0 0; color: var(--canvas-text-secondary); font-size: 12px; overflow-wrap: anywhere; }
.progress .icon { margin-top: 1px; }
.error { margin: 12px 0 0; color: var(--canvas-accent-error); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.summary { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 12px; padding: 10px 0; border: 1px solid var(--canvas-border-subtle); border-radius: 8px; background: var(--canvas-bg-secondary); }
.summary span { display: flex; flex-direction: column; align-items: center; gap: 2px; color: var(--canvas-text-secondary); font-size: 11px; }
.summary span + span { border-left: 1px solid var(--canvas-border-subtle); }
.summary strong { color: var(--canvas-text-primary); font-size: 16px; font-weight: 500; font-variant-numeric: tabular-nums; }
.model-select { width: 100%; margin-top: 12px; padding: 8px; border: 1px solid var(--canvas-border-default); border-radius: 8px; background: var(--canvas-bg-secondary); color: var(--canvas-text-primary); font-size: 12px; }
.breakdown-node :deep(.vue-flow__handle) { background: var(--canvas-bg-tertiary); border-color: var(--canvas-text-secondary); }
.spinning { animation: breakdown-spin 1s linear infinite; }
@keyframes breakdown-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinning { animation: none; } }
</style>
