/**
 * Phase 2.4 — 节点 data 的 LRU 缓存
 *
 * 设计目标：
 *   - 增量加载场景下，视口外节点只保留 Shell（id/type/position/size），
 *     完整 data 按需通过 GET /nodes?ids=... 拉取
 *   - 命中缓存：viewport 平移/缩放回到已加载区域立刻可见
 *   - 未命中或过期：触发请求队列；视口外久未使用的节点 data 可被驱逐
 *
 * 受双约束（任一触发即驱逐最旧）：
 *   - 节点条目数（默认 800）
 *   - 估算字节数（默认 16MB，避免大量 base64 撑爆内存）
 *
 * 注意：完全纯 JS，不依赖 Vue/Pinia，方便单测。
 */

const DEFAULT_MAX_ENTRIES = 800
const DEFAULT_MAX_BYTES = 16 * 1024 * 1024 // 16 MB

function estimateBytes(value) {
  if (value == null) return 0
  try {
    // 经验值：JSON 字符串长度 ≈ 内存占用（base64/字符串占大头）
    return JSON.stringify(value).length
  } catch {
    return 256
  }
}

export class NodeDataCache {
  /**
   * @param {object} [options]
   * @param {number} [options.maxEntries] 默认 800
   * @param {number} [options.maxBytes]   默认 16MB
   * @param {(node: { id: string }) => void} [options.onEvict] 节点被驱逐时回调（可选）
   */
  constructor(options = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    this.onEvict = typeof options.onEvict === 'function' ? options.onEvict : null
    /** @type {Map<string, { node: any, size: number, version: number }>} */
    this.entries = new Map() // Map 本身就是 insertion-order，重新 set 即可"刷新"
    this.bytesUsed = 0
    this.pinned = new Set() // 不被驱逐的节点 id（如：当前选中的节点）
  }

  /** 当前已缓存的节点数 */
  get size() { return this.entries.size }

  /** 是否已缓存某节点 */
  has(id) { return this.entries.has(id) }

  /**
   * 设置/更新节点缓存（标记为最近使用）
   *
   * @param {string} id
   * @param {object} node 节点对象，至少含 { id, data, version? }
   */
  set(id, node) {
    if (!id) return
    const size = estimateBytes(node?.data)
    const existing = this.entries.get(id)
    if (existing) {
      this.bytesUsed -= existing.size
      this.entries.delete(id)
    }
    this.entries.set(id, { node, size, version: node?.version || 0 })
    this.bytesUsed += size
    this.evictIfNeeded()
  }

  /**
   * 读取节点；命中时刷新为最近使用
   */
  get(id) {
    const entry = this.entries.get(id)
    if (!entry) return null
    // touch：重新插入到 Map 末尾（最新位置）
    this.entries.delete(id)
    this.entries.set(id, entry)
    return entry.node
  }

  /** 仅查询是否命中，不更新 LRU 顺序 */
  peek(id) { return this.entries.get(id)?.node ?? null }

  /** 删除某节点缓存 */
  delete(id) {
    const entry = this.entries.get(id)
    if (!entry) return false
    this.bytesUsed -= entry.size
    this.entries.delete(id)
    this.pinned.delete(id)
    return true
  }

  /** 清空所有缓存 */
  clear() {
    this.entries.clear()
    this.pinned.clear()
    this.bytesUsed = 0
  }

  /** 把节点标记为"不可驱逐"（典型场景：当前选中节点） */
  pin(id) { if (id) this.pinned.add(id) }
  unpin(id) { this.pinned.delete(id) }

  /**
   * 视口提示：传入当前视口内 + 缓冲区内的节点 id 集合
   * 这些节点 + pinned 节点会被 touch 到最新位置，离视口最远的节点会优先被驱逐。
   * 对 id 集合外的节点不做强制清理，仅在 evictIfNeeded 中按 LRU 顺序处理。
   */
  touchMany(ids) {
    if (!ids) return
    for (const id of ids) {
      const entry = this.entries.get(id)
      if (entry) {
        this.entries.delete(id)
        this.entries.set(id, entry)
      }
    }
  }

  /** 当前预估内存占用（字节） */
  getBytesUsed() { return this.bytesUsed }

  /** 调试统计 */
  getStats() {
    return {
      size: this.entries.size,
      bytesUsed: this.bytesUsed,
      pinned: this.pinned.size,
      maxEntries: this.maxEntries,
      maxBytes: this.maxBytes
    }
  }

  /**
   * 驱逐到符合 maxEntries / maxBytes 约束。
   * pinned 节点被跳过。
   */
  evictIfNeeded() {
    if (this.entries.size <= this.maxEntries && this.bytesUsed <= this.maxBytes) return
    const iter = this.entries.keys()
    let next = iter.next()
    while (
      !next.done &&
      (this.entries.size > this.maxEntries || this.bytesUsed > this.maxBytes)
    ) {
      const id = next.value
      next = iter.next() // 在 delete 之前先取下一个迭代器位置（删除会让 next.done 变 true）
      if (this.pinned.has(id)) continue
      const entry = this.entries.get(id)
      if (!entry) continue
      this.bytesUsed -= entry.size
      this.entries.delete(id)
      if (this.onEvict) {
        try { this.onEvict(entry.node) } catch (err) {
          console.warn('[NodeDataCache] onEvict 回调出错:', err.message)
        }
      }
    }
  }
}

// 模块级单例（前端只需要一份）；测试时可直接 new NodeDataCache() 取得独立实例
let globalCache = null
export function getGlobalNodeDataCache(options) {
  if (!globalCache) globalCache = new NodeDataCache(options)
  return globalCache
}
export function resetGlobalNodeDataCache() {
  globalCache = null
}
