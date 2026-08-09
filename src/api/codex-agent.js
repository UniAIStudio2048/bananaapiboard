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
 * 订阅 Codex 会话实时流（SSE 重连端点）
 * 用用户重进 running 会话时补发历史事件 + 实时推送后续事件。
 * @param {string} threadId - 会话 thread_id
 * @param {Object} callbacks
 * @param {Function} [callbacks.onStatus] - 收到 turn_status
 * @param {Function} [callbacks.onContent] - 收到 agent_message 文本
 * @param {Function} [callbacks.onToolEvent] - 工具调用事件
 * @param {Function} [callbacks.onDone] - 流结束
 * @param {Function} [callbacks.onError] - 错误
 * @param {AbortSignal} [callbacks.signal] - 取消信号
 */
export async function subscribeCodexStream(threadId, callbacks = {}) {
  const { onStatus, onContent, onToolEvent, onDone, onError, signal } = callbacks
  const url = getApiUrl(`/api/codex-agent/sessions/${encodeURIComponent(threadId)}/stream`)
  try {
    const response = await fetch(url, {
      headers: headers(false),
      credentials: 'include',
      signal
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.message || error.error || 'Codex agent 重连失败')
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        if (onDone) onDone({})
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
            case 'status':
              if (onStatus) onStatus(json.turn_status, json)
              break
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
              if (onContent) onContent(json.finalResponse || '', true)
              break
            case 'done':
              if (onDone) onDone(json)
              return
            case 'heartbeat':
              // 保活心跳，忽略
              break
            case 'turn.failed':
              throw new Error(json.error?.message || 'Codex agent 执行失败')
          }
        } catch (e) {
          if (e && e.message && !e.message.includes('JSON')) throw e
        }
      }
    }
  } catch (error) {
    if (error?.name === 'AbortError') return // 静默取消
    console.error('[Codex-Agent] 重连流式请求失败:', error)
    if (onError) onError(error)
  }
}

/**
 * 送增强模式消息（SSE 流）
 * @param {Object} params
 * @param {string} [params.thread_id] - 续聊时传 thread_id，新建不传
 * @param {string} [params.session_id] - 新建时可指定 session_id
 * @param {string} params.content - 消息内容
 * @param {string} [params.hint] - 本轮额外指令（仅进入 LLM 提示词，不写入历史记录）
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
  const { onSession, onThread, onContent, onToolEvent, onDone, onError, onQueued, signal, ...requestParams } = params
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
        ? { content: requestParams.content, hint: requestParams.hint || undefined, skill_id: requestParams.skill_id || null, attachments: requestParams.attachments || [], skillRef: requestParams.skillRef || null, modelRef: requestParams.modelRef || null }
        : { content: requestParams.content, hint: requestParams.hint || undefined, session_id: requestParams.session_id, skill_id: requestParams.skill_id || null, attachments: requestParams.attachments || [], skillRef: requestParams.skillRef || null, modelRef: requestParams.modelRef || null }),
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
            case 'queued':
              if (onQueued) onQueued(json)
              break
            case 'heartbeat':
              // 保活心跳，忽略
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
