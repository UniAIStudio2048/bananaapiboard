import { ref, computed, onUnmounted } from 'vue'
import { useCanvasStore } from '@/stores/canvas'
import { useTeamStore } from '@/stores/team'
import { scriptRequest } from '@/api/canvas/script'
import { saveWorkflow, postWorkflowOps, getWorkflowNodesBatch, patchWorkflowNode } from '@/api/canvas/workflow'
import { generateImageFromText, generateImageFromImage, generateVideoFromText, generateVideoFromImage, pollTaskStatus, getImageTaskStatus, getVideoTaskStatus } from '@/api/canvas/nodes'
import { classifyBackgroundTaskStatus } from '@/stores/canvas/backgroundTaskStatus'
import { getTaskMediaUrl } from '@/utils/canvasTaskResult'
import { blankScript, completion, newShot } from '@/utils/scriptDocument'
import { getScriptResultPositions } from '@/utils/scriptResultLayout'

export function useScriptDocument(nodeId) {
  const store = useCanvasStore(), teams = useTeamStore()
  const document = ref(blankScript()), version = ref(0), config = ref(null), task = ref(null), error = ref(''), saving = ref(0), loading = ref(false), loaded = ref(false), mediaBusy = ref(false), mediaProgress = ref('')
  const submitting = ref(false)
  const running = computed(() => ['queued', 'processing'].includes(task.value?.status))
  const busy = computed(() => loading.value || running.value || mediaBusy.value || submitting.value)
  const steps = computed(() => completion(document.value))
  let context, alive = true, timer, mediaTimer, saveQueue = Promise.resolve(), revision = 0, saveFailure = null, stopMedia = false
  function assertContext() { if (!alive || context && store.getCurrentTab()?.id !== context.tabId) throw new Error('画布已切换，请回到原画布继续') }
  async function ensureContext() {
    if (context) { assertContext(); return context }
    const tab = store.getCurrentTab()
    if (!tab) throw new Error('画布不可用')
    context = { tabId: tab.id, workflowId: tab.workflowId }
    if (!context.workflowId) {
      const space = tab.workflowSpaceType ? { spaceType: tab.workflowSpaceType, teamId: tab.workflowTeamId } : teams.getSpaceParams('current')
      const result = await saveWorkflow({ name: tab.name || '脚本画布', isDraft: true, uploadToCloud: false, ...space, ...store.exportWorkflowForSave() })
      assertContext()
      const workflow = result.workflow || result
      context.workflowId = workflow.id
      store.markCurrentTabSaved(workflow.id, workflow.workflow_uid, { space_type: space.spaceType, team_id: space.teamId })
    }
    const result = await getWorkflowNodesBatch(context.workflowId, [nodeId]); assertContext()
    if (!result.nodes?.some(n => n.id === nodeId)) await postWorkflowOps(context.workflowId, [{ op: 'add', target: 'node', payload: store.nodes.find(n => n.id === nodeId) }])
    return context
  }
  function docPath() { return `/documents/${context.workflowId}/${nodeId}` }
  async function refreshNodeSummary() {
    const result = await getWorkflowNodesBatch(context.workflowId, [nodeId]); assertContext()
    const node = result.nodes?.find(n => n.id === nodeId)
    if (node) store.applyIncrementalNode(node)
  }
  async function load() {
    loading.value = true; error.value = ''
    try {
      await ensureContext()
      const [state, settings] = await Promise.all([scriptRequest(docPath()), scriptRequest('/config')]); assertContext()
      document.value = state.document; version.value = state.version; task.value = state.task; config.value = settings; loaded.value = true; saveFailure = null
      if (running.value) poll()
      else { await syncMedia(); scheduleMediaSync() }
    } catch (e) { error.value = e.message } finally { loading.value = false }
  }
  function save() {
    if (!loaded.value || running.value) return Promise.reject(new Error('脚本尚未加载或正在生成'))
    const snapshot = JSON.parse(JSON.stringify(document.value)), ownRevision = ++revision
    saving.value++
    const operation = saveQueue.then(async () => {
      assertContext()
      if (saveFailure) throw saveFailure
      const state = await scriptRequest(docPath(), { document: snapshot, version: version.value }, 'PUT'); assertContext()
      version.value = state.version
      // Keep edit object identities stable while queued saves and media tasks hold references.
      if (ownRevision === revision) error.value = ''
      await refreshNodeSummary()
      return state
    }).catch(e => { saveFailure = e; error.value = `${e.message}；当前编辑尚未保存，可复制内容后重新加载`; throw e }).finally(() => { saving.value-- })
    saveQueue = operation.catch(() => {})
    operation.catch(() => {})
    return operation
  }
  async function flush() { await saveQueue; if (saveFailure) throw saveFailure; assertContext() }
  async function poll() {
    clearTimeout(timer)
    if (!alive) return
    try {
      assertContext()
      const state = await scriptRequest(docPath()); assertContext()
      task.value = state.task
      if (!running.value) {
        document.value = state.document; version.value = state.version
        error.value = state.task?.status === 'failed' ? state.task.error : ''
        await refreshNodeSummary()
        window.dispatchEvent(new CustomEvent('user-info-updated'))
        return
      }
    } catch (e) { if (!alive) return; error.value = e.message }
    timer = setTimeout(poll, 2500)
  }
  async function generate(operation, selected = [], modelId) {
    if (busy.value) return
    submitting.value = true; error.value = ''
    try {
      await save(); await flush()
      task.value = await scriptRequest('/tasks', { workflowId: context.workflowId, nodeId, version: version.value, requestId: crypto.randomUUID(), operation, selected, modelId }); poll()
    } catch (e) {
      error.value = e.message
      if (!e.status) {
        try { const state = await scriptRequest(docPath()); assertContext(); if (['queued', 'processing'].includes(state.task?.status)) { task.value = state.task; poll() } } catch { /* Reload can recover an accepted request after connectivity returns. */ }
      }
    } finally { submitting.value = false }
  }
  async function cancel() {
    try { await scriptRequest(`/tasks/${task.value.id}/cancel`, {}); await poll() } catch (e) { error.value = e.message }
  }
  async function persistCanvasNode(node, patch, allowBackground = false) {
    if (!allowBackground) assertContext()
    const result = await getWorkflowNodesBatch(context.workflowId, [node.id])
    if (!allowBackground) assertContext()
    const remote = result.nodes?.find(n => n.id === node.id)
    if (!remote && !allowBackground) await postWorkflowOps(context.workflowId, [{ op: 'add', target: 'node', payload: node }])
    else if (remote && patch) {
      let saved, baseVersion = remote.version
      for (let attempt = 0; attempt < 3; attempt++) {
        try { saved = await patchWorkflowNode(context.workflowId, node.id, { data: patch }, baseVersion); break }
        catch (e) {
          if (e.code !== 'VERSION_CONFLICT' || attempt === 2) throw e
          const latest = await getWorkflowNodesBatch(context.workflowId, [node.id])
          const current = latest.nodes?.find(n => n.id === node.id)
          if (!current) throw new Error('结果节点已删除')
          baseVersion = current.version
        }
      }
      if (alive && store.getCurrentTab()?.id === context.tabId) store.applyIncrementalNode({ id: node.id, data: patch, version: saved.version })
    }
  }
  async function connectNode(node, reverse = false) {
    store.addNode(node)
    await persistCanvasNode(node)
    const edge = { id: `edge_${crypto.randomUUID()}`, source: reverse ? node.id : nodeId, target: reverse ? nodeId : node.id, sourceHandle: 'output', targetHandle: 'input' }
    store.addEdge(edge)
    await postWorkflowOps(context.workflowId, [{ op: 'add', target: 'edge', payload: edge }])
  }
  async function attachAssetPicture(asset, url, existingNodeId) {
    await flush()
    const parent = store.nodes.find(n => n.id === nodeId)
    // A canvas/library selection creates an asset instance in this script's
    // input lane; never move an unrelated source node or reuse a right output.
    let node = store.nodes.find(n => n.id === existingNodeId && n.data.scriptNodeId === nodeId && n.data.scriptMediaKind === 'asset')
    if (!node) {
      node = { id: `image_${crypto.randomUUID()}`, type: 'image', position: getScriptResultPositions(parent, store.nodes, 1, 'asset')[0], data: { title: asset.name, status: 'success', output: { type: 'image', url }, imageUrl: url, scriptNodeId: nodeId, scriptMediaKind: 'asset' } }
      await connectNode(node, true)
    } else if (!store.edges.some(e => e.source === node.id && e.target === nodeId)) {
      await persistCanvasNode(node)
      const edge = { id: `edge_${crypto.randomUUID()}`, source: node.id, target: nodeId, sourceHandle: 'output', targetHandle: 'input' }
      store.addEdge(edge)
      await postWorkflowOps(context.workflowId, [{ op: 'add', target: 'edge', payload: edge }])
    }
    asset.imageUrl = url; asset.nodeId = node.id
    await save()
  }
  async function createSource(entry) {
    try {
      document.value.entry = entry
      if (entry === 'manual') { if (!document.value.shots.length) document.value.shots.push(newShot(`shot_${crypto.randomUUID()}`)); await save(); return }
      const parent = store.nodes.find(n => n.id === nodeId)
      const incoming = store.edges.filter(e => e.target === nodeId).map(e => store.nodes.find(n => n.id === e.source)).filter(Boolean)
      const source = incoming.filter(n => /text/.test(n.type)).map(n => n.data.text || n.data.llmResponse || '').join('\n\n')
      document.value.referenceImages = incoming.filter(n => /image/.test(n.type)).map(n => n.data.output?.url || n.data.imageUrl || n.data.url).filter(Boolean).slice(0, 12)
      if (source) document.value.sourceText = source
      else if (entry === 'story' && !document.value.sourceText) {
        document.value.sourceText = '第一场 日 内 图书馆\n小林发现一本夹着旧车票的书。\n小林：原来你一直记得那次旅行。\n窗外阳光落在书页上，她轻轻合上书。'
        await connectNode({ id: `text_${crypto.randomUUID()}`, type: 'text-input', position: { x: parent.position.x - 500, y: parent.position.y }, data: { title: '剧本原文', text: document.value.sourceText } }, true)
      }
      await save()
    } catch (e) { error.value = e.message }
  }
  async function syncMedia() {
    if (!context || running.value || !loaded.value) return
    const ids = [...document.value.assets.map(a => a.nodeId), ...document.value.shots.flatMap(s => [s.imageNodeId, s.videoNodeId])].filter(Boolean)
    if (!ids.length) return
    const uniqueIds = [...new Set(ids)], batches = []
    for (let offset = 0; offset < uniqueIds.length; offset += 50) batches.push(uniqueIds.slice(offset, offset + 50))
    const responses = await Promise.all(batches.map(chunk => getWorkflowNodesBatch(context.workflowId, chunk))); assertContext()
    const result = { nodes: responses.flatMap(response => response.nodes || []) }
    let changed = false
    for (const node of result.nodes || []) {
      if (node.data.taskId && node.data.status === 'processing') {
        try {
          const kind = node.data.taskType === 'video' ? 'video' : 'image'
          const state = await (kind === 'video' ? getVideoTaskStatus(node.data.taskId) : getImageTaskStatus(node.data.taskId))
          assertContext()
          const url = getTaskMediaUrl(state, kind), classified = classifyBackgroundTaskStatus(state, kind)
          const patch = url ? { status: 'success', output: { type: kind, url }, [`${kind}Url`]: url, error: null } : classified.state === 'failed' ? { status: 'error', error: classified.error } : null
          if (patch) { await persistCanvasNode(node, patch); node.data = { ...node.data, ...patch } }
        } catch { /* Keep the persisted task ID while the network is unavailable. */ }
      }
      assertContext()
      store.applyIncrementalNode(node)
      const url = node.data.output?.url || node.data.imageUrl || node.data.videoUrl
      if (!url) continue
      for (const asset of document.value.assets) if (asset.nodeId === node.id && asset.imageUrl !== url) { asset.imageUrl = url; changed = true }
      for (const shot of document.value.shots) for (const kind of ['image', 'video']) if (shot[`${kind}NodeId`] === node.id && shot[`${kind}Url`] !== url) { shot[`${kind}Url`] = url; changed = true }
    }
    if (changed) await save()
  }
  function scheduleMediaSync() {
    clearTimeout(mediaTimer)
    mediaTimer = setTimeout(async () => {
      if (!alive || store.getCurrentTab()?.id !== context?.tabId) return
      const pendingMedia = document.value.assets.some(a => a.nodeId && !a.imageUrl) || document.value.shots.some(s => (s.imageNodeId && !s.imageUrl) || (s.videoNodeId && !s.videoUrl))
      if (pendingMedia && !busy.value && !saving.value && !saveFailure) { try { await syncMedia() } catch (e) { error.value = e.message } }
      scheduleMediaSync()
    }, 5000)
  }
  async function batchMedia(kind, items, options) {
    if (busy.value) return
    mediaBusy.value = true; stopMedia = false; error.value = ''
    const newNodes = []
    try {
      await flush()
      const parent = store.nodes.find(n => n.id === nodeId)
      const positions = getScriptResultPositions(parent, store.nodes, items.length, kind)
      for (let i = 0; i < items.length && !stopMedia; i++) {
        assertContext()
        const item = items[i], record = kind === 'asset' ? document.value.assets.find(a => a.id === item.id) : document.value.shots.find(s => s.id === item.id)
        if (!record) continue
        const mediaType = kind === 'video' ? 'video' : 'image', nodeKey = kind === 'asset' ? 'nodeId' : `${mediaType}NodeId`, urlKey = `${mediaType}Url`
        mediaProgress.value = `${i + 1} / ${items.length} · ${item.name}`
        let node = store.nodes.find(n => n.id === record[nodeKey])
        if (record[urlKey]) continue
        try {
          if (!node || !node.data.taskId || node.data.status === 'error') {
            node = { id: `${mediaType}_${crypto.randomUUID()}`, type: mediaType, position: positions[i], data: { title: item.name, prompt: item.prompt, model: options.model, selectedModel: options.model, imageSize: options.size, aspectRatio: options.aspectRatio, duration: options.duration || record.duration, status: 'idle', scriptNodeId: nodeId, scriptMediaKind: kind } }
            await connectNode(node, kind === 'asset'); newNodes.push(node.id)
            record[nodeKey] = node.id
            await save()
            const refs = kind === 'asset' ? [] : record.assetIds.map(id => document.value.assets.find(a => a.id === id)?.imageUrl).filter(Boolean)
            const params = { prompt: item.prompt, model: options.model, image_size: options.size, aspectRatio: options.aspectRatio, quality: options.quality, duration: String(options.duration || record.duration) }
            const response = mediaType === 'video' ? await (record.imageUrl ? generateVideoFromImage({ ...params, imageUrl: record.imageUrl }) : generateVideoFromText(params)) : await (refs.length ? generateImageFromImage({ ...params, images: refs }) : generateImageFromText(params))
            const taskId = response.task_id || response.id
            const immediateUrl = getTaskMediaUrl(response, mediaType)
            const patch = { taskId: taskId || null, taskType: mediaType, status: taskId ? 'processing' : immediateUrl ? 'success' : 'error', processingStartedAt: Date.now(), ...(immediateUrl ? { output: { type: mediaType, url: immediateUrl } } : {}) }
            await persistCanvasNode(node, patch, true)
            assertContext()
            store.updateNodeData(node.id, patch)
            node = store.nodes.find(n => n.id === node.id)
            if (!taskId && !immediateUrl) throw new Error('生成服务未返回任务或媒体')
          }
          const result = node.data.output?.url ? { url: node.data.output.url } : await pollTaskStatus(node.data.taskId, mediaType, { timeout: mediaType === 'video' ? 40 * 60000 : 8 * 60000 })
          assertContext()
          const url = getTaskMediaUrl(result, mediaType)
          if (!url) throw new Error('生成结果缺少媒体地址')
          const patch = { status: 'success', output: { type: mediaType, url }, [urlKey]: url, error: null }
          store.updateNodeData(node.id, patch); await persistCanvasNode(node, patch)
          record[urlKey] = url; await save()
        } catch (e) {
          assertContext()
          error.value = `${item.name}：${e.message}。已完成项保留，可稍后重试缺项。`
          // A polling/network failure does not prove upstream failure. Keep task ID for recovery.
          let confirmedFailure = !node?.data.taskId
          if (node?.data.taskId) {
            try {
              const state = await (mediaType === 'video' ? getVideoTaskStatus(node.data.taskId) : getImageTaskStatus(node.data.taskId))
              confirmedFailure = classifyBackgroundTaskStatus(state, mediaType).state === 'failed'
            } catch { /* Network uncertainty must retain the task for recovery, not submit twice. */ }
          }
          if (node && confirmedFailure) { const patch = { status: 'error', error: e.message }; store.updateNodeData(node.id, patch); await persistCanvasNode(node, patch) }
          if (/积分|套餐|并发|尚未保存/.test(e.message)) break
        }
      }
      if (newNodes.length > 1) {
        const group = store.createVisibleGroup(newNodes, `${document.value.title} · ${kind === 'asset' ? '资产' : kind === 'video' ? '视频' : '分镜'}`)
        if (group) {
          const nodes = store.nodes.filter(n => newNodes.includes(n.id) || n.id === group.id)
          for (const node of nodes) await persistCanvasNode(node, node.data)
        }
      }
      await syncMedia()
    } catch (e) { error.value = e.message } finally { mediaBusy.value = false; mediaProgress.value = ''; if (alive) scheduleMediaSync(); window.dispatchEvent(new CustomEvent('user-info-updated')) }
  }
  function stopBatch() { stopMedia = true; mediaProgress.value = '当前任务完成后停止，可继续生成缺项' }
  onUnmounted(() => { alive = false; stopMedia = true; clearTimeout(timer); clearTimeout(mediaTimer) })
  return { document, config, task, error, saving, loading, loaded, busy, running, mediaBusy, mediaProgress, steps, load, save, generate, cancel, createSource, batchMedia, stopBatch, syncMedia, attachAssetPicture, store }
}
