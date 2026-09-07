import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { WORKFLOW_SHARE_MODES } from '@/utils/workflowShare'

function getRequestHeaders({ includeJson = false, idempotencyKey = '' } = {}) {
  const token = localStorage.getItem('token')
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
  }
}

async function parseResponse(response, fallbackMessage) {
  let payload = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }

  if (!response.ok) {
    const error = new Error(payload.message || payload.error || fallbackMessage)
    error.status = response.status
    error.code = payload.error || ''
    error.body = payload
    throw error
  }

  return payload
}

function getSharePath(workflowId) {
  return `/api/canvas/workflows/${encodeURIComponent(workflowId)}/share`
}

export async function getWorkflowShare(workflowId) {
  const response = await fetch(getApiUrl(getSharePath(workflowId)), {
    method: 'GET',
    credentials: 'include',
    headers: getRequestHeaders()
  })
  return parseResponse(response, '获取分享状态失败')
}

export async function getWorkflowShareStatus(workflowId) {
  const response = await fetch(getApiUrl(`${getSharePath(workflowId)}-status`), {
    method: 'GET',
    credentials: 'include',
    headers: getRequestHeaders()
  })
  return parseResponse(response, '获取团队分享状态失败')
}

export async function updateWorkflowShare(workflowId, mode) {
  if (!WORKFLOW_SHARE_MODES.includes(mode)) {
    throw new TypeError('无效的工作流分享模式')
  }

  const response = await fetch(getApiUrl(getSharePath(workflowId)), {
    method: 'PUT',
    credentials: 'include',
    headers: getRequestHeaders({ includeJson: true }),
    body: JSON.stringify({ mode, confirmed: true })
  })
  return parseResponse(response, '更新分享设置失败')
}

export async function resetWorkflowShare(workflowId) {
  const response = await fetch(getApiUrl(`${getSharePath(workflowId)}/reset`), {
    method: 'POST',
    credentials: 'include',
    headers: getRequestHeaders({ includeJson: true }),
    body: JSON.stringify({})
  })
  return parseResponse(response, '重置分享链接失败')
}

export async function getPublicWorkflowShare(token) {
  const response = await fetch(getApiUrl(`/api/workflow-shares/${encodeURIComponent(token)}`), {
    method: 'GET',
    credentials: 'include',
    headers: getRequestHeaders()
  })
  return parseResponse(response, '加载工作流分享失败')
}

function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const randomPart = Math.random().toString(16).slice(2).padEnd(30, '0')
  return `${Date.now().toString(16).padStart(8, '0')}-${randomPart.slice(0, 4)}-4${randomPart.slice(4, 7)}-8${randomPart.slice(7, 10)}-${randomPart.slice(10, 22)}`
}

export async function clonePublicWorkflowShare(token, sourceRevision, idempotencyKey = createIdempotencyKey()) {
  const response = await fetch(getApiUrl(`/api/workflow-shares/${encodeURIComponent(token)}/clone`), {
    method: 'POST',
    credentials: 'include',
    headers: getRequestHeaders({ includeJson: true, idempotencyKey }),
    body: JSON.stringify({ sourceRevision })
  })
  return parseResponse(response, '克隆工作流失败')
}
