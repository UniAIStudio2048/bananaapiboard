/**
 * Canvas 工作流 API
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { uploadCanvasFile } from './direct-upload.js'

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
  const response = await fetch(getApiUrl(`/api/canvas/workflows`), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
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
  if (!response.ok) throw new Error(data.error || '保存失败')
  return data
}

/**
 * 保存工作流
 */
export async function saveWorkflow(workflowData) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows`), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(workflowData)
  })
  
  // 获取响应文本
  const text = await response.text()
  
  // 如果响应为空
  if (!text) {
    if (!response.ok) {
      throw new Error(`保存失败 (HTTP ${response.status})`)
    }
    return { success: true }
  }
  
  // 解析JSON
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw new Error(`服务器响应格式错误: ${text.substring(0, 100)}`)
  }
  
  if (!response.ok) {
    throw new Error(data.error || '保存失败')
  }
  
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
  
  return response.json()
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

/**
 * Phase 2.4 — 增量更新单节点（带乐观锁）
 */
export async function patchWorkflowNode(workflowId, nodeId, patch, baseVersion) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}/nodes/${encodeURIComponent(nodeId)}`), {
    method: 'PATCH',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ patch, baseVersion })
  })
  if (response.status === 409) {
    let body = {}
    try { body = await response.json() } catch {}
    const err = new Error(body.error || '节点版本冲突')
    err.code = 'VERSION_CONFLICT'
    err.currentVersion = body.currentVersion
    throw err
  }
  if (!response.ok) {
    let body = {}
    try { body = await response.json() } catch {}
    throw new Error(body.error || `更新节点失败 (HTTP ${response.status})`)
  }
  return response.json()
}

/**
 * Phase 2.5 — 批量提交 ops（事务执行 + 返回新 version）
 */
export async function postWorkflowOps(workflowId, ops) {
  if (!Array.isArray(ops) || ops.length === 0) {
    return { workflowId, applied: [], results: [] }
  }
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}/ops`), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ops })
  })
  if (!response.ok) {
    let body = {}
    try { body = await response.json() } catch {}
    const err = new Error(body.error || `批量 ops 失败 (HTTP ${response.status})`)
    err.status = response.status
    err.body = body
    throw err
  }
  return response.json()
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

export async function extractVideoFrame({ videoUrl, time = 0, mode = 'time', nodeId = '' }) {
  const response = await fetch(getApiUrl(`/api/videos/extract-frame`), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
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
