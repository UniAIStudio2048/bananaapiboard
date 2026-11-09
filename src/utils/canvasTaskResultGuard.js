/**
 * 节点重新提交生成后，远端或恢复来源里上一次任务的终态结果不能覆盖本次生成，
 * 否则节点会从"生成中"跳回旧视频/旧图片。
 *
 * 本地 processingStartedAt 在保存和提交之前就已写入，因此本次生成的结果一定带有
 * 相同的开始时间或相同的 taskId；开始时间更早或缺失的终态结果属于旧任务。
 */
const IN_FLIGHT_STATUSES = new Set(['processing', 'pending'])
const TERMINAL_STATUSES = new Set(['success', 'error'])

function getTaskId(data) {
  return String(data?.taskId || data?.soraTaskId || '')
}

export function isStaleTaskResultForInFlightNode(localData, incomingData) {
  const startedAt = Number(localData?.processingStartedAt)
  if (!IN_FLIGHT_STATUSES.has(localData?.status) || !(startedAt > 0)) return false
  if (!TERMINAL_STATUSES.has(incomingData?.status)) return false
  const localTaskId = getTaskId(localData)
  if (localTaskId && localTaskId === getTaskId(incomingData)) return false
  return (Number(incomingData?.processingStartedAt) || 0) < startedAt
}

/** 旧任务结果中不能覆盖本地生成状态的字段 */
export const TASK_RESULT_FIELDS = [
  'output', 'status', 'progress', 'error', 'taskId', 'soraTaskId',
  'processingStartedAt', 'completedAt', 'videoUrl'
]
