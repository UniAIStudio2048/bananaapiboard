export function createCheckoutController({ api, onChange = () => {}, onPaid = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  const state = { open: false, methods: [], order: null, attempt: null, selected: null, busy: false, error: '' }
  let input, requestKey, timer, polling, generation = 0, abort, failures = 0, delivered = false
  const key = () => {
    const crypto = globalThis.crypto
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
    if (typeof crypto?.getRandomValues !== 'function') throw new Error('当前浏览器不支持安全支付请求，请升级浏览器后重试')
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  const emit = () => onChange({ ...state })
  const valid = g => state.open && g === generation
  function stopRequest() { if (timer) cancel(timer); timer = null; abort?.abort(); polling = null; abort = new AbortController() }
  function close() { generation++; stopRequest(); state.open = false; state.attempt = null; state.busy = false; emit() }
  function success(order) {
    if (delivered) return
    delivered = true; close(); onPaid(order)
  }
  function updateOrder(order) {
    state.order = order
    if (order.attempts?.length) {
      const current = order.attempts.find(a => a.id === state.attempt?.id)
      if (current) state.attempt = current
    }
    if (order.status === 'paid') { success(order); return true }
    return false
  }
  function queue() {
    if (timer) cancel(timer)
    if (state.open && state.order) timer = schedule(poll, Math.min(3000 * 2 ** failures, 30000))
  }
  function poll() {
    if (polling) return polling
    if (timer) cancel(timer)
    timer = null
    if (!state.open || !state.order || state.busy) return queue()
    const g = generation
    polling = (async () => {
      try {
        const order = await api.status(state.order.id, abort.signal)
        if (!valid(g)) return
        failures = 0; state.error = ''
        if (updateOrder(order)) return
        emit()
      } catch (e) {
        if (!valid(g)) return
        failures++; state.error = '暂时无法查询支付状态，正在重试'; emit()
      } finally {
        if (valid(g)) { polling = null; queue() }
      }
    })()
    return polling
  }
  async function open(payload, existingId) {
    generation++; stopRequest(); input = payload; requestKey = null; delivered = false; failures = 0
    Object.assign(state, { open: true, methods: [], order: null, attempt: null, selected: null, busy: true, error: '' }); emit()
    const g = generation
    try {
      requestKey = key()
      if (existingId) {
        const order = await api.status(existingId, abort.signal)
        if (!valid(g) || updateOrder(order)) return
        input = { kind: order.kind }
        state.attempt = order.attempts?.find(a => a.status === 'pending_review') || order.attempts?.[order.attempts.length - 1] || null
        state.selected = state.attempt?.method_id || null
      }
      const methods = await api.methods(input.kind, abort.signal)
      if (valid(g)) state.methods = methods
    } catch (e) { if (valid(g)) state.error = e.message }
    finally { if (valid(g)) { state.busy = false; emit(); queue() } }
  }
  async function choose(methodId, refresh = false) {
    if (!state.open || state.busy || state.attempt?.status === 'pending_review') return
    if (!refresh && state.selected === methodId && state.attempt && Number(state.attempt.expires_at) > now() && state.attempt.status !== 'creating') return
    generation++; stopRequest(); const g = generation
    state.busy = true; state.error = ''; state.selected = methodId; state.attempt = null; emit()
    try {
      if (!state.order) {
        const order = await api.create(input, requestKey, abort.signal)
        if (!valid(g)) return
        state.order = order
      }
      const attempt = await api.attempt(state.order.id, methodId, key(), abort.signal)
      if (!valid(g)) return
      state.attempt = attempt
      if (attempt.status === 'paid') {
        const order = await api.status(state.order.id, abort.signal)
        if (valid(g)) updateOrder(order)
      }
    } catch (e) { if (valid(g)) state.error = e.message }
    finally { if (valid(g)) { state.busy = false; emit(); queue() } }
  }
  async function refresh() {
    if (!state.order || state.busy) return
    generation++; stopRequest()
    const g = generation; state.busy = true; emit()
    try {
      const order = await api.status(state.order.id, abort.signal)
      if (!valid(g) || updateOrder(order)) return
      state.busy = false
      await choose(state.selected, true)
    } catch (e) { if (valid(g)) { state.error = e.message; queue() } }
    finally { if (valid(g)) { state.busy = false; emit() } }
  }
  return { state, open, close, choose, refresh, poll }
}
