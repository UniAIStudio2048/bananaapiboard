/**
 * IndexedDB 资产缓存工具
 * 
 * 用于缓存画布"我的资产"列表，减少重复请求，提升加载速度
 * 借鉴 historyCache.js 的设计，提供持久化缓存 + stale-while-revalidate 策略
 * 
 * 特性：
 * - 持久化存储：关闭浏览器后缓存仍在
 * - 自动过期：缓存 10 分钟后自动失效
 * - 按用户隔离：不同用户的缓存独立
 * - 空间感知：支持个人/团队空间的缓存隔离
 * - 类型感知：支持按资产类型（image/video/sora-character/seedance-character）隔离缓存
 */

const DB_NAME = 'BananaAssetCache'
const DB_VERSION = 1
const STORE_NAME = 'assets'
const CACHE_TTL = 10 * 60 * 1000 // 10分钟缓存有效期

let dbInstance = null
let dbInitPromise = null

function initDB() {
  if (dbInitPromise) return dbInitPromise
  
  dbInitPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'))
      return
    }
    
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => {
      console.error('[AssetCache] 打开数据库失败:', request.error)
      reject(request.error)
    }
    
    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' })
        store.createIndex('expireAt', 'expireAt', { unique: false })
      }
    }
  })
  
  return dbInitPromise
}

async function getDB() {
  if (dbInstance) return dbInstance
  return await initDB()
}

/**
 * 生成缓存键
 * @param {string} assetType - 资产类型 (all/image/video/sora-character/seedance-character)
 * @param {string} spaceType - 空间类型 (personal/team/all/current)
 * @param {string} teamId - 团队ID
 */
function getCacheKey(assetType, spaceType, teamId) {
  const userId = localStorage.getItem('userId') || 'anonymous'
  const tenantId = localStorage.getItem('tenantId') || 'default'
  return `asset:${assetType}:${userId}:${tenantId}:${spaceType || 'default'}:${teamId || 'none'}`
}

/**
 * 从缓存获取资产列表
 */
export async function getCachedAssets(assetType, spaceType, teamId) {
  try {
    const db = await getDB()
    const cacheKey = getCacheKey(assetType, spaceType, teamId)
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(cacheKey)
      
      request.onsuccess = () => {
        const result = request.result
        if (result) {
          if (result.expireAt > Date.now()) {
            console.log(`[AssetCache] 缓存命中: ${assetType}, ${spaceType}`)
            resolve(result.data)
          } else {
            deleteExpiredCache(cacheKey)
            resolve(null)
          }
        } else {
          resolve(null)
        }
      }
      
      request.onerror = () => {
        resolve(null)
      }
    })
  } catch (e) {
    return null
  }
}

/**
 * 缓存资产列表
 */
export async function cacheAssets(assetType, spaceType, teamId, data) {
  if (!data) return
  
  try {
    const db = await getDB()
    const cacheKey = getCacheKey(assetType, spaceType, teamId)
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      const cacheData = {
        cacheKey,
        assetType,
        spaceType,
        teamId,
        data,
        expireAt: Date.now() + CACHE_TTL,
        createdAt: Date.now()
      }
      
      const request = store.put(cacheData)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (e) {
    // 缓存失败不影响主流程
  }
}

async function deleteExpiredCache(cacheKey) {
  try {
    const db = await getDB()
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.delete(cacheKey)
  } catch (e) {
    // ignore
  }
}

/**
 * 使缓存失效
 * @param {string} assetType - 类型: 'image' | 'video' | 'sora-character' | 'seedance-character' | 'all'
 */
export async function invalidateAssetCache(assetType = 'all') {
  try {
    const db = await getDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      
      if (assetType === 'all') {
        store.clear()
      } else {
        const request = store.getAll()
        request.onsuccess = () => {
          const items = request.result || []
          items.forEach(item => {
            if (item.assetType === assetType || item.assetType === 'all') {
              store.delete(item.cacheKey)
            }
          })
        }
      }
      
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
    })
  } catch (e) {
    // ignore
  }
}

/**
 * 清理过期缓存
 */
export async function cleanupExpiredAssetCaches() {
  try {
    const db = await getDB()
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()
      
      request.onsuccess = () => {
        const items = request.result || []
        const now = Date.now()
        items.forEach(item => {
          if (item.expireAt <= now) {
            store.delete(item.cacheKey)
          }
        })
        resolve()
      }
      
      request.onerror = () => resolve()
    })
  } catch (e) {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  initDB()
    .then(() => cleanupExpiredAssetCaches())
    .catch(() => {})
}

export default {
  getCachedAssets,
  cacheAssets,
  invalidateAssetCache,
  cleanupExpiredAssetCaches
}
