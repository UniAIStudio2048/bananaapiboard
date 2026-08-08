import { getApiUrl, getTenantHeaders } from '@/config/tenant'

function headers(json = false) {
  const token = localStorage.getItem('token')
  return {
    ...getTenantHeaders(),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

// 列出会话
export async function getCodexSessions() {
  const response = await fetch(getApiUrl('/api/codex-agent/sessions'), {
    headers: headers(false),
    credentials: 'include'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '加载会话列表失败')
  }
  return response.json()
}

// 获取会话详情
export async function getCodexSession(threadId) {
  const response = await fetch(getApiUrl(`/api/codex-agent/sessions/${encodeURIComponent(threadId)}`), {
    headers: headers(false),
    credentials: 'include'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '加载会话失败')
  }
  return response.json()
}

// 获取会话完整消息列表
export async function getCodexSessionMessages(threadId) {
  const response = await fetch(getApiUrl(`/api/codex-agent/sessions/${encodeURIComponent(threadId)}/messages`), {
    headers: headers(false),
    credentials: 'include'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '加载会话消息失败')
  }
  return response.json()
}

// 删除会话
export async function deleteCodexSession(threadId) {
  const response = await fetch(getApiUrl(`/api/codex-agent/sessions/${encodeURIComponent(threadId)}`), {
    method: 'DELETE',
    headers: headers(false),
    credentials: 'include'
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || '删除会话失败')
  }
  return response.json()
}

/**
 * 送增强模式消息（SSE 流）
 * @param {Object} params
 * @param {string} [params.thread_id] - 续聊时传 thread_id，新建不传
 * @param {string} [params.session_id] - 新建时可指定 session_id
 * @param {string} params.content - 消息内容
 * @param {Array} [params.attachments] - 附件列表 [{key,type,url,name}]
 * @param {Function} [params.onSession] - 收到 session_id
 * @param {Function} [params.onThread] - 收到 thread_id
 * @param {Function} [params.onContent] - 收到 agent_message 文本
 * @param {Function} [params.onToolEvent] - 工具调用事件 {type:'started'|'completed', server, tool, status, result}
 * @param {Function} [params.onDone] - 完成
 * @param {Function} [params.onError] - 错误
 * @param {AbortSignal} [params.signal] - 取消信号
 */
export async function sendCodexMessage(params) {
  const { onSession, onThread, onContent, onToolEvent, onDone, onError, signal, ...requestParams } = params
  const isResume = Boolean(requestParams.thread_id)
  const url = isResume
    ? getApiUrl(`/api/codex-agent/sessions/${encodeURIComponent(requestParams.thread_id)}/messages`)
    : getApiUrl('/api/codex-agent/sessions')
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers(true),
      credentials: 'include',
      body: JSON.stringify(isResume
        ? { content: requestParams.content, skill_id: requestParams.skill_id || null, attachments: requestParams.attachments || [] }
        : { content: requestParams.content, session_id: requestParams.session_id, skill_id: requestParams.skill_id || null, attachments: requestParams.attachments || [] }),
      signal
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || error.error || 'Codex agent 请求失败')
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let sessionId = null
    let threadId = null
    let finalResponse = null
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        if (onDone) onDone({ session_id: sessionId, thread_id: threadId, finalResponse })
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() || ''
      for (const frame of frames) {
        const lines = frame.split('\n')
        let eventName = null
        let data = null
        for (const line of lines) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim()
          if (line.startsWith('data:')) data = line.slice(5).trim()
        }
        if (!eventName || !data) continue
        try {
          const json = JSON.parse(data)
          switch (eventName) {
            case 'session':
              sessionId = json.session_id
              if (onSession) onSession(sessionId)
              break
            case 'thread.started':
              threadId = json.thread_id
              if (onThread) onThread(threadId)
              break
            case 'item.started': {
              const item = json.item || {}
              if (item.type === 'mcp_tool_call') {
                if (onToolEvent) onToolEvent({ type: 'started', server: item.server, tool: item.tool })
              }
              break
            }
            case 'item.completed': {
              const item = json.item || {}
              if (item.type === 'mcp_tool_call') {
                if (onToolEvent) onToolEvent({ type: 'completed', server: item.server, tool: item.tool, status: item.status, result: item.result })
              } else if (item.type === 'agent_message' && item.text) {
                if (onContent) onContent(item.text)
              }
              break
            }
            case 'turn.completed':
              finalResponse = json.finalResponse || finalResponse
              if (finalResponse && onContent) onContent(finalResponse, true)
              break
            case 'turn.failed':
              throw new Error(json.error?.message || 'Codex agent 执行失败')
            case 'done':
              if (json.thread_id) threadId = json.thread_id
              if (onDone) onDone({ session_id: sessionId, thread_id: threadId, finalResponse, usage: json.usage })
              return
          }
        } catch (e) {
          // JSON 解析失败不中断流；其它错误向上抛
          if (e && e.message && !e.message.includes('JSON')) throw e
        }
      }
    }
    return { session_id: sessionId, thread_id: threadId, finalResponse }
  } catch (error) {
    console.error('[Codex-Agent] 流式请求失败:', error)
    if (onError) onError(error)
    throw error
  }
}
