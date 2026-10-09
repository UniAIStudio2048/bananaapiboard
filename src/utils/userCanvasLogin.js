export async function exchangeUserCanvasLogin({ location, history, apiUrl, tenantHeaders, persistSession, fetchImpl = fetch }) {
  const token = new URLSearchParams(location.hash.slice(1)).get('token')
  history.replaceState(null, '', location.pathname)
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('请从租户后台的用户管理页面登录画布')
  const response = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: { ...tenantHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(15_000),
    referrerPolicy: 'no-referrer'
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '登录链接已失效，请返回用户管理页面重新登录')
  if (!data.token || !data.user?.id || data.user.tenant_id !== tenantHeaders['X-Tenant-ID']) throw new Error('画布租户不匹配，请返回用户管理页面')
  persistSession(data.token, data.user)
  return data
}
