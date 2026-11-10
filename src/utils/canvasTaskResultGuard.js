/**
 * 节点重新提交生成后，远端或恢复来源里本次生成之前的状态不能覆盖本次生成，
 * 否则节点会从"生成中"跳回旧视频/旧图片。
 *
 * 本地 processingStartedAt 在保存和提交之前就已写入，因此本次生成的状态一定带有
 * 相同的开始时间或相同的 taskId；开始时间更早或缺失的状态属于之前，不论其 status：
 * 上一次任务的 success/error、复制粘贴节点的 idle + 旧视频、上一轮 processing 的旧 taskId。
 */
const IN_FLIGHT_STATUSES = new Set(['processing', 'pending'])

function getTaskId(data) {
  return String(data?.taskId || data?.soraTaskId || '')
}

export function isStaleTaskResultForInFlightNode(localData, incomingData) {
  const startedAt = Number(localData?.processingStartedAt)
  if (!IN_FLIGHT_STATUSES.has(localData?.status) || !(startedAt > 0)) return false
  if (!incomingData) return false
  const localTaskId = getTaskId(localData)
  if (localTaskId && localTaskId === getTaskId(incomingData)) return false
  return (Number(incomingData?.processingStartedAt) || 0) < startedAt
}

/** 旧任务结果中不能覆盖本地生成状态的字段 */
export const TASK_RESULT_FIELDS = [
  'output', 'status', 'progress', 'error', 'taskId', 'soraTaskId',
  'processingStartedAt', 'completedAt', 'videoUrl'
]
