import { getApiUrl, getTenantHeaders } from '@/config/tenant'

// 获取带租户标识和认证的请求头
function getHeaders(options = {}) {
  const token = localStorage.getItem('token')
  return {
    ...getTenantHeaders(),
    ...(options.json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.extra
  }
}

/**
 * 获取工单列表
 * @param {Object} params - 查询参数
 * @param {string} params.status - 工单状态 (pending/processing/resolved/closed)
 * @param {number} params.page - 页码
 * @param {number} params.limit - 每页数量
 * @returns {Promise<Object>}
 */
export async function getTickets(params = {}) {
  const query = new URLSearchParams(params).toString()
  const url = getApiUrl(`/api/tickets${query ? `?${query}` : ''}`)

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders()
  })

  if (!response.ok) {
    const error = new Error('获取工单列表失败')
    error.status = response.status
    try {
      error.data = await response.json()
    } catch {}
    throw error
  }

  return response.json()
}

/**
 * 获取工单详情
 * @param {string} ticketId - 工单ID
 * @returns {Promise<Object>}
 */
export async function getTicketDetail(ticketId) {
  const url = getApiUrl(`/api/tickets/${ticketId}`)

  const response = await fetch(url, {
    method: 'GET',
    headers: getHeaders()
  })

  if (!response.ok) {
    const error = new Error('获取工单详情失败')
    error.status = response.status
    try {
      error.data = await response.json()
    } catch {}
    throw error
  }

  return response.json()
}

/**
 * 创建工单
 * @param {Object} data - 工单数据
 * @param {string} data.type - 工单类型
 * @param {string} data.title - 标题
 * @param {string} data.description - 描述
 * @param {string} data.priority - 优先级
 * @param {Array<string>} data.attachments - 附件URL列表
 * @returns {Promise<Object>}
 */
export async function createTicket(data) {
  const url = getApiUrl('/api/tickets')

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const error = new Error('创建工单失败')
    error.status = response.status
    try {
      error.data = await response.json()
      error.message = error.data.message || error.message
    } catch {}
    throw error
  }

  return response.json()
}

/**
 * 回复工单
 * @param {string} ticketId - 工单ID
 * @param {Object} data - 回复数据
 * @param {string} data.content - 回复内容
 * @param {Array<string>} data.attachments - 附件URL列表
 * @returns {Promise<Object>}
 */
export async function replyTicket(ticketId, data) {
  const url = getApiUrl(`/api/tickets/${ticketId}/replies`)

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const error = new Error('回复工单失败')
    error.status = response.status
    try {
      error.data = await response.json()
      error.message = error.data.message || error.message
    } catch {}
    throw error
  }

  return response.json()
}

/**
 * 确认解决工单
 * @param {string} ticketId - 工单ID
 * @returns {Promise<Object>}
 */
export async function confirmResolve(ticketId) {
  const url = getApiUrl(`/api/tickets/${ticketId}/confirm-resolve`)

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders({ json: true })
  })

  if (!response.ok) {
    const error = new Error('确认解决失败')
    error.status = response.status
    try {
      error.data = await response.json()
      error.message = error.data.message || error.message
    } catch {}
    throw error
  }

  return response.json()
}

/**
 * 评价工单
 * @param {string} ticketId - 工单ID
 * @param {Object} data - 评价数据
 * @param {number} data.rating - 评分 (1-5)
 * @param {string} data.comment - 评价内容
 * @returns {Promise<Object>}
 */
export async function rateTicket(ticketId, data) {
  const url = getApiUrl(`/api/tickets/${ticketId}/rate`)

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders({ json: true }),
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const error = new Error('评价失败')
    error.status = response.status
    try {
      error.data = await response.json()
      error.message = error.data.message || error.message
    } catch {}
    throw error
  }

  return response.json()
}

/**
 * 上传工单附件
 * @param {File} file - 文件对象
 * @returns {Promise<string>} 返回文件URL
 */
export async function uploadAttachment(file) {
  const formData = new FormData()
  formData.append('file', file)

  const url = getApiUrl('/api/tickets/upload')
  const token = localStorage.getItem('token')

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...getTenantHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: formData
  })

  if (!response.ok) {
    const error = new Error('上传附件失败')
    error.status = response.status
    try {
      error.data = await response.json()
      error.message = error.data.message || error.message
    } catch {}
    throw error
  }

  const data = await response.json()
  return data.url
}

/**
 * 获取未读回复数量
 * @returns {Promise<number>}
 */
export async function getUnreadCount() {
  try {
    // 检查是否有token，没有token时直接返回0，避免不必要的请求
    const token = localStorage.getItem('token')
    if (!token) {
      return 0
    }

    const url = getApiUrl('/api/tickets/unread-count')

    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders()
    })

    if (!response.ok) {
      // 静默处理错误，不打印到控制台
      return 0
    }

    const data = await response.json()
    return data.count || 0
  } catch (e) {
    // 静默处理所有错误，避免控制台大量报错
    return 0
  }
}

/**
 * 标记工单为已读
 * @param {string} ticketId - 工单ID
 * @returns {Promise<void>}
 */
export async function markAsRead(ticketId) {
  const url = getApiUrl(`/api/tickets/${ticketId}/mark-read`)

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders({ json: true })
  })

  if (!response.ok) {
    console.warn('标记已读失败')
  }
}
