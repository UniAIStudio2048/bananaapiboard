<script setup>
import { ref, computed, watch, onMounted, onUnmounted, inject, unref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
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
  <section class="breakdown-node" :class="{ selected }" aria-label="逐帧拉片">
    <header><span class="film-icon">▤</span><strong>逐帧拉片</strong><span class="badge">视频分析</span></header>
    <Handle id="input" type="target" :position="Position.Left" :connectable="!readonly && !busy" />
    <div class="source-caption"><span>视频素材</span><span v-if="videoMetadata">{{ formatBreakdownTime(videoMetadata.duration) }} · {{ videoMetadata.width }}×{{ videoMetadata.height }}</span></div>
    <div v-if="sourceUrl" class="preview nodrag nopan">
      <video :src="sourceUrl" controls preload="metadata" @loadedmetadata="readMetadata" />
      <button v-if="!readonly" class="replace" :disabled="busy" @click="uploadInput.click()">替换素材</button>
    </div>
    <button v-else class="empty nodrag nopan" :disabled="readonly || busy" @click="uploadInput.click()"><span>＋</span>{{ uploading ? '上传中…' : '上传视频后开始' }}<small>或从左侧连接视频节点</small></button>
    <input ref="uploadInput" class="hidden-input" type="file" accept="video/*" @change="upload">
    <div class="dimension-label">拆解维度</div>
    <div class="dimensions nodrag nopan"><button v-for="item in [{key:'shots',label:'分镜',icon:'▧'},{key:'motions',label:'动态',icon:'▷'},{key:'audio',label:'音乐',icon:'♫'}]" :key="item.key" :class="{ chosen: dimensions.includes(item.key) }" :aria-pressed="dimensions.includes(item.key)" :disabled="busy || readonly" @click="toggleDimension(item.key)">{{ item.icon }} {{ item.label }}</button></div>
    <select v-if="config?.models?.length > 1" class="model-select nodrag nopan" aria-label="拉片模型" :value="modelId" :disabled="busy || readonly" @change="persistSettings({breakdownModelId:$event.target.value})"><option v-for="model in config.models" :key="model.id" :value="model.id">{{ model.name }}</option></select>
    <p v-if="config?.enabled === false" class="notice">租户尚未启用逐帧拉片</p>
    <p v-if="!dimensions.length" class="notice">请至少选择一个拆解维度</p>
    <p v-if="statusText" class="progress" role="status">{{ statusText }}</p>
    <p v-if="error || data.error" class="error" role="alert">{{ error || data.error }}</p>
    <div v-if="summary" class="summary">{{ summary.shots }} 张分镜 · {{ summary.motions }} 段动态 · {{ summary.audio }} 段音频</div>
    <p v-for="notice in (data.breakdownNotices || []).filter(text => !text.startsWith('音频按分镜截取原视频音轨'))" :key="notice" class="notice">{{ notice }}</p>
    <button class="start nodrag nopan" :disabled="readonly || busy || !sourceUrl || !dimensions.length || !config?.enabled" @click="start()">{{ busy ? (uploading ? '上传中…' : '分析中…') : '开始拉片' }}<span v-if="!busy && estimatedCost !== null"> · {{ estimatedCost }} 积分</span></button>
    <button v-if="data.status === 'error' && data.breakdownTaskId" class="retry nodrag nopan" :disabled="busy || readonly" @click="start(true)">重试未完成的分析</button>
    <p v-if="config?.enabled" class="price-note">{{ config.billing_mode === 'per_second' ? `${config.points_per_second} 积分/秒，以实际时长结算` : `${config.points_cost} 积分/次` }} · 成功后扣费</p>
    <Handle id="output" type="source" :position="Position.Right" :connectable="false" />
  </section>
</template>

<style scoped>
.breakdown-node{width:340px;padding:16px;border:1px solid var(--canvas-border,#3b3b3b);border-radius:16px;background:var(--canvas-node-bg,#252525);color:var(--canvas-text,#eee);box-shadow:0 6px 20px #0002;font-size:12px}.breakdown-node.selected{border-color:#74b7cc;box-shadow:0 0 0 1px #74b7cc}header{display:flex;align-items:center;gap:8px;margin-bottom:20px}header strong{font-size:15px}.film-icon{font-size:20px}.badge{font-size:10px;color:#93c5d5;background:#23414c;padding:3px 7px;border-radius:5px}.source-caption{display:flex;justify-content:space-between;color:#a5a5a5;margin-bottom:8px;font-size:11px}.preview{position:relative;border-radius:10px;overflow:hidden;background:#151515}.preview video{display:block;width:100%;max-height:300px;object-fit:contain}.replace{position:absolute;right:8px;top:8px;border:0;border-radius:7px;background:#222c;color:#eee;padding:6px 9px;cursor:pointer}.empty{width:100%;height:180px;border:1px dashed #555;border-radius:10px;background:#ffffff03;color:#aaa;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;cursor:pointer}.empty>span{font-size:25px}.empty small{font-size:11px;color:#777}.hidden-input{display:none}.dimension-label{color:#aaa;margin:18px 0 9px}.dimensions{display:flex;gap:8px}.dimensions button{flex:1;border:1px solid #4b4b4b;border-radius:20px;padding:8px 0;background:transparent;color:#aaa;cursor:pointer}.dimensions button.chosen{background:#234651;border-color:#366675;color:#a8d6e2}.start{width:100%;margin-top:16px;padding:10px;border:0;border-radius:9px;background:#f4f4f4;color:#202020;font-weight:600;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.error{color:#fca5a5;line-height:1.5;overflow-wrap:anywhere;margin:10px 0}.notice,.price-note{font-size:11px;color:#a3a3a3;line-height:1.5;margin:8px 0 0}.price-note{text-align:center}.progress{margin:12px 0 0;color:#93c5d5}.summary{margin-top:12px;color:#b4dbb9}.retry{width:100%;border:1px solid #555;background:transparent;border-radius:8px;color:inherit;padding:8px;margin-top:8px;cursor:pointer}.model-select{width:100%;margin-top:12px;background:#333;color:#eee;border:1px solid #555;border-radius:6px;padding:6px}
</style>
