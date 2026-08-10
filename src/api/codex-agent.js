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
 * @param {Function} [callbacks.onTaskEvent] - 媒体任务状态事件（task.started/progress/completed/failed）
 * @param {Function} [callbacks.onDone] - 流结束
 * @param {Function} [callbacks.onError] - 错误
 * @param {AbortSignal} [callbacks.signal] - 取消信号
 */
export async function subscribeCodexStream(threadId, callbacks = {}) {
  const { onStatus, onContent, onToolEvent, onTaskEvent, onDone, onError, signal } = callbacks
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
            case 'task.started':
            case 'task.progress':
            case 'task.completed':
            case 'task.failed':
            case 'task.timeout':
              if (onTaskEvent) onTaskEvent({ type: eventName, ...json })
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
 * 发送增强模式消息（SSE 流）— 支持发送协议（reliability design 5.3）：
 *   client_message_id / send_mode: 'direct'|'queue'|'interrupt' / target_turn_id
 * @param {Object} params
 * @param {string} [params.thread_id] - 续聊时传 thread_id，新建不传
 * @param {string} [params.session_id] - 新建时可指定 session_id
 * @param {string} params.content - 消息内容
 * @param {string} [params.client_message_id] - 客户端幂等 ID（重试不重复建 turn）
 * @param {string} [params.send_mode] - direct|queue|interrupt（缺省走兼容直发）
 * @param {string} [params.target_turn_id] - interrupt 模式下要取消的目标回合
 * @param {string} [params.hint] - 本轮额外指令（仅进入 LLM 提示词，不写入历史记录）
 * @param {Array} [params.attachments] - 附件列表 [{key,type,url,name}]
 * @param {Function} [params.onSession] - 收到 session_id
 * @param {Function} [params.onThread] - 收到 thread_id
 * @param {Function} [params.onContent] - 收到 agent_message 文本
 * @param {Function} [params.onAccepted] - turn.accepted
 * @param {Function} [params.onQueued] - turn.queued（排队，含 queue_position）
 * @param {Function} [params.onStatus] - turn.status（phase 阶段）
 * @param {Function} [params.onToolEvent] - 工具事件 {type:'started'|'completed'|'failed'|'retrying'|'progress', ...}
 * @param {Function} [params.onTaskEvent] - 媒体任务事件 {type:'task.started'|'task.progress'|'task.completed'|'task.failed'|'task.timeout', ...}
 * @param {Function} [params.onCancelRequested] - turn.cancel_requested
 * @param {Function} [params.onCancelled] - turn.cancelled
 * @param {Function} [params.onSnapshot] - turn.snapshot（重连时 DB 快照重建）
 * @param {Function} [params.onDone] - 完成
 * @param {Function} [params.onError] - 错误
 * @param {AbortSignal} [params.signal] - 取消信号
 */
export async function sendCodexMessage(params) {
  const { onSession, onThread, onContent, onAccepted, onQueued, onStatus, onToolEvent, onTaskEvent, onCancelRequested, onCancelled, onSnapshot, onDone, onError, signal, ...requestParams } = params
  const isResume = Boolean(requestParams.thread_id)
  const url = isResume
    ? getApiUrl(`/api/codex-agent/sessions/${encodeURIComponent(requestParams.thread_id)}/messages`)
    : getApiUrl('/api/codex-agent/sessions')
  const sendBody = (extra = {}) => {
    const base = {
      content: requestParams.content,
      hint: requestParams.hint || undefined,
      skill_id: requestParams.skill_id || null,
      attachments: requestParams.attachments || [],
      skillRef: requestParams.skillRef || null,
      modelRef: requestParams.modelRef || null,
      client_message_id: requestParams.client_message_id || undefined,
      send_mode: requestParams.send_mode || undefined,
      target_turn_id: requestParams.target_turn_id || undefined,
      ...extra,
    }
    return base
  }
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers(true),
      credentials: 'include',
      body: JSON.stringify(isResume
        ? sendBody()
        : { ...sendBody(), session_id: requestParams.session_id }),
      signal
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      const err = new Error(error.message || error.error || 'Codex agent 请求失败')
      err.code = error.error || response.status
      throw err
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
            case 'turn.accepted':
              if (onAccepted) onAccepted(json)
              if (onQueued && json.status === 'queued') onQueued(json)
              break
            case 'turn.queued':
            case 'queued':
              if (onQueued) onQueued(json)
              break
            case 'turn.status':
              if (onStatus) onStatus(json)
              break
            case 'turn.cancel_requested':
              if (onCancelRequested) onCancelRequested(json)
              break
            case 'turn.cancelled':
              if (onCancelled) onCancelled(json)
              break
            case 'turn.snapshot':
              if (onSnapshot) onSnapshot(json)
              break
            case 'heartbeat':
              // 保活心跳，忽略
              break
            case 'tool.started':
              if (onToolEvent) onToolEvent({ type: 'started', server: json.server, tool: json.tool, args: json.args })
              break
            case 'tool.progress':
              if (onToolEvent) onToolEvent({ type: 'progress', server: json.server, tool: json.tool, task_id: json.task_id, progress: json.progress, message: json.message })
              break
            case 'tool.retrying':
              if (onToolEvent) onToolEvent({ type: 'retrying', tool: json.tool, attempt: json.attempt, max_attempts: json.max_attempts, reason: json.reason })
              break
            case 'tool.completed':
              if (onToolEvent) onToolEvent({ type: 'completed', server: json.server, tool: json.tool, status: json.status, result: json.result })
              break
            case 'tool.failed':
              if (onToolEvent) onToolEvent({ type: 'failed', tool: json.tool, error_code: json.error_code, retryable: json.retryable, result: json.result })
              break
            case 'task.started':
            case 'task.progress':
            case 'task.completed':
            case 'task.failed':
            case 'task.timeout':
              if (onTaskEvent) onTaskEvent({ type: eventName, ...json })
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
              if (onDone) onDone({ session_id: sessionId, thread_id: threadId, finalResponse, usage: json.usage, turn_id: json.turn_id, status: json.status })
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

/**
 * 取消当前 active turn（reliability design 5.2）。
 * @param {string} threadId
 * @param {string} turnId
 * @param {Object} [opts]
 * @param {string} [opts.reason] - user_stop|force_insert|disconnect_timeout
 * @param {boolean} [opts.cancelExternalTask=false] - 是否取消已提交的媒体任务
 * @returns {Promise<Object>} { success, turn_id, status }
 */
export async function cancelCodexTurn(threadId, turnId, { reason = 'user_stop', cancelExternalTask = false } = {}) {
  const response = await fetch(getApiUrl(`/api/codex-agent/sessions/${encodeURIComponent(threadId)}/cancel`), {
    method: 'POST',
    headers: headers(true),
    credentials: 'include',
    body: JSON.stringify({ turn_id: turnId, reason, cancel_external_task: cancelExternalTask }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    const err = new Error(error.message || error.error || '取消回合失败')
    err.code = error.error || response.status
    throw err
  }
  return response.json()
}

/**
 * 删除队列中未 dispatch 的消息（不影响已提交任务）。
 * @param {string} threadId
 * @param {string} turnId
 * @returns {Promise<Object>}
 */
export async function deleteQueuedCodexMessage(threadId, turnId) {
  const response = await fetch(getApiUrl(`/api/codex-agent/sessions/${encodeURIComponent(threadId)}/queue/${encodeURIComponent(turnId)}`), {
    method: 'DELETE',
    headers: headers(false),
    credentials: 'include',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || '删除队列消息失败')
  }
  return response.json()
}
