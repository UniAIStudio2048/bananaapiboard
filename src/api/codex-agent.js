import { getApiUrl, getTenantHeaders } from '@/config/tenant'

function headers(json = false) {
  const token = localStorage.getItem('token')
  return {
    ...getTenantHeaders(),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }
}

// 将空间过滤参数（spaceType/teamId）追加到 URL query
function appendSpaceQuery(url, spaceParams) {
  if (!spaceParams || !spaceParams.spaceType) return url
  const query = new URLSearchParams()
  query.set('spaceType', spaceParams.spaceType)
  if (spaceParams.spaceType === 'team' && spaceParams.teamId) {
    query.set('teamId', spaceParams.teamId)
  }
  return `${url}${url.includes('?') ? '&' : '?'}${query.toString()}`
}

// 列出会话
export async function getCodexSessions(spaceParams) {
  const url = appendSpaceQuery(getApiUrl('/api/codex-agent/sessions'), spaceParams)
  const response = await fetch(url, {
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
export async function getCodexSessionMessages(threadId, spaceParams) {
  const url = appendSpaceQuery(getApiUrl(`/api/codex-agent/sessions/${encodeURIComponent(threadId)}/messages`), spaceParams)
  const response = await fetch(url, {
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
 * @param {Function} [callbacks.onSnapshot] - turn.snapshot（事件过期时后端回退的 DB 快照）
 * @param {Function} [callbacks.onDone] - 流结束
 * @param {Function} [callbacks.onError] - 错误
 * @param {AbortSignal} [callbacks.signal] - 取消信号
 * @param {number} [callbacks.lastEventId=0] - 从指定事件 ID 之后恢复
 */
export async function subscribeCodexStream(threadId, callbacks = {}) {
  const { onStatus, onContent, onToolEvent, onTaskEvent, onSnapshot, onDone, onError, onEventId, signal, lastEventId = 0 } = callbacks
  const url = getApiUrl(`/api/codex-agent/sessions/${encodeURIComponent(threadId)}/stream`)
  try {
    const response = await fetch(url, {
      headers: { ...headers(false), ...(Number(lastEventId) > 0 ? { 'Last-Event-ID': String(lastEventId) } : {}) },
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
    let cursor = Number(lastEventId) || 0
    let ended = false
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        // AC-P1-01: 重连端点同样只在收到终态（done / turn 终态事件）后成功。
        // 终态前 EOF（代理重置、服务端提前断流）视为 stream_incomplete，
        // 由调用方进入退避重连，不得静默当作成功。
        if (ended) break
        const err = new Error('连接中断，正在恢复（stream_incomplete）')
        err.code = 'stream_incomplete'
        throw err
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
          const eventId = Number(json.event_id || 0)
          if (eventId > 0 && eventId <= cursor) continue
          if (eventId > cursor) cursor = eventId
          if (eventId > 0 && onEventId) onEventId({ turn_id: json.turn_id || null, event_id: eventId })
          switch (eventName) {
            case 'status':
              if (onStatus) onStatus(json.turn_status, json)
              break
            case 'turn.snapshot':
              // 事件存储过期/缺失时后端回退的 DB 快照（partialContent + toolEvents），
              // 是“当前已打印进度”的真源；必须派发，否则进行中对话的部分信息丢失。
              if (onSnapshot) onSnapshot(json.snapshot || json)
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
              ended = true
              if (onContent) onContent(json.finalResponse || '', true)
              break
            case 'turn.cancelled':
              ended = true
              if (onDone) onDone(json)
              return
            case 'done':
              ended = true
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
 * @param {Object} [params.canvas_context] - 当前画布工作流/节点上下文
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
      authorization_mode: requestParams.authorization_mode || undefined,
      canvas_context: requestParams.canvas_context || undefined,
      model: requestParams.model || undefined,
      mode: requestParams.mode || undefined,
      // AC-P1-04 / AC-P1-08: 增强模式开关与参考媒体策略真实进入请求
      deep_think: requestParams.deep_think === true,
      web_search: requestParams.web_search !== false,
      reference_media_mode: requestParams.reference_media_mode || 'explicit',
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
    let completedTurn = null
    let cancelledTurn = null
    while (true) {
      let readResult
      try {
        readResult = await reader.read()
      } catch (error) {
        if (!completedTurn && !cancelledTurn) throw error
        const result = {
          session_id: sessionId,
          thread_id: threadId,
          finalResponse,
          usage: completedTurn?.usage,
          turn_id: (completedTurn || cancelledTurn)?.turn_id,
          status: completedTurn ? 'completed' : 'cancelled'
        }
        if (onDone) onDone(result)
        return result
      }
      const { done, value } = readResult
      if (done) {
        // AC-P1-01: 只有收到终态后才算成功。终态前干净 EOF（连接被代理重置 /
        // 服务端提前断流）必须抛 stream_incomplete，不能把半截回复标成完成。
        if (completedTurn || cancelledTurn) {
          const result = {
            session_id: sessionId,
            thread_id: threadId,
            finalResponse,
            usage: completedTurn?.usage,
            turn_id: (completedTurn || cancelledTurn)?.turn_id,
            status: completedTurn ? 'completed' : 'cancelled'
          }
          if (onDone) onDone(result)
          return result
        }
        const err = new Error('连接中断，回复未完成（stream_incomplete）')
        err.code = 'stream_incomplete'
        throw err
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
              cancelledTurn = json
              if (onCancelled) onCancelled(json)
              break
            case 'turn.snapshot':
              if (onSnapshot) onSnapshot(json)
              break
            case 'heartbeat':
              // 保活心跳，忽略
              break
            case 'tool.started':
              if (onToolEvent) onToolEvent({ type: 'started', server: json.server, tool: json.tool, args: json.args, tool_call_id: json.tool_call_id || null })
              break
            case 'tool.progress':
              if (onToolEvent) onToolEvent({ type: 'progress', server: json.server, tool: json.tool, task_id: json.task_id, progress: json.progress, message: json.message, tool_call_id: json.tool_call_id || null })
              break
            case 'tool.retrying':
              if (onToolEvent) onToolEvent({ type: 'retrying', tool: json.tool, attempt: json.attempt, max_attempts: json.max_attempts, reason: json.reason, tool_call_id: json.tool_call_id || null })
              break
            case 'tool.completed':
              if (onToolEvent) onToolEvent({ type: 'completed', server: json.server, tool: json.tool, status: json.status, result: json.result, tool_call_id: json.tool_call_id || null })
              break
            case 'tool.failed':
              if (onToolEvent) onToolEvent({ type: 'failed', tool: json.tool, error_code: json.error_code, retryable: json.retryable, result: json.result, tool_call_id: json.tool_call_id || null })
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
                if (onToolEvent) onToolEvent({ type: 'started', server: item.server, tool: item.tool, tool_call_id: item.call_id || item.id || json.tool_call_id || null })
              }
              break
            }
            case 'item.completed': {
              const item = json.item || {}
              if (item.type === 'mcp_tool_call') {
                if (onToolEvent) onToolEvent({ type: 'completed', server: item.server, tool: item.tool, status: item.status, result: item.result, tool_call_id: item.call_id || item.id || json.tool_call_id || null })
              } else if (item.type === 'agent_message' && item.text) {
                if (onContent) onContent(item.text)
              }
              break
            }
            case 'turn.completed':
              finalResponse = json.finalResponse || finalResponse
              if (finalResponse && onContent) onContent(finalResponse, true)
              completedTurn = json
              break
            case 'turn.failed':
              throw new Error(json.error?.message || 'Codex agent 执行失败')
            case 'done':
              if (json.thread_id) threadId = json.thread_id
              {
                const result = { session_id: sessionId, thread_id: threadId, finalResponse, usage: json.usage, turn_id: json.turn_id, status: json.status }
                if (onDone) onDone(result)
                return result
              }
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

/**
 * 「立即插入」置顶排队消息：不打断当前回合，把它提为当前回合结束后
 * 调度器立即派发的下一条（服务端 priority=100）。
 * @param {string} threadId
 * @param {string} turnId
 * @returns {Promise<Object>}
 */
export async function promoteQueuedCodexMessage(threadId, turnId) {
  const response = await fetch(getApiUrl(`/api/codex-agent/sessions/${encodeURIComponent(threadId)}/queue/${encodeURIComponent(turnId)}`), {
    method: 'PATCH',
    headers: headers(true),
    credentials: 'include',
    body: JSON.stringify({ priority: 100 }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || '置顶队列消息失败')
  }
  return response.json()
}
