/**
 * AI 灵感助手「立即插入」决策纯函数。
 *
 * 语义约定（与 AIAssistantPanel.sendMessage 的排队判断同源）：
 * - 回合运行中点「立即插入」→ 不取消当前回合，把消息置顶为「本轮结束后立即发送」；
 * - 空闲时点「立即插入」→ 直接发送该消息。
 */

/**
 * 判断当前是否有一轮对话在运行/等待派发。
 * @param {Object} state
 * @param {boolean} state.enhancedMode 是否增强模式
 * @param {boolean} state.isLoading 本地流式发送进行中
 * @param {boolean} state.activeTurnRunning 服务端 activeTurn 处于运行态
 * @param {number} state.serverQueueLength 服务端排队消息数
 * @param {string} state.activeTurnStatus activeTurn 状态（'queued' 表示回合已入队未派发）
 * @returns {boolean}
 */
export function isAssistantRoundBusy({ enhancedMode, isLoading, activeTurnRunning = false, serverQueueLength = 0, activeTurnStatus = 'idle' }) {
  if (!enhancedMode) return Boolean(isLoading)
  return Boolean(isLoading) || activeTurnRunning || serverQueueLength > 0 || activeTurnStatus === 'queued'
}

/**
 * 本地兜底队列挑选下一条要发送的草稿：置顶（priority）项优先，其次按原顺序。
 * @param {Array<{priority?: boolean}>} items
 * @returns {number} 选中项下标；空队列返回 -1
 */
export function pickNextQueuedIndex(items) {
  if (!Array.isArray(items) || items.length === 0) return -1
  const priorityIndex = items.findIndex((item) => item && item.priority)
  return priorityIndex >= 0 ? priorityIndex : 0
}

/**
 * 过滤队列条可见项：已点「立即插入」置顶并进入聊天区的消息从队列条隐藏
 * （服务端在被调度器认领前仍会把它列在 queued_turns 里，需本地过滤）。
 * @param {Array<{turn_id?: string, client_message_id?: string}>} items
 * @param {Set<string>} hiddenKeys 已隐藏的 turn_id / client_message_id 集合
 * @returns {Array} 可见项（保持原顺序）
 */
export function filterVisibleQueueItems(items, hiddenKeys) {
  if (!Array.isArray(items)) return []
  if (!hiddenKeys || hiddenKeys.size === 0) return items
  return items.filter((item) => {
    if (!item) return false
    return !(item.turn_id && hiddenKeys.has(item.turn_id)) &&
      !(item.client_message_id && hiddenKeys.has(item.client_message_id))
  })
}
