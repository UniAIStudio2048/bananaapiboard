/**
 * Canvas 项目 API
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

/** 获取项目列表 */
export async function getProjectList(params = {}) {
  const queryParams = new URLSearchParams()
  if (params.spaceType) queryParams.set('spaceType', params.spaceType)
  if (params.teamId) queryParams.set('teamId', params.teamId)

  const qs = queryParams.toString()
  const response = await fetch(getApiUrl(`/api/canvas/projects${qs ? '?' + qs : ''}`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '获取项目列表失败')
  }
  return response.json()
}

/** 创建项目 */
export async function createProject(data) {
  const response = await fetch(getApiUrl(`/api/canvas/projects`), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '创建项目失败')
  }
  return response.json()
}

/** 获取项目详情 */
export async function getProject(id) {
  const response = await fetch(getApiUrl(`/api/canvas/projects/${id}`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '获取项目详情失败')
  }
  return response.json()
}

/** 更新项目 */
export async function updateProject(id, data) {
  const response = await fetch(getApiUrl(`/api/canvas/projects/${id}`), {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '更新项目失败')
  }
  return response.json()
}

/** 删除项目 */
export async function deleteProject(id) {
  const response = await fetch(getApiUrl(`/api/canvas/projects/${id}`), {
    method: 'DELETE',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '删除项目失败')
  }
  return response.json()
}

/** 移动工作流到项目 */
export async function moveWorkflowToProject(workflowId, projectId) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}/move`), {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({ projectId })
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '移动失败')
  }
  return response.json()
}

/** 将单个工作流移动到其他空间/项目 */
export async function transferWorkflowSpace(workflowId, data) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}/transfer-space`), {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '移动工作流失败')
  }
  return response.json()
}

/** 将整个项目及其中工作流移动到其他空间 */
export async function transferProjectSpace(projectId, data) {
  const response = await fetch(getApiUrl(`/api/canvas/projects/${projectId}/transfer-space`), {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '移动项目失败')
  }
  return response.json()
}

/** 创建工作流副本到其他空间/项目 */
export async function copyWorkflowToSpace(workflowId, data) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${workflowId}/copy-space`), {
    method: 'POST', credentials: 'include', headers: getAuthHeaders(), body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '创建工作流副本失败')
  }
  return response.json()
}

/** 创建项目副本到其他空间 */
export async function copyProjectToSpace(projectId, data) {
  const response = await fetch(getApiUrl(`/api/canvas/projects/${projectId}/copy-space`), {
    method: 'POST', credentials: 'include', headers: getAuthHeaders(), body: JSON.stringify(data)
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || '创建项目副本失败')
  }
  return response.json()
}
