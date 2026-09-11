import { getApiUrl, getTenantHeaders } from '@/config/tenant'
import { persistAuthSession } from './client'
import { clearWorkflowSession } from '@/stores/canvas/workflowAutoSave'

export async function smsRequest(path, body, authenticated = false) {
  const token = authenticated ? localStorage.getItem('token') : null
  const response = await fetch(getApiUrl(path), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...getTenantHeaders(), 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000)
  })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error || 'sms_service_unavailable'), { code: result.error, retryAfter: result.retry_after })
  return result
}
export function completeSmsAuthentication(result) {
  persistAuthSession(result.token, result.user)
  localStorage.removeItem('workflow_auto_saves')
  clearWorkflowSession()
  localStorage.removeItem('canvas_background_tasks')
  window.dispatchEvent(new CustomEvent('user-info-updated'))
}
