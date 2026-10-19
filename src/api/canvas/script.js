import { getApiUrl, getTenantHeaders } from '@/config/tenant'
export async function scriptRequest(path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(getApiUrl(`/api/canvas/script${path}`), { method, credentials: 'include', headers: { 'Content-Type': 'application/json', ...getTenantHeaders(), Authorization: `Bearer ${localStorage.getItem('token') || ''}` }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.message || '脚本请求失败'), { status: response.status })
  return result
}
