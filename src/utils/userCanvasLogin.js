import { t as translateUi } from '../i18n/index.js'
export async function exchangeUserCanvasLogin({ location, history, apiUrl, tenantHeaders, persistSession, fetchImpl = fetch }) {
  const token = new URLSearchParams(location.hash.slice(1)).get('token')
  history.replaceState(null, '', location.pathname)
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error(translateUi('uiMessages.m950c1b67f68e'))
  const response = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: { ...tenantHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(15_000),
    referrerPolicy: 'no-referrer'
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || translateUi('uiMessages.m827b6b3461dc'))
  if (!data.token || !data.user?.id || data.user.tenant_id !== tenantHeaders['X-Tenant-ID']) throw new Error(translateUi('uiMessages.mf10e63592dfd'))
  persistSession(data.token, data.user)
  return data
}
