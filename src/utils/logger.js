/**
 * 前端日志工具 - 自动上报到后端
 * 记录用户操作、API调用、错误信息等
 */

import { getTenantHeaders, getApiUrl } from '@/config/tenant'

// 日志级别
export const LOG_LEVEL = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
}

// 日志类型
export const LOG_TYPE = {
  API_REQUEST: 'api_request',      // API请求
  API_RESPONSE: 'api_response',    // API响应
  API_ERROR: 'api_error',          // API错误
  USER_ACTION: 'user_action',      // 用户操作
  AUTH: 'auth',                    // 认证相关
  ERROR: 'error',                  // 前端错误
  PERFORMANCE: 'performance',      // 性能日志
  PAGE_VIEW: 'page_view'           // 页面访问
}

// 日志缓冲区 - 批量上报
let logBuffer = []
const BUFFER_SIZE = 10           // 缓冲区大小
const FLUSH_INTERVAL = 5000       // 刷新间隔(ms)
let flushTimer = null

// 是否启用日志
let enabled = true

/**
 * 初始化日志系统
 */
export function initLogger(options = {}) {
  enabled = options.enabled !== false
  
  if (!enabled) return
  
  // 启动定时刷新
  startFlushTimer()
  
  // 监听全局错误
  window.addEventListener('error', (event) => {
    logError({
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    })
  })
  
  // 监听未处理的Promise错误
  window.addEventListener('unhandledrejection', (event) => {
    logError({
      message: 'Unhandled Promise Rejection',
      reason: event.reason?.message || String(event.reason),
      stack: event.reason?.stack
    })
  })
  
  // 页面卸载时刷新缓冲区
  window.addEventListener('beforeunload', () => {
    flushLogs(true) // 同步刷新
  })
  
  console.log('[Logger] 前端日志系统已初始化')
}

/**
 * 创建日志记录
 */
function createLog(level, type, action, details = {}) {
  if (!enabled) return
  
  const token = localStorage.getItem('token')
  const tenantHeaders = getTenantHeaders()
  
  const log = {
    timestamp: Date.now(),
    datetime: new Date().toISOString(),
    level,
    type,
    action,
    source: 'frontend',  // 标记来源为主前端
    tenant_id: tenantHeaders['X-Tenant-ID'] || null,
    user_token: token ? token.substring(0, 20) + '...' : null,
    url: window.location.href,
    user_agent: navigator.userAgent,
    ...details
  }
  
  // 添加到缓冲区
  logBuffer.push(log)
  
  // 缓冲区满则立即刷新
  if (logBuffer.length >= BUFFER_SIZE) {
    flushLogs()
  }
  
  // 控制台输出（开发环境）
  if (import.meta.env.DEV) {
    const consoleMethod = level === 'error' ? console.error : 
                          level === 'warn' ? console.warn : console.log
    consoleMethod(`[${type}] ${action}`, details)
  }
  
  return log
}

/**
 * 刷新日志缓冲区 - 上报到后端
 */
async function flushLogs(sync = false) {
  if (logBuffer.length === 0) return
  
  const logsToSend = [...logBuffer]
  logBuffer = []
  
  const sendData = async () => {
    try {
      const tenantHeaders = getTenantHeaders()
      const token = localStorage.getItem('token')
      
      await fetch(getApiUrl('/api/frontend-logs'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...tenantHeaders,
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ logs: logsToSend, source: 'frontend' })
      })
    } catch (e) {
      // 上报失败时，将日志放回缓冲区（限制数量避免内存泄漏）
      if (logBuffer.length < BUFFER_SIZE * 3) {
        logBuffer = [...logsToSend, ...logBuffer]
      }
      console.warn('[Logger] 日志上报失败:', e.message)
    }
  }
  
  if (sync && navigator.sendBeacon) {
    // 使用 sendBeacon 同步发送（页面卸载时）
    const tenantHeaders = getTenantHeaders()
    navigator.sendBeacon(
      getApiUrl('/api/frontend-logs'),
      JSON.stringify({ logs: logsToSend, source: 'frontend', tenant_id: tenantHeaders['X-Tenant-ID'] })
    )
  } else {
    await sendData()
  }
}

/**
 * 启动定时刷新
 */
function startFlushTimer() {
  if (flushTimer) clearInterval(flushTimer)
  flushTimer = setInterval(() => flushLogs(), FLUSH_INTERVAL)
}

// ==================== 便捷日志方法 ====================

/**
 * 记录API请求
 */
export function logApiRequest(method, url, body = null, headers = {}) {
  return createLog(LOG_LEVEL.INFO, LOG_TYPE.API_REQUEST, `${method} ${url}`, {
    method,
    request_url: url,
    request_body: sanitizeBody(body),
    request_headers: sanitizeHeaders(headers)
  })
}

/**
 * 记录API响应
 */
export function logApiResponse(method, url, status, duration, responseBody = null) {
  const level = status >= 500 ? LOG_LEVEL.ERROR :
                status >= 400 ? LOG_LEVEL.WARN : LOG_LEVEL.INFO
  
  return createLog(level, LOG_TYPE.API_RESPONSE, `${method} ${url} -> ${status}`, {
    method,
    request_url: url,
    status_code: status,
    duration_ms: duration,
    response_body: sanitizeBody(responseBody)
  })
}

/**
 * 记录API错误
 */
export function logApiError(method, url, error, requestBody = null) {
  return createLog(LOG_LEVEL.ERROR, LOG_TYPE.API_ERROR, `${method} ${url} FAILED`, {
    method,
    request_url: url,
    request_body: sanitizeBody(requestBody),
    error_message: error?.message || String(error),
    error_status: error?.status,
    error_data: error?.data || error?.body
  })
}

/**
 * 记录用户操作
 */
export function logUserAction(action, details = {}) {
  return createLog(LOG_LEVEL.INFO, LOG_TYPE.USER_ACTION, action, details)
}

/**
 * 记录认证相关事件
 */
export function logAuth(action, details = {}) {
  return createLog(LOG_LEVEL.INFO, LOG_TYPE.AUTH, action, details)
}

/**
 * 记录错误
 */
export function logError(error, context = '') {
  const errorDetails = typeof error === 'object' ? error : { message: String(error) }
  return createLog(LOG_LEVEL.ERROR, LOG_TYPE.ERROR, context || 'Frontend Error', errorDetails)
}

/**
 * 记录警告
 */
export function logWarn(message, details = {}) {
  return createLog(LOG_LEVEL.WARN, LOG_TYPE.ERROR, message, details)
}

/**
 * 记录调试信息
 */
export function logDebug(message, details = {}) {
  return createLog(LOG_LEVEL.DEBUG, LOG_TYPE.USER_ACTION, message, details)
}

/**
 * 记录页面访问
 */
export function logPageView(pageName, params = {}) {
  return createLog(LOG_LEVEL.INFO, LOG_TYPE.PAGE_VIEW, `访问页面: ${pageName}`, {
    page: pageName,
    params,
    referrer: document.referrer
  })
}

// ==================== 辅助函数 ====================

/**
 * 过滤敏感字段
 */
function sanitizeBody(body) {
  if (!body) return null
  if (typeof body !== 'object') return body
  
  const sanitized = { ...body }
  const sensitiveFields = ['password', 'token', 'secret', 'api_key', 'apiKey', 'authorization']
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***'
    }
  })
  
  // 限制大小
  const str = JSON.stringify(sanitized)
  if (str.length > 5000) {
    return { _truncated: true, _size: str.length, _preview: str.substring(0, 500) + '...' }
  }
  
  return sanitized
}

/**
 * 过滤敏感请求头
 */
function sanitizeHeaders(headers) {
  if (!headers) return {}
  
  const sanitized = { ...headers }
  const sensitiveHeaders = ['authorization', 'cookie', 'x-tenant-key']
  
  sensitiveHeaders.forEach(header => {
    const key = Object.keys(sanitized).find(k => k.toLowerCase() === header)
    if (key && sanitized[key]) {
      sanitized[key] = '***REDACTED***'
    }
  })
  
  return sanitized
}

/**
 * 创建带日志的 fetch 包装器
 */
export function createLoggedFetch(originalFetch = window.fetch) {
  return async function loggedFetch(url, options = {}) {
    const method = options.method || 'GET'
    const startTime = Date.now()
    
    // 记录请求
    logApiRequest(method, url, options.body, options.headers)
    
    try {
      const response = await originalFetch(url, options)
      const duration = Date.now() - startTime
      
      // 克隆响应以便读取body
      const clonedResponse = response.clone()
      let responseBody = null
      
      try {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          responseBody = await clonedResponse.json()
        }
      } catch {
        // 忽略解析错误
      }
      
      // 记录响应
      logApiResponse(method, url, response.status, duration, responseBody)
      
      return response
    } catch (error) {
      const duration = Date.now() - startTime
      
      // 记录错误
      logApiError(method, url, error, options.body)
      
      throw error
    }
  }
}

export default {
  initLogger,
  logApiRequest,
  logApiResponse,
  logApiError,
  logUserAction,
  logAuth,
  logError,
  logWarn,
  logDebug,
  logPageView,
  createLoggedFetch,
  LOG_LEVEL,
  LOG_TYPE
}

