/**
 * 画布诊断工具 - 用于调试画布强制重新加载问题
 * 
 * 此脚本监控以下可能导致画布重新加载的情况：
 * 1. localStorage 配额溢出
 * 2. 内存使用情况
 * 3. 未处理的 Promise 异常
 * 4. 全局错误
 * 5. 路由变化
 * 6. Vue 组件卸载
 * 7. 页面卸载/beforeunload 事件
 * 
 * 使用方法：在 Canvas.vue 的 onMounted 中调用 initCanvasDiagnostic()
 */

let diagnosticEnabled = false
let diagnosticLogs = []
const MAX_LOGS = 100

// 日志记录函数
function logDiagnostic(type, message, data = {}) {
  const entry = {
    timestamp: Date.now(),
    datetime: new Date().toISOString(),
    type,
    message,
    data,
    url: window.location.href,
    memoryUsage: getMemoryUsage()
  }
  
  diagnosticLogs.push(entry)
  
  // 限制日志数量
  if (diagnosticLogs.length > MAX_LOGS) {
    diagnosticLogs.shift()
  }
  
  // 尝试保存到 sessionStorage（不会影响 localStorage 配额）
  try {
    sessionStorage.setItem('canvas_diagnostic_logs', JSON.stringify(diagnosticLogs))
  } catch (e) {
    // 忽略
  }
  
  // 控制台输出
  console.log(`[CanvasDiagnostic] [${type}] ${message}`, data)
  
  return entry
}

// 获取内存使用情况（如果浏览器支持）
function getMemoryUsage() {
  if (performance && performance.memory) {
    return {
      usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
      totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB',
      jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + 'MB',
      usagePercent: Math.round((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100) + '%'
    }
  }
  return null
}

// 检查 localStorage 使用情况
function checkLocalStorageUsage() {
  let totalSize = 0
  const details = {}
  
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      const size = (localStorage[key].length + key.length) * 2 // UTF-16 编码
      totalSize += size
      
      // 记录大于 100KB 的项
      if (size > 100 * 1024) {
        details[key] = Math.round(size / 1024) + 'KB'
      }
    }
  }
  
  return {
    totalSizeKB: Math.round(totalSize / 1024),
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
    largeItems: details,
    // 大多数浏览器 localStorage 限制为 5MB
    usagePercent: Math.round((totalSize / (5 * 1024 * 1024)) * 100) + '%'
  }
}

// 监控 localStorage 写入
function monitorLocalStorage() {
  const originalSetItem = localStorage.setItem.bind(localStorage)
  
  localStorage.setItem = function(key, value) {
    const size = (key.length + value.length) * 2
    
    // 记录大于 100KB 的写入
    if (size > 100 * 1024) {
      logDiagnostic('LOCALSTORAGE_LARGE_WRITE', `大数据写入 localStorage: ${key}`, {
        key,
        sizeKB: Math.round(size / 1024),
        totalUsage: checkLocalStorageUsage()
      })
    }
    
    try {
      return originalSetItem(key, value)
    } catch (e) {
      // 捕获 QuotaExceededError
      logDiagnostic('LOCALSTORAGE_ERROR', `localStorage 写入失败: ${e.name}`, {
        key,
        sizeKB: Math.round(size / 1024),
        error: e.message,
        totalUsage: checkLocalStorageUsage()
      })
      throw e
    }
  }
}

// 监控全局错误
function monitorGlobalErrors() {
  window.addEventListener('error', (event) => {
    logDiagnostic('GLOBAL_ERROR', event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack
    })
  })
  
  window.addEventListener('unhandledrejection', (event) => {
    logDiagnostic('UNHANDLED_REJECTION', 'Promise 异常未处理', {
      reason: event.reason?.message || String(event.reason),
      stack: event.reason?.stack
    })
  })
}

// 监控页面卸载（仅记录日志，不设置 returnValue）
function monitorPageUnload() {
  window.addEventListener('beforeunload', () => {
    logDiagnostic('BEFORE_UNLOAD', '页面即将卸载', {
      localStorageUsage: checkLocalStorageUsage(),
      memoryUsage: getMemoryUsage()
    })
    
    // 同步保存诊断日志
    try {
      sessionStorage.setItem('canvas_diagnostic_logs', JSON.stringify(diagnosticLogs))
      sessionStorage.setItem('canvas_last_unload_time', Date.now().toString())
    } catch (e) {
      // 忽略
    }
  })
  
  window.addEventListener('unload', () => {
    logDiagnostic('UNLOAD', '页面已卸载')
  })
  
  // 监控页面可见性变化
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      logDiagnostic('VISIBILITY_HIDDEN', '页面进入后台')
    } else {
      logDiagnostic('VISIBILITY_VISIBLE', '页面回到前台', {
        wasReloaded: checkIfPageWasReloaded()
      })
    }
  })
}

// 检查页面是否被重新加载
function checkIfPageWasReloaded() {
  const lastUnloadTime = sessionStorage.getItem('canvas_last_unload_time')
  if (lastUnloadTime) {
    const elapsed = Date.now() - parseInt(lastUnloadTime)
    // 如果距上次卸载不到 5 秒，可能是刷新
    return elapsed < 5000
  }
  return false
}

// 监控 VueFlow 和画布状态
function monitorCanvasState(canvasStore) {
  // 定期记录画布状态
  setInterval(() => {
    if (!diagnosticEnabled) return
    
    const nodeCount = canvasStore.nodes?.length || 0
    const edgeCount = canvasStore.edges?.length || 0
    
    logDiagnostic('CANVAS_STATE', '画布状态快照', {
      nodeCount,
      edgeCount,
      memoryUsage: getMemoryUsage(),
      localStorageUsage: checkLocalStorageUsage()
    })
  }, 60000) // 每分钟记录一次
}

// 监控视频任务轮询
function monitorVideoTaskPolling() {
  // 监控 fetch 请求中的视频任务相关 API
  const originalFetch = window.fetch.bind(window)
  
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url
    
    // 监控视频任务相关的 API 调用
    if (url && (url.includes('/api/videos/task/') || url.includes('/api/images/task/'))) {
      const startTime = Date.now()
      
      try {
        const response = await originalFetch(...args)
        const duration = Date.now() - startTime
        
        // 克隆响应以便读取
        const clonedResponse = response.clone()
        let responseData = null
        
        try {
          responseData = await clonedResponse.json()
        } catch (e) {
          // 忽略
        }
        
        // 记录长耗时的请求
        if (duration > 5000) {
          logDiagnostic('SLOW_API_REQUEST', `任务状态查询耗时较长: ${url}`, {
            duration: duration + 'ms',
            status: response.status,
            taskStatus: responseData?.status
          })
        }
        
        // 记录失败的任务
        if (responseData?.status === 'failed' || responseData?.status === 'error') {
          logDiagnostic('TASK_FAILED', '任务执行失败', {
            url,
            taskStatus: responseData?.status,
            error: responseData?.error || responseData?.fail_reason
          })
        }
        
        return response
      } catch (error) {
        logDiagnostic('API_REQUEST_ERROR', `API 请求失败: ${url}`, {
          error: error.message
        })
        throw error
      }
    }
    
    return originalFetch(...args)
  }
}

// 初始化诊断工具
export function initCanvasDiagnostic(canvasStore = null) {
  if (diagnosticEnabled) {
    console.log('[CanvasDiagnostic] 诊断工具已经初始化')
    return
  }
  
  diagnosticEnabled = true
  
  // 检查是否是页面刷新后
  const lastUnloadTime = sessionStorage.getItem('canvas_last_unload_time')
  if (lastUnloadTime) {
    const elapsed = Date.now() - parseInt(lastUnloadTime)
    logDiagnostic('PAGE_LOAD', '画布页面加载', {
      isReload: elapsed < 5000,
      elapsedSinceLastUnload: elapsed + 'ms',
      previousLogs: sessionStorage.getItem('canvas_diagnostic_logs')?.length || 0
    })
  } else {
    logDiagnostic('PAGE_LOAD', '画布页面首次加载')
  }
  
  // 初始化各种监控
  monitorLocalStorage()
  monitorGlobalErrors()
  monitorPageUnload()
  monitorVideoTaskPolling()
  
  if (canvasStore) {
    monitorCanvasState(canvasStore)
  }
  
  // 记录初始状态
  logDiagnostic('INIT', '诊断工具初始化完成', {
    memoryUsage: getMemoryUsage(),
    localStorageUsage: checkLocalStorageUsage(),
    userAgent: navigator.userAgent
  })
  
  console.log('[CanvasDiagnostic] 画布诊断工具已启动')
  console.log('[CanvasDiagnostic] 使用 getCanvasDiagnosticLogs() 获取诊断日志')
  console.log('[CanvasDiagnostic] 使用 printCanvasDiagnosticReport() 打印诊断报告')
}

// 获取诊断日志
export function getCanvasDiagnosticLogs() {
  return diagnosticLogs
}

// 打印诊断报告
export function printCanvasDiagnosticReport() {
  console.log('========== 画布诊断报告 ==========')
  console.log('当前时间:', new Date().toISOString())
  console.log('内存使用:', getMemoryUsage())
  console.log('localStorage 使用:', checkLocalStorageUsage())
  console.log('')
  console.log('最近日志:')
  
  // 按类型分组统计
  const typeCounts = {}
  diagnosticLogs.forEach(log => {
    typeCounts[log.type] = (typeCounts[log.type] || 0) + 1
  })
  console.log('日志类型统计:', typeCounts)
  
  // 打印最近 20 条日志
  console.log('最近 20 条日志:')
  diagnosticLogs.slice(-20).forEach(log => {
    console.log(`  [${log.type}] ${log.message}`, log.data)
  })
  
  console.log('===================================')
}

// 导出到全局（方便在控制台调用）
if (typeof window !== 'undefined') {
  window.getCanvasDiagnosticLogs = getCanvasDiagnosticLogs
  window.printCanvasDiagnosticReport = printCanvasDiagnosticReport
  window.checkLocalStorageUsage = checkLocalStorageUsage
  window.getMemoryUsage = getMemoryUsage
}

export default {
  initCanvasDiagnostic,
  getCanvasDiagnosticLogs,
  printCanvasDiagnosticReport,
  checkLocalStorageUsage,
  getMemoryUsage
}

