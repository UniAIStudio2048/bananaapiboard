import { getApiUrl, getTenantHeaders } from '@/config/tenant'

function headers() {
  const token = localStorage.getItem('token')
  return { ...getTenantHeaders(), 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}
export async function getVideoAnalysisConfig() {
  const response = await fetch(getApiUrl('/api/video-tools/analysis/config'), { headers: headers(), signal: AbortSignal.timeout(15000) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || '视频解析配置加载失败')
  return data
}
export async function waitForVideoAnalysisTask(taskId, { onUpdate, signal, pollIntervalMs = 1000 } = {}) {
  const timeout = AbortSignal.timeout(600000)
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  while (true) {
    const response = await fetch(getApiUrl(`/api/video-tools/analysis/tasks/${encodeURIComponent(taskId)}`), { headers: headers(), signal: requestSignal })
    const data = await response.json()
    if (data.node && data.edge) onUpdate?.(data)
    if (!response.ok || data.error || data.status === 'failed') throw new Error(data.message || '视频解析失败')
    if (data.success && data.node && data.edge) return data
    if (data.status !== 'processing') throw new Error('视频解析状态无效')
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    requestSignal.throwIfAborted()
  }
}
export async function analyzeVideoNode(payload, { onUpdate } = {}) {
  const response = await fetch(getApiUrl('/api/video-tools/analysis'), {
    method: 'POST', headers: headers(), body: JSON.stringify({ ...payload, async: true }), signal: AbortSignal.timeout(600000)
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    if (error.node && error.edge) onUpdate?.(error)
    throw new Error(error.message || '视频解析失败')
  }
  if (!(response.headers.get('content-type') || '').includes('text/event-stream')) {
    const data = await response.json()
    if (data.status === 'processing' && data.taskId && data.node && data.edge) {
      onUpdate?.(data)
      return waitForVideoAnalysisTask(data.taskId, { onUpdate })
    }
    if (!data.success || !data.node || !data.edge) throw new Error(data.message || '视频解析未完成')
    return data
  }
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = '', result
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      if (done && buffer) lines.push(buffer)
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const text = line.slice(5).trim()
        if (!text || text === '[DONE]') continue
        const data = JSON.parse(text)
        if (data.node && data.edge && !data.success) onUpdate?.(data)
        if (data.status === 'processing' && !data.error && data.node && data.edge) continue
        if (data.error || (data.status && !data.success)) throw new Error(data.message || '视频解析失败')
        if (data.success && data.node && data.edge) result = data
      }
      if (done) break
    }
  } finally { reader.releaseLock() }
  if (!result) throw new Error('视频解析未完成，请刷新画布查看结果后再重试')
  return result
}
