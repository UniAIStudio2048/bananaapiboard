import { getApiUrl, getTenantHeaders } from '@/config/tenant'

function getAuthHeaders(json = false) {
  const token = localStorage.getItem('token')
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...getTenantHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

async function parseGroupResponse(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || data.error || fallbackMessage)
    error.status = response.status
    error.body = data
    throw error
  }
  return data
}

function buildQuery(params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  }
  const text = query.toString()
  return text ? `?${text}` : ''
}

export async function getGroupTeams() {
  const response = await fetch(getApiUrl('/api/group/teams'), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  return parseGroupResponse(response, '加载团队失败')
}

export async function getGroupTeamMembers(teamId) {
  const response = await fetch(getApiUrl(`/api/group/teams/${encodeURIComponent(teamId)}/members`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  return parseGroupResponse(response, '加载成员失败')
}

export async function updateGroupBillingPolicy(teamId, policy) {
  const response = await fetch(getApiUrl(`/api/group/teams/${encodeURIComponent(teamId)}/billing-policy`), {
    method: 'PUT',
    credentials: 'include',
    headers: getAuthHeaders(true),
    body: JSON.stringify({ policy })
  })
  return parseGroupResponse(response, '保存计费策略失败')
}

export async function allocateGroupCredits(teamId, payload) {
  const response = await fetch(getApiUrl(`/api/group/teams/${encodeURIComponent(teamId)}/allocations`), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(true),
    body: JSON.stringify({
      userId: payload.userId || payload.recipientUserId,
      amount: payload.amount,
      expiresAt: payload.expiresAt || 0
    })
  })
  return parseGroupResponse(response, '分配积分失败')
}

export async function revokeGroupAllocation(teamId, allocationId) {
  const response = await fetch(getApiUrl(`/api/group/teams/${encodeURIComponent(teamId)}/allocations/${encodeURIComponent(allocationId)}/revoke`), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(true),
    body: JSON.stringify({})
  })
  return parseGroupResponse(response, '收回积分失败')
}

export async function revokeAllGroupMemberCredits(teamId, userId) {
  const response = await fetch(getApiUrl(`/api/group/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}/revoke-all`), {
    method: 'POST',
    credentials: 'include',
    headers: getAuthHeaders(true),
    body: JSON.stringify({})
  })
  return parseGroupResponse(response, '收回成员积分失败')
}

export async function getGroupLedger(teamId, params = {}) {
  const response = await fetch(getApiUrl(`/api/group/teams/${encodeURIComponent(teamId)}/ledger${buildQuery(params)}`), {
    method: 'GET',
    credentials: 'include',
    headers: getAuthHeaders()
  })
  return parseGroupResponse(response, '加载团队流水失败')
}
