/**
 * 🚀 IndexedDB 历史记录缓存工具
 * 
 * 用于缓存画布历史记录列表，减少重复请求，提升加载速度
 * 
 * 特性：
 * - 持久化存储：关闭浏览器后缓存仍在
 * - 自动过期：缓存 10 分钟后自动失效
 * - 按用户隔离：不同用户的缓存独立
 * - 空间感知：支持个人/团队空间的缓存隔离
 */

const DB_NAME = 'BananaHistoryCache'
const DB_VERSION = 1
const STORE_NAME = 'history'
const CACHE_TTL = 10 * 60 * 1000 // 10分钟缓存有效期

let dbInstance = null
let dbInitPromise = null

/**
 * 初始化 IndexedDB
 */
function initDB() {
  if (dbInitPromise) return dbInitPromise
  
  dbInitPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('[HistoryCache] 浏览器不支持 IndexedDB')
      reject(new Error('IndexedDB not supported'))
      return
    }
    
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => {
      console.error('[HistoryCache] 打开数据库失败:', request.error)
      reject(request.error)
    }
    
    request.onsuccess = () => {
      dbInstance = request.result
      console.log('[HistoryCache] ✅ IndexedDB 初始化成功')
      resolve(dbInstance)
    }
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      
      // 创建历史记录存储
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' })
        // 创建索引用于按时间清理
        store.createIndex('expireAt', 'expireAt', { unique: false })
        console.log('[HistoryCache] 创建 IndexedDB 存储')
      }
    }
  })
  
  return dbInitPromise
}

/**
 * 获取数据库实例
 */
async function getDB() {
  if (dbInstance) return dbInstance
  return await initDB()
}

/**
 * 生成缓存键
 * @param {string} type - 历史类型 (image/video/music/all)
 * @param {string} spaceType - 空间类型 (personal/team/all/current)
 * @param {string} teamId - 团队ID
 */
function getCacheKey(type, spaceType, teamId) {
  const userId = localStorage.getItem('userId') || 'anonymous'
  const tenantId = localStorage.getItem('tenantId') || 'default'
  return `history:${type}:${userId}:${tenantId}:${spaceType || 'default'}:${teamId || 'none'}`
}

/**
 * 从缓存获取历史记录
 * @param {string} type - 历史类型
 * @param {string} spaceType - 空间类型
 * @param {string} teamId - 团队ID
 * @returns {Promise<Array|null>} 历史记录数组或 null
 */
export async function getCachedHistory(type, spaceType, teamId) {
  try {
    const db = await getDB()
    const cacheKey = getCacheKey(type, spaceType, teamId)
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(cacheKey)
      
      request.onsuccess = () => {
        const result = request.result
        if (result) {
          // 检查是否过期
          if (result.expireAt > Date.now()) {
            console.log(`[HistoryCache] 🎯 缓存命中: ${type}, ${spaceType}`)
            resolve(result.data)
          } else {
            console.log(`[HistoryCache] 缓存已过期: ${type}`)
            // 删除过期缓存
            deleteExpiredCache(cacheKey)
            resolve(null)
          }
        } else {
          resolve(null)
        }
      }
      
      request.onerror = () => {
        console.warn('[HistoryCache] 获取缓存失败:', request.error)
        resolve(null)
      }
    })
  } catch (e) {
    console.warn('[HistoryCache] 获取缓存异常:', e)
    return null
  }
}

/**
 * 缓存历史记录
 * @param {string} type - 历史类型
 * @param {string} spaceType - 空间类型
 * @param {string} teamId - 团队ID
 * @param {Array} data - 历史记录数据
 */
export async function cacheHistory(type, spaceType, teamId, data) {
  if (!data) return
  
  try {
    const db = await getDB()
    const cacheKey = getCacheKey(type, spaceType, teamId)
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      const cacheData = {
        cacheKey,
        type,
        spaceType,
        teamId,
        data,
        expireAt: Date.now() + CACHE_TTL,
        createdAt: Date.now()
      }
      
      const request = store.put(cacheData)
      
      request.onsuccess = () => {
        console.log(`[HistoryCache] ✅ 缓存成功: ${type}, ${data.length} 条记录`)
        resolve()
      }
      
      request.onerror = () => {
        console.warn('[HistoryCache] 缓存失败:', request.error)
        reject(request.error)
      }
    })
  } catch (e) {
    console.warn('[HistoryCache] 缓存异常:', e)
  }
}

/**
 * 删除过期缓存
 */
async function deleteExpiredCache(cacheKey) {
  try {
    const db = await getDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.delete(cacheKey)
  } catch (e) {
    // 忽略删除错误
  }
}

/**
 * 使缓存失效（当生成新内容或删除内容时调用）
 * @param {string} type - 类型: 'image' | 'video' | 'music' | 'all'
 */
export async function invalidateCache(type = 'all') {
  try {
    const db = await getDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      if (type === 'all') {
        // 清空所有缓存
        store.clear()
        console.log('[HistoryCache] 🗑️ 已清空所有缓存')
      } else {
        // 获取所有缓存并删除匹配类型的
        const request = store.getAll()
        request.onsuccess = () => {
          const items = request.result || []
          let deleted = 0
          items.forEach(item => {
            if (item.type === type || item.type === 'all') {
              store.delete(item.cacheKey)
              deleted++
            }
          })
          console.log(`[HistoryCache] 🗑️ 已清除 ${deleted} 个 ${type} 缓存`)
        }
      }
      
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
    })
  } catch (e) {
    console.warn('[HistoryCache] 清除缓存失败:', e)
  }
}

/**
 * 获取缓存统计信息
 */
export async function getCacheStats() {
  try {
    const db = await getDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()
      
      request.onsuccess = () => {
        const items = request.result || []
        const now = Date.now()
        const validItems = items.filter(item => item.expireAt > now)
        const expiredItems = items.filter(item => item.expireAt <= now)
        
        const totalRecords = validItems.reduce((sum, item) => sum + (item.data?.length || 0), 0)
        
        resolve({
          totalCaches: validItems.length,
          expiredCaches: expiredItems.length,
          totalRecords,
          types: validItems.map(item => item.type),
          oldestCache: validItems.length > 0 
            ? new Date(Math.min(...validItems.map(i => i.createdAt))).toLocaleString()
            : null
        })
      }
      
      request.onerror = () => {
        resolve({ error: request.error })
      }
    })
  } catch (e) {
    return { error: e.message }
  }
}

/**
 * 清空所有缓存
 */
export async function clearCache() {
  return invalidateCache('all')
}

/**
 * 清理过期缓存（可在应用启动时调用）
 */
export async function cleanupExpiredCaches() {
  try {
    const db = await getDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()
      
      request.onsuccess = () => {
        const items = request.result || []
        const now = Date.now()
        let deleted = 0
        
        items.forEach(item => {
          if (item.expireAt <= now) {
            store.delete(item.cacheKey)
            deleted++
          }
        })
        
        if (deleted > 0) {
          console.log(`[HistoryCache] 🧹 清理了 ${deleted} 个过期缓存`)
        }
        resolve(deleted)
      }
      
      request.onerror = () => resolve(0)
    })
  } catch (e) {
    return 0
  }
}

// 页面加载时初始化并清理过期缓存
if (typeof window !== 'undefined') {
  initDB()
    .then(() => cleanupExpiredCaches())
    .catch(() => {})
}

export default {
  getCachedHistory,
  cacheHistory,
  invalidateCache,
  getCacheStats,
  clearCache,
  cleanupExpiredCaches
}

