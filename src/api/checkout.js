import { getTenantHeaders, getApiUrl } from '@/config/tenant'

async function request(path, { signal, body, key, method = 'GET' } = {}) {
  const headers = { ...getTenantHeaders(), Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
  const form = body instanceof FormData
  if (body && !form) headers['Content-Type'] = 'application/json'
  if (key) headers['Idempotency-Key'] = key
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 25000)
  try {
    const response = await fetch(getApiUrl(`/api/checkout${path}`), { method, headers, signal: controller.signal, body: body ? (form ? body : JSON.stringify(body)) : undefined })
    const data = await response.json()
    if (!response.ok) throw new Error(data.message || data.error || '支付请求失败')
    return data
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}
export const checkoutApi = {
  methods: async (kind, signal) => (await request(`/methods?kind=${encodeURIComponent(kind)}`, { signal })).methods,
  create: (input, key, signal) => request('/orders', { method: 'POST', body: { ...input, frontend_url: window.location.origin }, key, signal }),
  attempt: (id, methodId, key, signal) => request(`/orders/${id}/attempts`, { method: 'POST', body: { method_id: methodId }, key, signal }),
  status: (id, signal) => request(`/orders/${id}`, { signal }),
  list: async () => (await request('/orders')).orders,
  submit: (id, body, signal) => request(`/attempts/${id}/receipt`, { method: 'POST', body, signal })
}
