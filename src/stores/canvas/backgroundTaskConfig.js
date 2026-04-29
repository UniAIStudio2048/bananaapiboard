export function getTaskStatusConfig(taskType) {
  if (taskType === 'video-hd-upscale' || taskType === 'video-hd') {
    return { statusApi: 'video-hd', resultType: 'video', longRunning: true }
  }
  if (taskType === 'image-hd') {
    return { statusApi: 'image-hd', resultType: 'image', longRunning: true }
  }
  if (taskType === 'image-panorama') {
    return { statusApi: 'image-panorama', resultType: 'image', longRunning: true }
  }
  if (taskType === 'image-cutout') {
    return { statusApi: 'image-cutout', resultType: 'image', longRunning: true }
  }
  if (taskType === 'audio-edit') {
    return { statusApi: 'audio-edit', resultType: 'audio', longRunning: true }
  }
  if (taskType === 'video') {
    return { statusApi: 'video', resultType: 'video', longRunning: true }
  }
  return { statusApi: 'image', resultType: 'image', longRunning: false }
}
