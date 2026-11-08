// 普通 LLM 请求绑定在当前页面上，没有可恢复的任务 ID；页面刷新后请求已失效，而 processing 状态已被保存。
const activeNodeIds = new Set()

export const TEXT_NODE_LLM_INTERRUPTED_ERROR = '页面刷新或离开后生成已中断，请重新生成'

export function trackTextNodeLlmRequest(nodeId) {
  activeNodeIds.add(nodeId)
  return () => activeNodeIds.delete(nodeId)
}

export function isOrphanedTextNodeLlmRequest(nodeId, data) {
  return data?.status === 'processing'
    && !data.analysisRequestId
    && !data.analysisTaskId
    && !activeNodeIds.has(nodeId)
}
