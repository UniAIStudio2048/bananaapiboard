/**
 * Canvas Workflow API
 * 工作流保存/加载相关 API
 */
import { getApiUrl, getTenantHeaders } from '@/config/tenant'

// 获取通用请求头
function getHeaders(options = {}) {
  const token = localStorage.getItem('token')
  return {
    ...getTenantHeaders(),
    ...(options.json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.extra
  }
}

/**
 * 获取用户的工作流列表
 */
export async function getWorkflows() {
  const response = await fetch(getApiUrl('/api/canvas/workflows'), {
    headers: getHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '获取工作流列表失败')
  }
  
  return response.json()
}

/**
 * 获取单个工作流详情
 */
export async function getWorkflow(id) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${id}`), {
    headers: getHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '获取工作流失败')
  }
  
  return response.json()
}

/**
 * 保存工作流
 */
export async function saveWorkflow(workflow) {
  const method = workflow.id ? 'PUT' : 'POST'
  const url = workflow.id 
    ? getApiUrl(`/api/canvas/workflows/${workflow.id}`)
    : getApiUrl('/api/canvas/workflows')
  
  const response = await fetch(url, {
    method,
    headers: getHeaders({ json: true }),
    body: JSON.stringify(workflow)
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '保存工作流失败')
  }
  
  return response.json()
}

/**
 * 删除工作流
 */
export async function deleteWorkflow(id) {
  const response = await fetch(getApiUrl(`/api/canvas/workflows/${id}`), {
    method: 'DELETE',
    headers: getHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '删除工作流失败')
  }
  
  return response.json()
}

/**
 * 获取工作流模板列表
 */
export async function getWorkflowTemplates() {
  const response = await fetch(getApiUrl('/api/canvas/templates'), {
    headers: getHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '获取模板列表失败')
  }
  
  return response.json()
}

/**
 * 获取单个模板详情
 */
export async function getWorkflowTemplate(id) {
  const response = await fetch(getApiUrl(`/api/canvas/templates/${id}`), {
    headers: getHeaders()
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '获取模板失败')
  }
  
  return response.json()
}

/**
 * 本地存储工作流（临时方案）
 */
export function saveWorkflowLocal(workflow) {
  const key = `canvas_workflow_${workflow.id || 'draft'}`
  localStorage.setItem(key, JSON.stringify({
    ...workflow,
    updatedAt: new Date().toISOString()
  }))
}

/**
 * 从本地存储加载工作流
 */
export function loadWorkflowLocal(id = 'draft') {
  const key = `canvas_workflow_${id}`
  const data = localStorage.getItem(key)
  if (data) {
    try {
      return JSON.parse(data)
    } catch (e) {
      return null
    }
  }
  return null
}

/**
 * 获取本地存储的所有工作流
 */
export function getLocalWorkflows() {
  const workflows = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith('canvas_workflow_')) {
      try {
        const data = JSON.parse(localStorage.getItem(key))
        workflows.push(data)
      } catch (e) {
        // 忽略解析错误
      }
    }
  }
  return workflows.sort((a, b) => 
    new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
  )
}

