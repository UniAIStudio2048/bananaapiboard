/**
 * Canvas 工作流 API
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { uploadCanvasFile } from './direct-upload.js'
import { prepareWorkflowSaveBody } from '@/utils/workflowMediaUpload.js'
import { canvasEditLease, getCanvasSessionId } from './editLease.js'
import { isStaleTaskResultForInFlightNode } from '@/utils/canvasTaskResultGuard.js'

/**
 * 获取带认证的请求头（包含用户token和租户信息）
 */
function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

// 标签页级编辑会话标识，与编辑租约、WebSocket clientId 共用
function getCanvasClientId() {
  return getCanvasSessionId()
}

/** 只读会话（他人持有编辑权）不发写入请求 */
function assertWorkflowWritable(workflowId) {
  if (workflowId && canvasEditLease.isReadonly(workflowId)) {
    const err = new Error('工作流正在其他会话中编辑，当前为只读')
    err.code = 'edit_lease_readonly'
    err.status = 409
    throw err
  }
}

/** 服务端以租约冲突拒绝写入时切为只读，并记录当前持有者 */
function noteLeaseRejection(workflowId, err, leaseHeaders = {}) {
  if (workflowId && (err?.code === 'edit_lease_lost' || err?.code === 'edit_lease_held')) {
    canvasEditLease.markLost(workflowId, err.holder || null, err.code, leaseHeaders['X-Canvas-Lease-Token'] ?? null)
  }
}

function holdsWorkflowLease(workflowId) {
  return Boolean(workflowId) && canvasEditLease.getState(workflowId)?.mode === 'editor'
}

/**
 * 版本冲突时以服务端为准合并写回字段：持有编辑权时另一个写入方只可能是服务端写回
 * （视频/技能/脚本结果），因此只用服务端的结果字段覆盖本地，其余字段保留本地修改。
 */
async function rebaseConflictingNodes(body, serverVersions) {
  const SERVER_OWNED_FIELDS = ['output', 'status', 'progress', 'error', 'audioUrl', 'audioData', 'scriptDocument', 'scriptSummary']
  const base = body.baseNodeVersions || {}
  const ids = (body.nodes || [])
    .map(node => node?.id)
    .filter(id => id && serverVersions[id] != null && serverVersions[id] !== base[id])
  if (!body.id || ids.length === 0) return
  const serverNodes = []
  for (let i = 0; i < ids.length; i += 50) {
    const result = await getWorkflowNodesBatch(body.id, ids.slice(i, i + 50))
    serverNodes.push(...(result?.nodes || []))
  }
  const localById = new Map((body.nodes || []).map(node => [node?.id, node]))
  const patches = new Map()
  for (const node of serverNodes) {
    // 本地已重新提交生成而服务端仍是上一次任务的结果（增量写入尚未落库）：保留本地，避免节点跳回旧视频
    if (isStaleTaskResultForInFlightNode(localById.get(node?.id)?.data, node?.data)) continue
    const data = {}
    for (const field of SERVER_OWNED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(node?.data || {}, field)) data[field] = node.data[field]
    }
    if (Object.keys(data).length > 0) patches.set(node.id, { id: node.id, version: node.version, data })
  }
  if (patches.size === 0) return
  body.nodes = body.nodes.map(node => patches.has(node.id)
    ? { ...node, data: { ...(node.data || {}), ...patches.get(node.id).data } }
    : node)
  try {
    const { useCanvasStore } = await import('@/stores/canvas/canvasStore')
    const store = useCanvasStore()
    for (const patch of patches.values()) store.applyIncrementalNode?.(patch, { remote: true })
  } catch {
    // 非 Vue/测试环境不需要同步画布状态
  }
}

export function normalizeLoadedWorkflow(workflow) {
  if (!workflow || typeof workflow !== 'object') return workflow
  const collabRevision = workflow.collabRevision ?? workflow.collab_revision
  const collabEpoch = workflow.collabEpoch ?? workflow.collab_epoch
  return {
    ...workflow,
    ...(collabRevision != null ? { collabRevision: Number(collabRevision) || 0 } : {}),
    ...(collabEpoch ? { collabEpoch: String(collabEpoch) } : {})
  }
}

async function syncSavedWorkflowVersions(data) {
  if (!data?.workflow?.node_versions && data?.workflow?.collab_revision == null && !data?.workflow?.collab_epoch) return
  const { useCanvasStore } = await import('@/stores/canvas/canvasStore')
  const store = useCanvasStore()
  if (data?.workflow?.node_versions) store.applyWorkflowSaveVersions(data.workflow)
  if (typeof store.setCollaborationState === 'function') {
    store.setCollaborationState({
      workflowId: data.workflow.id,
      collabRevision: data.workflow.collab_revision,
      collabEpoch: data.workflow.collab_epoch
    })
  }
}

async function syncCollaborationResponse(data, workflowId) {
  if (data?.collabRevision == null && !data?.collabEpoch) return
  try {
    const { useCanvasStore } = await import('@/stores/canvas/canvasStore')
    useCanvasStore().setCollaborationState?.({
      workflowId: data.workflowId || workflowId,
      collabRevision: data.collabRevision,
      collabEpoch: data.collabEpoch
    })
  } catch {
    // 非 Vue/测试环境不需要同步 Pinia 状态。
  }
}

/**
 * 获取用户存储配额
 */
export async function getStorageQuota() {
  const response = await fetch(getApiUrl(`/api/canvas/storage/quota`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '获取配额失败')
  }

  return response.json()
}

async function requestWorkflowSave(jsonBody, workflowId = null) {
  const leaseHeaders = workflowId ? canvasEditLease.getLeaseHeaders(workflowId) : {}
  const response = await fetch(getApiUrl(`/api/canvas/workflows`), {
    method: 'POST',
    credentials: 'include',
    headers: { ...getAuthHeaders(), ...leaseHeaders },
    body: jsonBody
  })

  const text = await response.text()
  if (!text) {
    if (!response.ok) throw new Error(`保存失败 (HTTP ${response.status})`)
    return { success: true }
  }

  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw new Error(`服务器响应格式错误: ${text.substring(0, 100)}`)
  }
  if (!response.ok) {
    const err = new Error(data.message || data.error || '保存失败')
    err.code = data.code || data.error
    err.status = response.status
    err.nodeVersions = data.node_versions || null
    err.holder = data.holder || null
    noteLeaseRejection(workflowId, err, leaseHeaders)
    throw err
  }
  return data
}

/**
 * 保存请求统一入口：旧版完整保存遇到服务端媒体回写造成的版本冲突时，
 * 使用服务端返回的节点基线重试一次。协作协议的完整快照不能这样重试，
 * 否则会把其他成员已提交的节点覆盖掉。
 */
async function saveWorkflowWithConflictRetry(jsonBody) {
  let workflowId = null
  try {
    workflowId = JSON.parse(jsonBody)?.id || null
  } catch {
    // 格式错误交给服务端返回
  }
  assertWorkflowWritable(workflowId)
  const preparedBody = await prepareWorkflowSaveBody(jsonBody, uploadCanvasFile)
  let requestBody = preparedBody
  try {
    const parsedBody = JSON.parse(preparedBody)
    if (parsedBody.spaceType === 'team' && parsedBody.protocolVersion == null) {
      requestBody = JSON.stringify({
        ...parsedBody,
        protocolVersion: 2,
        baseRevision: Number.isSafeInteger(Number(parsedBody.baseRevision)) && Number(parsedBody.baseRevision) >= 0
          ? Number(parsedBody.baseRevision)
          : 0
      })
    }
  } catch {
    // 保留原始请求体，让服务端返回格式错误。
  }
  if (workflowId) await flushIncrementalWritesBeforeSave()
  // 增量写入与服务端写回会在重试间隙继续推进节点版本：每次按服务端返回的最新基线重试，最多 3 次
  const MAX_CONFLICT_RETRIES = 3
  let parsedBody = null
  for (let attempt = 0; ; attempt++) {
    try {
      return await requestWorkflowSave(parsedBody ? JSON.stringify(parsedBody) : requestBody, workflowId)
    } catch (error) {
      if (error.code !== 'version_conflict' || !error.nodeVersions || attempt >= MAX_CONFLICT_RETRIES) throw error

      if (!parsedBody) {
        try {
          parsedBody = JSON.parse(requestBody)
        } catch {
          throw error
        }
      }
      // 协作快照仅在持有编辑权（单一写入方）时才允许按服务端基线重试
      if (parsedBody.protocolVersion === 2 && !holdsWorkflowLease(workflowId)) throw error

      await rebaseConflictingNodes(parsedBody, error.nodeVersions)
      await syncSavedWorkflowVersions({ workflow: { node_versions: error.nodeVersions } })
      parsedBody.baseNodeVersions = error.nodeVersions
    }
  }
}

/** 整份保存前发完排队中的增量写入，避免保存期间增量写入推进节点版本造成冲突 */
async function flushIncrementalWritesBeforeSave() {
  try {
    const { useCanvasStore } = await import('@/stores/canvas/canvasStore')
    await useCanvasStore().flushIncrementalWriter?.()
  } catch {
    // 非 Vue/测试环境或写入暂停时不阻断整份保存
  }
}

/**
 * 保存工作流（接受已序列化的 JSON 字符串，避免主线程重复 stringify）
 *
 * 主要给 Web Worker 化的 autosave 路径使用：autoSave 在 worker 内做完
 * JSON.stringify 后直接传字符串过来，省一次同步序列化。
 */
export async function saveWorkflowRaw(jsonBody) {
  if (typeof jsonBody !== 'string') {
    throw new TypeError('saveWorkflowRaw 要求 jsonBody 为字符串')
  }
  const data = await saveWorkflowWithConflictRetry(jsonBody)
  await syncSavedWorkflowVersions(data)
  return data
}

/**
 * 保存工作流
 */
export async function saveWorkflow(workflowData) {
  const data = await saveWorkflowWithConflictRetry(JSON.stringify(workflowData))
  await syncSavedWorkflowVersions(data)
  return data
}

/**
 * 加载工作流
 */
export async function loadWorkflow(workflowId) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '加载失败')
  }
  
  const data = await response.json()
  if (data?.workflow) data.workflow = normalizeLoadedWorkflow(data.workflow)
  return data
}

/**
 * Phase 2.4 — 获取工作流轻量 manifest（位置/类型/尺寸/version）
 * 用于首屏快速渲染 Shell 节点，避免一次性下载所有节点的 data
 */
export async function getWorkflowManifest(workflowId) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}/manifest`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    let err = {}
    try { err = await response.json() } catch {}
    throw new Error(err.error || `获取 manifest 失败 (HTTP ${response.status})`)
  }
  return response.json()
}

/**
 * Phase 2.4 — 按节点 id 批量获取节点 data
 * 一次最多 50 个；超过会被服务端截断。
 *
 * @returns {{ workflowId, nodes: Array<NodeFull>, missing: string[] }}
 */
export async function getWorkflowNodesBatch(workflowId, nodeIds) {
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
    return { workflowId, nodes: [], missing: [] }
  }
  const ids = nodeIds.slice(0, 50).join(',')
  const url = getApiUrl(`/api/canvas/workflows/${workflowId}/nodes?ids=${encodeURIComponent(ids)}`)
  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    let err = {}
    try { err = await response.json() } catch {}
    throw new Error(err.error || `批量加载节点失败 (HTTP ${response.status})`)
  }
  return response.json()
}

/** 获取指定 revision 之后的协作操作。 */
export async function getWorkflowOps(workflowId, afterRevision = 0) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}/ops?afterRevision=${encodeURIComponent(afterRevision)}`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    let err = {}
    try { err = await response.json() } catch {}
    const error = new Error(err.error || `获取协作操作失败 (HTTP ${response.status})`)
    error.code = err.code
    error.status = response.status
    throw error
  }
  return response.json()
}

/**
 * Phase 2.4 — 增量更新单节点（带乐观锁）
 */
export async function patchWorkflowNode(workflowId, nodeId, patch, baseVersion, collaboration = {}) {
  const collab = {
    protocolVersion: 2,
    clientId: collaboration.clientId || getCanvasClientId(),
    opId: collaboration.opId || `patch:${workflowId}:${nodeId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    ...collaboration
  }
  const body = {
    patch,
    baseVersion,
    ...collab
  }
  assertWorkflowWritable(workflowId)
  const leaseHeaders = canvasEditLease.getLeaseHeaders(workflowId)
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}`), {
    method: 'PATCH',
    credentials: 'include',
    headers: { ...getAuthHeaders(), ...leaseHeaders, 'X-Canvas-Client-Id': collab.clientId },
    body: JSON.stringify(body)
  })
  if (response.status === 409) {
    let body = {}
    try { body = await response.json() } catch {}
    const err = new Error(body.error || '节点版本冲突')
    err.code = body.code || 'VERSION_CONFLICT'
    err.currentVersion = body.currentVersion
    err.currentRevision = body.currentRevision
    err.currentEpoch = body.currentEpoch
    err.holder = body.holder || null
    noteLeaseRejection(workflowId, err, leaseHeaders)
    throw err
  }
  if (!response.ok) {
    let body = {}
    try { body = await response.json() } catch {}
    throw new Error(body.error || `更新节点失败 (HTTP ${response.status})`)
  }
  const data = await response.json()
  await syncCollaborationResponse(data, workflowId)
  return data
}

/**
 * Phase 2.5 — 批量提交 ops（事务执行 + 返回新 version）
 */
export async function postWorkflowOps(workflowId, ops, collaboration = {}) {
  if (!Array.isArray(ops) || ops.length === 0) {
    return { workflowId, applied: [], results: [] }
  }
  const collab = {
    protocolVersion: 2,
    clientId: collaboration.clientId || getCanvasClientId(),
    ...collaboration
  }
  const normalizedOps = ops.map((op, index) => ({
    ...op,
    opId: op.opId || op.op_id || op._id || `op:${workflowId}:${Date.now()}:${index}:${Math.random().toString(36).slice(2)}`
  }))
  assertWorkflowWritable(workflowId)
  const leaseHeaders = canvasEditLease.getLeaseHeaders(workflowId)
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}/ops`), {
    method: 'POST',
    credentials: 'include',
    headers: { ...getAuthHeaders(), ...leaseHeaders, 'X-Canvas-Client-Id': collab.clientId },
    body: JSON.stringify({ ops: normalizedOps, ...collab })
  })
  if (!response.ok) {
    let body = {}
    try { body = await response.json() } catch {}
    const err = new Error(body.error || `批量 ops 失败 (HTTP ${response.status})`)
    err.status = response.status
    err.body = body
    err.code = body.code
    err.holder = body.holder || null
    noteLeaseRejection(workflowId, err, leaseHeaders)
    throw err
  }
  const data = await response.json()
  await syncCollaborationResponse(data, workflowId)
  return data
}

/**
 * 获取工作流列表
 * @param {Object} params - 查询参数
 * @param {number} params.page - 页码
 * @param {number} params.pageSize - 每页数量
 * @param {string} params.spaceType - 空间类型 (personal/team/all)
 * @param {string} params.teamId - 团队ID (spaceType=team时需要)
 */
export async function getWorkflowList(params = {}) {
  const queryParams = new URLSearchParams({
    page: params.page || 1,
    pageSize: params.pageSize || 20,
    ...(params.status && { status: params.status }),
    ...(params.orderBy && { orderBy: params.orderBy }),
    ...(params.orderDir && { orderDir: params.orderDir }),
    ...(params.spaceType && { spaceType: params.spaceType }),
    ...(params.teamId && { teamId: params.teamId }),
    ...(params.projectId && { projectId: params.projectId })
  })
  
  const response = await fetch(getApiUrl(`/api/canvas/workflows?${queryParams}`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '获取列表失败')
  }
  
  return response.json()
}

/**
 * 删除工作流
 */
export async function deleteWorkflow(workflowId) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}`), {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '删除失败')
  }
  
  return response.json()
}

/**
 * 重命名工作流
 */
export async function renameWorkflow(workflowId, newName) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}/rename`), {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ name: newName })
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || '重命名失败')
  }
  
  return response.json()
}

/**
 * 获取工作流版本历史
 */
export async function getWorkflowVersions(workflowId) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}/versions`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '获取版本失败')
  }
  
  return response.json()
}

/**
 * 获取工作流模板
 */
export async function getWorkflowTemplates() {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/templates`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '获取模板失败')
  }
  
  return response.json()
}

/**
 * 恢复到指定版本
 */
export async function restoreWorkflowVersion(workflowId, versionNumber) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}/restore`), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ versionNumber })
  })
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || '恢复失败')
  }
  
  return response.json()
}

/**
 * 本地存储工作流（浏览器LocalStorage）
 */
export function saveWorkflowLocal(workflow) {
  try {
    const key = `workflow_${workflow.id}`
    localStorage.setItem(key, JSON.stringify(workflow))
    
    // 更新工作流列表
    const list = getWorkflowsLocal()
    const existingIndex = list.findIndex(w => w.id === workflow.id)
    
    const workflowMeta = {
      id: workflow.id,
      name: workflow.name,
      nodeCount: workflow.nodes?.length || 0,
      updatedAt: Date.now()
    }
    
    if (existingIndex >= 0) {
      list[existingIndex] = workflowMeta
    } else {
      list.unshift(workflowMeta)
    }
    
    localStorage.setItem('workflows_list', JSON.stringify(list))
    
    return { success: true, workflow: workflowMeta }
  } catch (error) {
    console.error('[LocalStorage] 保存工作流失败:', error)
    throw new Error('本地保存失败，可能是存储空间不足')
  }
}

/**
 * 从本地存储加载工作流
 */
export function loadWorkflowLocal(workflowId) {
  try {
    const key = `workflow_${workflowId}`
    const data = localStorage.getItem(key)
    
    if (!data) {
      throw new Error('工作流不存在')
    }
    
    return JSON.parse(data)
  } catch (error) {
    console.error('[LocalStorage] 加载工作流失败:', error)
    throw error
  }
}

/**
 * 获取本地存储的工作流列表
 */
export function getWorkflowsLocal() {
  try {
    const data = localStorage.getItem('workflows_list')
    return data ? JSON.parse(data) : []
  } catch (error) {
    console.error('[LocalStorage] 获取列表失败:', error)
    return []
  }
}

/**
 * 删除本地存储的工作流
 */
export function deleteWorkflowLocal(workflowId) {
  try {
    const key = `workflow_${workflowId}`
    localStorage.removeItem(key)
    
    // 更新列表
    const list = getWorkflowsLocal()
    const newList = list.filter(w => w.id !== workflowId)
    localStorage.setItem('workflows_list', JSON.stringify(newList))
    
    return { success: true }
  } catch (error) {
    console.error('[LocalStorage] 删除工作流失败:', error)
    throw error
  }
}

/**
 * 上传画布媒体文件到云存储（图片、视频、音频）
 * 内置自动重试（最多3次）和超时控制，适应带宽不稳定场景
 * 
 * @param {File} file - 要上传的文件
 * @param {string} type - 文件类型：'image' | 'video' | 'audio'
 * @param {object} retryOptions - 重试选项 { maxRetries, baseDelay, timeoutMs }
 * @returns {Promise<{url: string, isCloud: boolean}>}
 */
export async function uploadCanvasMedia(file, type = 'image', retryOptions = {}) {
  return uploadCanvasFile(file, type, retryOptions)
}

export async function extractVideoFrame({ videoUrl, time = 0, mode = 'time', nodeId = '', signal }) {
  const response = await fetch(getApiUrl(`/api/videos/extract-frame`), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    signal,
    body: JSON.stringify({ videoUrl, time, mode, nodeId })
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.url) {
    throw new Error(data.message || data.error || '视频帧截取失败')
  }

  return data
}

/**
 * 批量上传画布媒体文件
 * 
 * @param {Array<{file: File, type: string, nodeId: string}>} files - 文件列表
 * @param {Function} onProgress - 进度回调 (nodeId, status, url?)
 * @returns {Promise<Map<string, string>>} - nodeId -> url 映射
 */
export async function uploadCanvasMediaBatch(files, onProgress) {
  const results = new Map()
  
  for (const { file, type, nodeId } of files) {
    try {
      if (onProgress) onProgress(nodeId, 'uploading')
      
      const result = await uploadCanvasMedia(file, type)
      results.set(nodeId, result.url)
      
      if (onProgress) onProgress(nodeId, 'success', result.url)
    } catch (error) {
      console.error(`[Canvas] 文件上传失败 (${nodeId}):`, error.message)
      if (onProgress) onProgress(nodeId, 'error', null, error.message)
    }
  }
  
  return results
}
