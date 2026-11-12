/**
 * 画布编辑租约控制器
 *
 * - 每个已打开且已保存的工作流标签页各自持有租约；关闭标签页或页面时释放
 *   （切换画布标签不释放，避免切回时为防覆盖而被迫重新加载、丢失未保存修改）
 * - 定时心跳续期（后台标签页定时器被节流到 1 分钟仍小于服务端 75 秒 TTL）
 * - 他人持有时只读；抢占成功或从只读重新获得编辑权后，从服务端重新加载最新内容
 * - 收到交接请求：先保存再让出；被抢占：转为只读并通知调用方
 * - 只读时收到 workflow_saved：当前工作流重新加载，后台工作流切回时再加载
 */
import { computed, ref, watch, getCurrentInstance, onBeforeUnmount } from 'vue'

export function useCanvasEditLease({
  lease,
  getOpenWorkflowIds,
  getCurrentWorkflowId,
  saveBeforeYield,
  reloadWorkflow,
  onKicked,
  heartbeatMs = 20 * 1000,
  target = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null,
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval
}) {
  const takingOver = ref(false)
  const pendingReload = new Set()
  let reloading = null
  let disposed = false

  const currentState = computed(() => lease.getState(getCurrentWorkflowId()))
  const isReadonly = computed(() => currentState.value?.mode === 'readonly')

  async function reload(workflowId) {
    pendingReload.delete(workflowId)
    if (reloading) {
      // 重新加载进行中再收到保存通知：结束后补一次，避免并发覆盖
      pendingReload.add(workflowId)
      return reloading
    }
    reloading = Promise.resolve(reloadWorkflow(workflowId))
      .catch(err => console.warn('[CanvasEditLease] 重新加载工作流失败:', err?.message || err))
      .finally(() => { reloading = null })
    await reloading
    if (pendingReload.has(workflowId) && workflowId === getCurrentWorkflowId()) await reload(workflowId)
  }

  async function syncOpenWorkflows(ids = [], previous = []) {
    for (const id of previous) {
      if (!ids.includes(id)) {
        lease.release(id)
        pendingReload.delete(id)
      }
    }
    for (const id of ids) {
      if (disposed || !getOpenWorkflowIds().includes(id)) continue
      const state = lease.getState(id)
      // eslint-disable-next-line no-await-in-loop
      if (!state || state.mode === 'released' || state.mode === 'unknown') await lease.acquire(id)
    }
  }

  /** 切换或重新可见只恢复已释放/未知的租约；只读状态必须显式拿回编辑权 */
  async function refreshCurrent() {
    const id = getCurrentWorkflowId()
    if (!id) return
    const state = lease.getState(id)
    if (state?.mode === 'editor' || state?.mode === 'pending') return
    if (state?.mode === 'released' || state?.mode === 'unknown') {
      // 已释放期间其他会话可能已编辑：恢复后同步最新内容
      const mayBeStale = state.mode === 'released'
      const result = await lease.acquire(id)
      if (result.mode === 'editor' && mayBeStale) {
        await reload(id)
        return
      }
    }
    if (pendingReload.has(id) && lease.getState(id)?.mode === 'readonly') await reload(id)
  }

  async function takeover() {
    const id = getCurrentWorkflowId()
    if (!id || takingOver.value) return null
    takingOver.value = true
    try {
      const result = await lease.takeover(id)
      if (result?.mode === 'editor') await reload(id)
      return result
    } finally {
      takingOver.value = false
    }
  }

  async function handleHandoverRequest(workflowId) {
    if (lease.getState(workflowId)?.mode !== 'editor') return
    try {
      await saveBeforeYield(workflowId)
    } catch (err) {
      console.warn('[CanvasEditLease] 交接前保存失败:', err?.message || err)
    }
    await lease.yieldLease(workflowId)
  }

  function handleLeaseChanged(workflowId, payload = {}) {
    if (lease.applyLeaseChanged(workflowId, payload)) onKicked?.(workflowId, payload.holder || null)
  }

  async function handleWorkflowSaved(workflowId) {
    if (lease.getState(workflowId)?.mode !== 'readonly') return
    if (workflowId === getCurrentWorkflowId()) await reload(workflowId)
    else pendingReload.add(workflowId)
  }

  function handleVisibilityChange() {
    if (doc?.visibilityState !== 'visible') return
    refreshCurrent()
    lease.heartbeat()
  }

  function handlePageHide() {
    for (const id of getOpenWorkflowIds()) lease.release(id)
  }

  const stopOpenWatch = watch(
    () => getOpenWorkflowIds().join('\n'),
    (next, prev) => { syncOpenWorkflows(next ? next.split('\n') : [], prev ? prev.split('\n') : []) },
    { immediate: true }
  )
  const stopCurrentWatch = watch(() => getCurrentWorkflowId(), (next, prev) => {
    if (next && next !== prev) refreshCurrent()
  })
  const heartbeatTimer = setIntervalImpl(() => lease.heartbeat(), heartbeatMs)
  target?.addEventListener?.('pagehide', handlePageHide)
  doc?.addEventListener?.('visibilitychange', handleVisibilityChange)

  function dispose() {
    disposed = true
    stopOpenWatch()
    stopCurrentWatch()
    clearIntervalImpl(heartbeatTimer)
    target?.removeEventListener?.('pagehide', handlePageHide)
    doc?.removeEventListener?.('visibilitychange', handleVisibilityChange)
    handlePageHide()
  }

  if (getCurrentInstance()) onBeforeUnmount(dispose)

  return {
    currentState,
    isReadonly,
    takingOver,
    takeover,
    handleHandoverRequest,
    handleLeaseChanged,
    handleWorkflowSaved,
    dispose
  }
}
