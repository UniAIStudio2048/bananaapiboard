export function isVideoHdTask(taskId, nodeData = {}) {
  return nodeData?.taskType === 'video-hd' ||
    nodeData?.taskType === 'video-hd-upscale' ||
    nodeData?.hdUpscaled === true ||
    (typeof taskId === 'string' && taskId.startsWith('hd_'))
}

export async function fetchVideoTaskStatus(taskId, nodeData = {}, statusApis) {
  if (!statusApis?.getVideoHdTaskStatus || !statusApis?.getVideoTaskStatus) {
    throw new Error('缺少视频任务状态查询函数')
  }

  return isVideoHdTask(taskId, nodeData)
    ? statusApis.getVideoHdTaskStatus(taskId)
    : statusApis.getVideoTaskStatus(taskId)
}
