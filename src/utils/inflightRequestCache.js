/**
 * 按 key 合并并发请求，并在 ttl 内复用成功结果。
 * - skipCache: 跳过缓存与进行中的请求，强制发起新请求（结果仍供后续调用复用）
 * - shouldCache: 决定结果是否写入短缓存（未写入的结果仍会被并发调用共享）
 * - invalidate(): 清空缓存；此前发起的请求返回后不会再写入缓存
 */
export function createInflightRequestCache({ ttl = 0, now = () => Date.now() } = {}) {
  const pending = new Map()
  const cached = new Map()
  let generation = 0

  function run(key, loader, { skipCache = false, shouldCache = () => true } = {}) {
    if (!skipCache) {
      const hit = cached.get(key)
      if (hit && now() - hit.at < ttl) return Promise.resolve(hit.value)
      if (pending.has(key)) return pending.get(key)
    }

    const startGeneration = generation
    let request
    try {
      request = Promise.resolve(loader())
    } catch (error) {
      request = Promise.reject(error)
    }
    const tracked = request
      .then((value) => {
        if (startGeneration === generation && shouldCache(value)) {
          cached.set(key, { value, at: now() })
        }
        return value
      })
      .finally(() => {
        if (pending.get(key) === tracked) pending.delete(key)
      })
    pending.set(key, tracked)
    return tracked
  }

  function invalidate() {
    generation += 1
    pending.clear()
    cached.clear()
  }

  return { run, invalidate }
}
