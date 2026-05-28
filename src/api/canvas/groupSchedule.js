import { getApiUrl, getTenantHeaders } from '../../config/tenant.js'

function getAuthHeaders() {
  const token = localStorage.getItem('token')
  return {
    'Content-Type': 'application/json',
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

async function parseJsonResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || data.message || fallbackMessage)
  }
  return data
}

export async function createGroupSchedule(payload) {
  const response = await fetch(getApiUrl('/api/canvas/group-schedules'), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      workflowId: payload.workflowId,
      groupId: payload.groupId,
      scheduledAt: payload.scheduledAt,
      batchCount: payload.batchCount,
      snapshot: payload.snapshot
    })
  })
  return parseJsonResponse(response, '创建定时执行失败')
}

export async function listGroupSchedules(params = {}) {
  const query = new URLSearchParams()
  if (params.workflowId) query.set('workflowId', params.workflowId)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  const response = await fetch(getApiUrl(`/api/canvas/group-schedules${suffix}`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  return parseJsonResponse(response, '获取定时任务失败')
}

export async function getGroupSchedule(scheduleId) {
  const response = await fetch(getApiUrl(`/api/canvas/group-schedules/${encodeURIComponent(scheduleId)}`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  return parseJsonResponse(response, '获取定时任务详情失败')
}

export async function cancelGroupSchedule(scheduleId) {
  const response = await fetch(getApiUrl(`/api/canvas/group-schedules/${encodeURIComponent(scheduleId)}/cancel`), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  return parseJsonResponse(response, '取消定时任务失败')
}

export async function getGroupRun(runId) {
  const response = await fetch(getApiUrl(`/api/canvas/group-runs/${encodeURIComponent(runId)}`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  return parseJsonResponse(response, '获取运行详情失败')
}
