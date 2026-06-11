/**
 * workflowAutoSave.js - 工作流自动保存服务
 * 
 * 功能：
 * - 每1分钟自动保存当前工作流到 localStorage
 * - 缓存有效期为15天，自动清理过期记录
 * - 不存数据库，只做本地临时缓存
 * - 用于用户不小心关闭浏览器时恢复工作流
 * 
 * 🔧 安全保护：
 * - 自动清理节点中的 base64 大数据，避免撑爆 localStorage
 * - 单个工作流限制 300KB，总存储限制 3MB
 * - QuotaExceededError 自动处理
 */

const STORAGE_KEY = 'workflow_auto_saves'
const SESSION_STORAGE_KEY = 'workflow_tab_session'
const LAST_ACTIVE_WORKFLOW_KEY = 'canvas_last_active_workflow'  // 🔧 服务器恢复回退用的轻量指针
const MAX_HISTORY_COUNT = 20  // 最多保存20条历史记录
const CACHE_DURATION = 15 * 24 * 60 * 60 * 1000  // 15天（毫秒）
const SESSION_RESTORE_DURATION = CACHE_DURATION  // 标签会话与最近历史同样保留15天
const AUTO_SAVE_INTERVAL = 60 * 1000  // 1分钟（毫秒）
const MAX_SINGLE_WORKFLOW_SIZE = 300 * 1024  // 单个工作流最大 300KB
const MAX_TOTAL_STORAGE_SIZE = 3 * 1024 * 1024  // 总存储最大 3MB
const MAX_SESSION_STORAGE_SIZE = 2 * 1024 * 1024  // 标签会话最大 2MB（超限改走 IndexedDB）

// 🔧 大会话兜底：localStorage 2MB 装不下多节点会话时写入 IndexedDB
const SESSION_IDB_DB_NAME = 'BananaCanvasSession'
const SESSION_IDB_STORE = 'session'
const SESSION_IDB_KEY = 'current'  // 固定 key，多用户通过记录内 userId 区分

let autoSaveTimer = null
let sessionDbPromise = null

/**
 * 🔧 打开（或复用）画布会话 IndexedDB。不支持时返回 reject，调用方需 graceful 降级。
 */
function getSessionDB() {
  if (sessionDbPromise) return sessionDbPromise

  sessionDbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'))
      return
    }
    const request = indexedDB.open(SESSION_IDB_DB_NAME, 1)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(SESSION_IDB_STORE)) {
        db.createObjectStore(SESSION_IDB_STORE, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  // 打开失败时清空缓存，下次还能重试
  sessionDbPromise.catch(() => { sessionDbPromise = null })
  return sessionDbPromise
}

/**
 * 🔧 把完整会话写入 IndexedDB（尽力而为，失败不抛错）
 */
async function saveSessionToIndexedDB(payload) {
  try {
    const db = await getSessionDB()
    return await new Promise((resolve) => {
      const tx = db.transaction([SESSION_IDB_STORE], 'readwrite')
      const store = tx.objectStore(SESSION_IDB_STORE)
      store.put({ id: SESSION_IDB_KEY, ...payload })
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    })
  } catch (e) {
    console.warn('[WorkflowAutoSave] IndexedDB 会话写入失败，已降级:', e?.message || e)
    return false
  }
}

/**
 * 🔧 从 IndexedDB 读取完整会话（无/不可用时返回 null）
 */
async function readSessionFromIndexedDB() {
  try {
    const db = await getSessionDB()
    return await new Promise((resolve) => {
      const tx = db.transaction([SESSION_IDB_STORE], 'readonly')
      const store = tx.objectStore(SESSION_IDB_STORE)
      const request = store.get(SESSION_IDB_KEY)
      request.onsuccess = () => resolve(request.result || null)
      request.onerror = () => resolve(null)
    })
  } catch (e) {
    return null
  }
}

function getCurrentUserId() {
  try {
    const directId = localStorage.getItem('user_id') || localStorage.getItem('userId')
    if (directId) return String(directId)

    const user = JSON.parse(localStorage.getItem('user') || 'null')
    if (user?.id !== undefined && user?.id !== null) {
      return String(user.id)
    }
  } catch (error) {
    // 无法读取用户信息时按未登录处理，避免影响普通清理逻辑。
  }
  return null
}

function parseStoredJson(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeHistoryItem(item) {
  const nodes = parseStoredJson(item.nodes, [])
  const edges = parseStoredJson(item.edges, [])
  const viewport = parseStoredJson(item.viewport, { x: 0, y: 0, zoom: 1 })

  return {
    ...item,
    nodes: Array.isArray(nodes) ? nodes : [],
    edges: Array.isArray(edges) ? edges : [],
    viewport: viewport && typeof viewport === 'object' && !Array.isArray(viewport)
      ? viewport
      : { x: 0, y: 0, zoom: 1 }
  }
}

function cleanPersistentImageUrl(url) {
  if (typeof url !== 'string') return null
  if (url.startsWith('blob:') || url.startsWith('data:')) return null
  return url
}

/**
 * 🔧 清理节点中的大数据（base64图片、blob URL等），只保留结构和有效URL引用
 * 这样可以大幅减少存储空间，避免 localStorage 溢出
 * 
 * 清理规则：
 * - base64 数据：移除，只保留类型标记
 * - blob URL：移除（localStorage 恢复后无效）
 * - 超大字符串：截断
 */
function cleanNodeData(nodes) {
  if (!Array.isArray(nodes)) return nodes
  
  return nodes.map(node => {
    // 深拷贝节点
    let cleanedNode
    try {
      cleanedNode = JSON.parse(JSON.stringify(node))
    } catch (e) {
      // 如果 JSON 序列化失败（可能有循环引用），跳过这个节点
      console.warn('[WorkflowAutoSave] 节点序列化失败，跳过:', node.id, e.message)
      return {
        id: node.id,
        type: node.type,
        position: node.position,
        data: { title: node.data?.title || 'Error Node', _serializeError: true }
      }
    }
    
    if (cleanedNode.data) {
      // 清理常见的大数据字段（base64图片）
      const fieldsToClean = ['imageData', 'base64', 'thumbnail', 'previewData', 'originalData']
      fieldsToClean.forEach(field => {
        if (cleanedNode.data[field] && typeof cleanedNode.data[field] === 'string') {
          // 如果是 base64 数据，只保留类型标记
          if (cleanedNode.data[field].startsWith('data:')) {
            const mimeMatch = cleanedNode.data[field].match(/^data:([^;,]+)/)
            cleanedNode.data[field] = mimeMatch ? `[BASE64:${mimeMatch[1]}]` : '[BASE64_REMOVED]'
          } else if (cleanedNode.data[field].startsWith('blob:')) {
            // 🔧 清理 blob URL（localStorage 恢复后无效）
            cleanedNode.data[field] = '[BLOB_URL_REMOVED]'
          } else if (cleanedNode.data[field].length > 10000) {
            // 超过 10KB 的字符串数据也清理
            cleanedNode.data[field] = '[LARGE_DATA_REMOVED]'
          }
        }
      })
      
      // 清理 images 数组中的 base64 数据和 blob URL
      // Storyboard 使用字符串 URL/null 数组，必须保留格子索引。
      if (Array.isArray(cleanedNode.data.images)) {
        const containsStoryboardImageUrls = cleanedNode.data.images.some(
          img => img === null || typeof img === 'string'
        )

        if (containsStoryboardImageUrls) {
          cleanedNode.data.images = cleanedNode.data.images.map(img => cleanPersistentImageUrl(img))
        } else {
          cleanedNode.data.images = cleanedNode.data.images.map(img => {
          const cleanedImg = { ...img }
          // 保留有效 URL，移除 base64 和 blob
          if (cleanedImg.base64) delete cleanedImg.base64
          if (cleanedImg.data && typeof cleanedImg.data === 'string') {
            if (cleanedImg.data.startsWith('data:') || cleanedImg.data.startsWith('blob:')) {
              delete cleanedImg.data
            }
          }
          if (cleanedImg.thumbnail && typeof cleanedImg.thumbnail === 'string') {
            if (cleanedImg.thumbnail.startsWith('data:') || cleanedImg.thumbnail.startsWith('blob:')) {
              delete cleanedImg.thumbnail
            }
          }
          // 清理 url 字段中的 blob URL
          if (cleanedImg.url && cleanedImg.url.startsWith('blob:')) {
            delete cleanedImg.url
          }
          return cleanedImg
          }).filter(img => img.url || img.src) // 移除没有有效 URL 的图片
        }
      }
      
      // 🔧 清理 sourceImages 数组中的 blob URL
      if (Array.isArray(cleanedNode.data.sourceImages)) {
        cleanedNode.data.sourceImages = cleanedNode.data.sourceImages.filter(url => {
          if (typeof url === 'string') {
            return !url.startsWith('blob:') && !url.startsWith('data:')
          }
          return true
        })
      }
      
      // 清理 imageUrl/videoUrl 等字段中的 base64 和 blob URL（保留 http URL）
      const urlFields = ['imageUrl', 'videoUrl', 'url', 'image', 'video', 'audioUrl', 'src']
      urlFields.forEach(field => {
        if (cleanedNode.data[field] && typeof cleanedNode.data[field] === 'string') {
          if (cleanedNode.data[field].startsWith('data:')) {
            const mimeMatch = cleanedNode.data[field].match(/^data:([^;,]+)/)
            cleanedNode.data[field] = mimeMatch ? `[BASE64:${mimeMatch[1]}]` : '[BASE64_REMOVED]'
          } else if (cleanedNode.data[field].startsWith('blob:')) {
            cleanedNode.data[field] = '[BLOB_URL_REMOVED]'
          }
        }
      })
      
      // 清理 result/output 等可能包含大数据的字段
      const resultFields = ['result', 'response', 'content']
      resultFields.forEach(field => {
        if (cleanedNode.data[field] && typeof cleanedNode.data[field] === 'string') {
          if (cleanedNode.data[field].startsWith('data:')) {
            cleanedNode.data[field] = '[BASE64_REMOVED]'
          } else if (cleanedNode.data[field].startsWith('blob:')) {
            cleanedNode.data[field] = '[BLOB_URL_REMOVED]'
          } else if (cleanedNode.data[field].length > 50000) {
            // 超过 50KB 的文本内容截断
            cleanedNode.data[field] = cleanedNode.data[field].substring(0, 1000) + '...[TRUNCATED]'
          }
        }
      })
      
      // 🔧 特殊处理 output 对象（可能包含 urls 数组）
      if (cleanedNode.data.output && typeof cleanedNode.data.output === 'object') {
        // 清理 output.url
        if (cleanedNode.data.output.url) {
          if (cleanedNode.data.output.url.startsWith('blob:') || cleanedNode.data.output.url.startsWith('data:')) {
            cleanedNode.data.output.url = null
          }
        }
        // 清理 output.urls 数组
        if (Array.isArray(cleanedNode.data.output.urls)) {
          cleanedNode.data.output.urls = cleanedNode.data.output.urls.filter(url => {
            if (typeof url === 'string') {
              return !url.startsWith('blob:') && !url.startsWith('data:')
            }
            return true
          })
        }
      }

      if (cleanedNode.data.editSession && typeof cleanedNode.data.editSession === 'object') {
        cleanedNode.data.editSession = { ...cleanedNode.data.editSession }
        if (Array.isArray(cleanedNode.data.editSession.history)) {
          cleanedNode.data.editSession.history = cleanedNode.data.editSession.history
            .map(entry => ({ ...entry }))
            .filter(entry => {
              const snapshotUrl = entry.snapshotUrl || entry.imageData
              if (typeof snapshotUrl !== 'string') return false
              return !snapshotUrl.startsWith('blob:') && !snapshotUrl.startsWith('data:')
            })
        }

        if (
          typeof cleanedNode.data.editSession.historyIndex === 'number' &&
          Array.isArray(cleanedNode.data.editSession.history)
        ) {
          const maxIndex = Math.max(0, cleanedNode.data.editSession.history.length - 1)
          cleanedNode.data.editSession.historyIndex = Math.min(
            Math.max(0, cleanedNode.data.editSession.historyIndex),
            maxIndex
          )
        }
      }
    }
    
    return cleanedNode
  })
}

/**
 * 🔧 安全地保存到 localStorage，处理容量溢出
 */
function saveToLocalStorage(history) {
  try {
    const jsonData = JSON.stringify(history)
    
    // 检查总大小
    if (jsonData.length > MAX_TOTAL_STORAGE_SIZE) {
      console.warn(`[WorkflowAutoSave] 数据过大 (${(jsonData.length / 1024 / 1024).toFixed(2)}MB)，清理旧记录`)
      // 逐步删除旧记录直到大小合适
      while (history.length > 1) {
        history.pop()
        const newJson = JSON.stringify(history)
        if (newJson.length <= MAX_TOTAL_STORAGE_SIZE) {
          break
        }
      }
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
    return true
  } catch (e) {
    // 处理 QuotaExceededError
    if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
      console.warn('[WorkflowAutoSave] localStorage 空间不足，清理旧记录')
      
      // 删除一半记录后重试
      const reducedHistory = history.slice(0, Math.max(1, Math.floor(history.length / 2)))
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(reducedHistory))
        console.log('[WorkflowAutoSave] 清理后保存成功，剩余记录数:', reducedHistory.length)
        return true
      } catch (e2) {
        console.error('[WorkflowAutoSave] 清理后仍无法保存，清空所有历史')
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch (e3) {
          // 忽略
        }
        return false
      }
    }
    console.error('[WorkflowAutoSave] 保存失败:', e)
    return false
  }
}

/**
 * 获取所有历史工作流
 */
export function getWorkflowHistory() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    if (!data) return []
    
    const history = JSON.parse(data)
    
    // 过滤掉过期的记录
    const now = Date.now()
    const validHistory = history.filter(item => {
      const age = now - item.savedAt
      return age < CACHE_DURATION
    })
    
    // 如果有过期记录被清理，更新存储
    if (validHistory.length !== history.length) {
      saveToLocalStorage(validHistory)
    }
    
    // 按时间倒序排列（最新的在前），并兼容旧版本把 nodes/edges/viewport 存为字符串的记录
    return validHistory
      .map(normalizeHistoryItem)
      .sort((a, b) => b.savedAt - a.savedAt)
  } catch (error) {
    console.error('[WorkflowAutoSave] 读取历史失败:', error)
    return []
  }
}

/**
 * 🔧 构建会话存储载荷（清理大数据 + 附加 userId/savedAt）
 */
function buildSessionPayload(session) {
  const tabs = session.tabs.slice(0, 10).map(tab => {
    const cleanedNodes = cleanNodeData(tab.nodes || [])
    const cleanedEdges = JSON.parse(JSON.stringify(tab.edges || []))
    return {
      id: tab.id,
      name: tab.name || '未命名工作流',
      description: tab.description || '',
      workflowId: tab.workflowId || null,
      workflowUid: tab.workflowUid || null,
      workflowSpaceType: tab.workflowSpaceType || null,
      workflowTeamId: tab.workflowTeamId || null,
      nodes: cleanedNodes,
      edges: cleanedEdges,
      viewport: tab.viewport ? { ...tab.viewport } : { x: 0, y: 0, zoom: 1 },
      hasChanges: !!tab.hasChanges
    }
  })

  return {
    tabs,
    activeTabId: tabs.some(tab => tab.id === session.activeTabId) ? session.activeTabId : tabs[0]?.id,
    userId: getCurrentUserId(),
    savedAt: Date.now()
  }
}

/**
 * 🔧 记录最近活动的已保存工作流，用于本地恢复全部失败时从服务器回退加载。
 * 只在 activeTab 已落库（有 workflowId）时写入。
 */
function saveLastActiveWorkflowPointer(payload) {
  try {
    const activeTab = payload.tabs.find(tab => tab.id === payload.activeTabId)
    if (!activeTab || !activeTab.workflowId) {
      localStorage.removeItem(LAST_ACTIVE_WORKFLOW_KEY)
      return
    }
    localStorage.setItem(LAST_ACTIVE_WORKFLOW_KEY, JSON.stringify({
      workflowId: activeTab.workflowId,
      spaceType: activeTab.workflowSpaceType || null,
      teamId: activeTab.workflowTeamId || null,
      userId: payload.userId,
      savedAt: payload.savedAt
    }))
  } catch (e) {
    // 指针写入失败不影响主流程
  }
}

/**
 * 🔧 把会话指针（标记数据在 IndexedDB）写入 localStorage，避免残留旧的大数据。
 */
function writeSessionPointer(payload) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      __idb: true,
      userId: payload.userId,
      savedAt: payload.savedAt,
      tabCount: payload.tabs.length
    }))
    return true
  } catch (e) {
    console.error('[WorkflowAutoSave] 写入会话指针失败:', e)
    return false
  }
}

/**
 * 保存当前多标签会话，用于页面刷新后恢复左上角打开的工作流标签
 * 小会话直接存 localStorage；超过 2MB 时改写 IndexedDB（fire-and-forget），
 * 退出事件中可能来不及落盘，由周期性快照的 saveWorkflowSessionAsync 保证完整。
 * @param {Object} session - { tabs, activeTabId }
 */
export function saveWorkflowSession(session) {
  if (!session || !Array.isArray(session.tabs) || session.tabs.length === 0) {
    return false
  }

  try {
    const payload = buildSessionPayload(session)
    saveLastActiveWorkflowPointer(payload)

    const jsonData = JSON.stringify(payload)
    if (jsonData.length > MAX_SESSION_STORAGE_SIZE) {
      // 🔧 大会话：localStorage 写指针，完整数据异步落 IndexedDB（尽力而为）
      console.warn(`[WorkflowAutoSave] 标签会话过大 (${(jsonData.length / 1024).toFixed(1)}KB)，改用 IndexedDB 兜底`)
      writeSessionPointer(payload)
      saveSessionToIndexedDB(payload)
      return true
    }

    localStorage.setItem(SESSION_STORAGE_KEY, jsonData)
    return true
  } catch (error) {
    console.error('[WorkflowAutoSave] 保存标签会话失败:', error)
    return false
  }
}

/**
 * 🔧 异步保存会话：与 saveWorkflowSession 相同，但大会话写 IndexedDB 时会 await 完成。
 * 供周期性快照使用，确保大会话能完整落盘（退出事件请用同步版 saveWorkflowSession）。
 */
export async function saveWorkflowSessionAsync(session) {
  if (!session || !Array.isArray(session.tabs) || session.tabs.length === 0) {
    return false
  }

  try {
    const payload = buildSessionPayload(session)
    saveLastActiveWorkflowPointer(payload)

    const jsonData = JSON.stringify(payload)
    if (jsonData.length > MAX_SESSION_STORAGE_SIZE) {
      writeSessionPointer(payload)
      const ok = await saveSessionToIndexedDB(payload)
      if (!ok) {
        console.warn('[WorkflowAutoSave] 大会话 IndexedDB 落盘失败，已降级保留指针')
      }
      return true
    }

    localStorage.setItem(SESSION_STORAGE_KEY, jsonData)
    return true
  } catch (error) {
    console.error('[WorkflowAutoSave] 异步保存标签会话失败:', error)
    return false
  }
}

/**
 * 🔧 校验会话记录的有效性（标签非空、userId 匹配、未过期）
 * @returns {Object|null} 有效返回会话本身，无效返回 null
 */
function validateSessionRecord(session) {
  if (!session || !Array.isArray(session.tabs) || session.tabs.length === 0) {
    return null
  }
  const currentUserId = getCurrentUserId()
  if (currentUserId && session.userId !== currentUserId) {
    return null
  }
  if (Date.now() - (session.savedAt || 0) > SESSION_RESTORE_DURATION) {
    return null
  }
  return session
}

/**
 * 读取最近的多标签会话（同步）。仅处理 localStorage 内联数据，
 * 大会话指针（IndexedDB）需用 getWorkflowSessionAsync 读取。
 * 过期或无效会话会自动清理。
 */
export function getWorkflowSession() {
  try {
    const data = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!data) return null

    const parsed = JSON.parse(data)
    // 大会话指针：同步读不了 IndexedDB，交给异步版本处理
    if (parsed && parsed.__idb) return null

    const session = validateSessionRecord(parsed)
    if (!session) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    return session
  } catch (error) {
    console.error('[WorkflowAutoSave] 读取标签会话失败:', error)
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    } catch (e) {
      // 忽略
    }
    return null
  }
}

/**
 * 🔧 异步读取会话：同时检查 localStorage 内联数据与 IndexedDB 大会话，
 * 返回较新（savedAt 大）的有效会话。供页面恢复链使用。
 */
export async function getWorkflowSessionAsync() {
  let lsSession = null
  let isPointer = false

  try {
    const data = localStorage.getItem(SESSION_STORAGE_KEY)
    if (data) {
      const parsed = JSON.parse(data)
      if (parsed && parsed.__idb) {
        isPointer = true
      } else {
        lsSession = validateSessionRecord(parsed)
        if (!lsSession) {
          try { localStorage.removeItem(SESSION_STORAGE_KEY) } catch (e) { /* 忽略 */ }
        }
      }
    }
  } catch (error) {
    console.error('[WorkflowAutoSave] 读取标签会话失败:', error)
  }

  // 内联会话已是最新且无指针时，直接返回，省去 IndexedDB 读取
  let idbSession = null
  if (isPointer || !lsSession) {
    idbSession = validateSessionRecord(await readSessionFromIndexedDB())
  }

  if (lsSession && idbSession) {
    return (idbSession.savedAt || 0) > (lsSession.savedAt || 0) ? idbSession : lsSession
  }
  return lsSession || idbSession
}

/**
 * 清理已保存的多标签会话
 */
export function clearWorkflowSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    localStorage.removeItem(LAST_ACTIVE_WORKFLOW_KEY)
  } catch (error) {
    console.error('[WorkflowAutoSave] 清理标签会话失败:', error)
  }
  // IndexedDB 兜底数据一并清理（尽力而为）
  getSessionDB().then(db => {
    try {
      const tx = db.transaction([SESSION_IDB_STORE], 'readwrite')
      tx.objectStore(SESSION_IDB_STORE).delete(SESSION_IDB_KEY)
    } catch (e) { /* 忽略 */ }
  }).catch(() => {})
  return true
}

/**
 * 🔧 读取最近活动的已保存工作流指针（本地恢复全部失败时的服务器回退用）。
 * userId 不匹配或不存在时返回 null，避免恢复到别的用户的工作流。
 */
export function getLastActiveWorkflowPointer() {
  try {
    const data = localStorage.getItem(LAST_ACTIVE_WORKFLOW_KEY)
    if (!data) return null
    const pointer = JSON.parse(data)
    if (!pointer || !pointer.workflowId) return null

    const currentUserId = getCurrentUserId()
    if (currentUserId && pointer.userId !== currentUserId) return null
    if (Date.now() - (pointer.savedAt || 0) > SESSION_RESTORE_DURATION) {
      localStorage.removeItem(LAST_ACTIVE_WORKFLOW_KEY)
      return null
    }
    return pointer
  } catch (error) {
    return null
  }
}

/**
 * 保存工作流到历史记录
 * @param {Object} workflow - 工作流数据 { name, nodes, edges, viewport, tabId, workflowId }
 */
export function saveWorkflowToHistory(workflow) {
  if (!workflow || !workflow.nodes || workflow.nodes.length === 0) {
    return false
  }
  
  try {
    // 🔧 清理节点中的大数据（base64图片等）
    const cleanedNodes = cleanNodeData(workflow.nodes)
    const cleanedEdges = JSON.parse(JSON.stringify(workflow.edges || []))
    
    // 🔧 检查清理后的数据大小
    const testData = JSON.stringify({ nodes: cleanedNodes, edges: cleanedEdges })
    const dataSize = testData.length
    
    if (dataSize > MAX_SINGLE_WORKFLOW_SIZE) {
      console.warn(`[WorkflowAutoSave] 工作流数据过大 (${(dataSize / 1024).toFixed(1)}KB > ${MAX_SINGLE_WORKFLOW_SIZE / 1024}KB)，跳过历史保存`)
      console.warn(`[WorkflowAutoSave] 提示：请手动保存工作流到服务器，历史记录只用于临时恢复`)
      return false
    }
    
    let history = getWorkflowHistory()
    
    // 生成唯一ID
    const historyId = `history-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`
    
    // 创建历史记录（使用清理后的数据）
    const historyItem = {
      id: historyId,
      name: workflow.name || '未命名工作流',
      description: workflow.description || '',
      tabId: workflow.tabId || null,
      workflowId: workflow.workflowId || null,  // 原始工作流ID（如果是已保存的工作流）
      nodeCount: workflow.nodes.length,
      edgeCount: cleanedEdges.length,
      nodes: cleanedNodes,  // 使用清理后的节点
      edges: cleanedEdges,
      viewport: workflow.viewport ? { ...workflow.viewport } : { x: 0, y: 0, zoom: 1 },
      savedAt: Date.now(),
      dataSize: dataSize  // 记录数据大小，便于调试
    }
    
    // 检查是否有相同 tabId 的最近记录，避免重复保存相同内容
    if (workflow.tabId) {
      const recentSameTab = history.find(h => 
        h.tabId === workflow.tabId && 
        Date.now() - h.savedAt < 30000  // 30秒内的同一标签不重复保存
      )
      
      if (recentSameTab) {
        // 检查内容是否有变化
        const oldHash = generateSimpleHash(recentSameTab.nodes)
        const newHash = generateSimpleHash(cleanedNodes)
        
        if (oldHash === newHash) {
          console.log('[WorkflowAutoSave] 内容无变化，跳过保存')
          return false
        }
      }
    }
    
    // 关键优化：如果是已保存的工作流（有workflowId），移除同一workflowId的旧记录
    if (workflow.workflowId) {
      history = history.filter(h => h.workflowId !== workflow.workflowId)
    } else if (workflow.tabId) {
      // 如果是未保存的工作流，移除同一tabId的旧记录（保留最新的）
      history = history.filter(h => h.tabId !== workflow.tabId)
    }
    
    // 添加到历史记录开头
    history.unshift(historyItem)
    
    // 限制历史记录数量
    while (history.length > MAX_HISTORY_COUNT) {
      history.pop()
    }
    
    // 🔧 安全保存到 localStorage
    if (saveToLocalStorage(history)) {
      console.log(`[WorkflowAutoSave] 已保存工作流: ${historyItem.name} | 节点数: ${historyItem.nodeCount} | 大小: ${(dataSize / 1024).toFixed(1)}KB`)
      return true
    }
    return false
  } catch (error) {
    console.error('[WorkflowAutoSave] 保存失败:', error)
    return false
  }
}

/**
 * 生成简单的内容哈希（用于比较内容是否变化）
 */
function generateSimpleHash(nodes) {
  if (!nodes || nodes.length === 0) return ''
  
  // 只比较节点数量和位置信息
  return nodes.map(n => `${n.id}:${n.position?.x || 0},${n.position?.y || 0}`).join('|')
}

/**
 * 删除指定的历史记录
 * @param {String} historyId - 历史记录ID
 */
export function deleteWorkflowHistory(historyId) {
  try {
    const history = getWorkflowHistory()
    const newHistory = history.filter(h => h.id !== historyId)
    saveToLocalStorage(newHistory)
    console.log('[WorkflowAutoSave] 已删除历史记录:', historyId)
    return true
  } catch (error) {
    console.error('[WorkflowAutoSave] 删除失败:', error)
    return false
  }
}

/**
 * 更新历史工作流描述
 * @param {String} historyId - 历史记录ID
 * @param {String} description - 描述内容
 */
export function updateWorkflowHistoryDescription(historyId, description) {
  try {
    const history = getWorkflowHistory()
    const target = history.find(h => h.id === historyId)
    if (!target) return false

    target.description = String(description ?? '')
    return saveToLocalStorage(history)
  } catch (error) {
    console.error('[WorkflowAutoSave] 更新历史描述失败:', error)
    return false
  }
}

/**
 * 清空所有历史记录
 */
export function clearWorkflowHistory() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    console.log('[WorkflowAutoSave] 已清空所有历史记录')
    return true
  } catch (error) {
    console.error('[WorkflowAutoSave] 清空失败:', error)
    return false
  }
}

/**
 * 获取指定ID的历史工作流
 * @param {String} historyId - 历史记录ID
 */
export function getWorkflowHistoryById(historyId) {
  const history = getWorkflowHistory()
  return history.find(h => h.id === historyId) || null
}

/**
 * 启动自动保存服务
 * @param {Function} getWorkflowData - 获取当前工作流数据的函数
 */
export function startAutoSave(getWorkflowData) {
  stopAutoSave()  // 先停止之前的定时器
  
  console.log('[WorkflowAutoSave] 启动自动保存服务，间隔:', AUTO_SAVE_INTERVAL / 1000, '秒')
  
  autoSaveTimer = setInterval(() => {
    try {
      const workflowData = getWorkflowData()
      if (workflowData && workflowData.nodes && workflowData.nodes.length > 0) {
        saveWorkflowToHistory(workflowData)
      }
    } catch (error) {
      console.error('[WorkflowAutoSave] 自动保存出错:', error)
    }
  }, AUTO_SAVE_INTERVAL)
}

/**
 * 停止自动保存服务
 */
export function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer)
    autoSaveTimer = null
    console.log('[WorkflowAutoSave] 已停止自动保存服务')
  }
}

/**
 * 手动触发一次保存（用于关闭页面前等场景）
 * @param {Object} workflow - 工作流数据
 */
export function manualSave(workflow) {
  return saveWorkflowToHistory(workflow)
}

/**
 * 格式化保存时间
 * @param {Number} timestamp - 时间戳
 */
export function formatSaveTime(timestamp) {
  if (!timestamp) return '-'
  
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  
  const date = new Date(timestamp)
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * 格式化为北京时间，精确到分钟
 * @param {Number} timestamp - 时间戳
 */
export function formatBeijingSaveTime(timestamp) {
  if (!timestamp) return '-'

  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(new Date(timestamp))

  const value = type => parts.find(part => part.type === type)?.value || ''
  return `${value('year')}/${value('month')}/${value('day')} ${value('hour')}:${value('minute')}`
}

/**
 * 获取历史记录数量
 */
export function getHistoryCount() {
  return getWorkflowHistory().length
}

/**
 * 🔧 获取当前存储使用情况（用于调试）
 */
export function getStorageStats() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    const size = data ? data.length : 0
    const history = data ? JSON.parse(data) : []
    
    return {
      count: history.length,
      totalSize: size,
      totalSizeKB: (size / 1024).toFixed(2),
      maxSize: MAX_TOTAL_STORAGE_SIZE,
      maxSizeKB: (MAX_TOTAL_STORAGE_SIZE / 1024).toFixed(0),
      usagePercent: ((size / MAX_TOTAL_STORAGE_SIZE) * 100).toFixed(1)
    }
  } catch (e) {
    return { error: e.message }
  }
}
