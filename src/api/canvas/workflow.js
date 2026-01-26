/**
 * Canvas 工作流 API
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

/**
 * 获取API基础URL（动态获取，确保每次请求时都是最新的）
 */
function getApiBase() {
  // getApiUrl 期望传入路径参数，传入空字符串获取基础URL
  const url = getApiUrl('')
  // 如果返回空或undefined，使用空字符串（相对路径）
  return url || ''
}

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
  const response = await fetch(`${getApiBase()}/api/canvas/storage/quota`, {
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
 * 保存工作流
 */
export async function saveWorkflow(workflowData) {
  const response = await fetch(`${getApiBase()}/api/canvas/workflows`, {
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
  const response = await fetch(`${getApiBase()}/api/canvas/workflows/${workflowId}`, {
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
    ...(params.teamId && { teamId: params.teamId })
  })
  
  const response = await fetch(`${getApiBase()}/api/canvas/workflows?${queryParams}`, {
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
  const response = await fetch(`${getApiBase()}/api/canvas/workflows/${workflowId}`, {
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
  const response = await fetch(`${getApiBase()}/api/canvas/workflows/${workflowId}/rename`, {
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
  const response = await fetch(`${getApiBase()}/api/canvas/workflows/${workflowId}/versions`, {
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
  const response = await fetch(`${getApiBase()}/api/canvas/workflows/templates`, {
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
  const response = await fetch(`${getApiBase()}/api/canvas/workflows/${workflowId}/restore`, {
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
 * 这个函数用于将用户本地上传的文件异步上传到七牛云，避免工作流数据过大
 * 
 * @param {File} file - 要上传的文件
 * @param {string} type - 文件类型：'image' | 'video' | 'audio'
 * @returns {Promise<{url: string, isCloud: boolean}>}
 */
export async function uploadCanvasMedia(file, type = 'image') {
  const token = localStorage.getItem('token')
  const headers = {
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
  
  const formData = new FormData()
  
  // 根据文件类型选择不同的上传端点
  let uploadUrl
  if (type === 'image') {
    formData.append('images', file)
    uploadUrl = `${getApiBase()}/api/images/upload`
  } else if (type === 'video') {
    formData.append('file', file)
    uploadUrl = `${getApiBase()}/api/videos/upload`
  } else if (type === 'audio') {
    formData.append('file', file)
    uploadUrl = `${getApiBase()}/api/canvas/upload-audio`
  } else {
    throw new Error(`不支持的文件类型: ${type}`)
  }
  
  console.log(`[Canvas] 开始上传${type}文件到云存储:`, file.name, '大小:', Math.round(file.size / 1024), 'KB')
  
  const response = await fetch(uploadUrl, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: formData
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || `${type}上传失败`)
  }
  
  const data = await response.json()
  const url = data.url || (data.urls && data.urls[0])
  
  if (!url) {
    throw new Error('上传成功但未返回URL')
  }
  
  console.log(`[Canvas] ${type}文件上传成功:`, url)
  
  return {
    url,
    isCloud: true
  }
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
