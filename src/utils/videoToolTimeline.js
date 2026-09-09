function normalizeNumber(value, name) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${name} must be a non-negative number`)
  }
  return n
}

function normalizeUrl(value, index) {
  const url = String(value || '').trim()
  const isAccessibleUrl = /^https?:\/\//i.test(url) || url.startsWith('/api/') || url.startsWith('/uploads/')
  if (!isAccessibleUrl) {
    throw new Error(`clips[${index}].url must be an accessible video URL`)
  }
  return url
}

export function normalizeTimelineClips(clips) {
  if (!Array.isArray(clips) || clips.length === 0) {
    throw new Error('clips must be a non-empty array')
  }

  return clips.map((clip, index) => {
    const url = normalizeUrl(clip?.url, index)
    const startTime = normalizeNumber(clip?.startTime ?? 0, `clips[${index}].startTime`)
    const endTime = normalizeNumber(clip?.endTime, `clips[${index}].endTime`)

    if (endTime <= startTime) {
      throw new Error(`clips[${index}].endTime must be greater than startTime`)
    }
    const playbackRate = normalizeEditProperty(clip.playbackRate ?? 1, 'playbackRate', 0.25, 4)
    const volumeDb = normalizeEditProperty(clip.volumeDb ?? 0, 'volumeDb', -60, 12)

    return {
      ...clip,
      url,
      startTime,
      endTime,
      playbackRate,
      volumeDb,
      duration: (endTime - startTime) / playbackRate
    }
  })
}

function normalizeEditProperty(value, name, min, max) {
  const number = Number(value)
  if (value === '' || typeof value === 'boolean' || !Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${name} must be between ${min} and ${max}`)
  }
  return number
}

export function getClipDuration(clip) {
  return Math.max(0, (Number(clip?.endTime) || 0) - (Number(clip?.startTime) || 0)) / (Number(clip?.playbackRate) || 1)
}

export function timelineTimeToSource(clips, time) {
  let offset = 0
  for (const [clipIndex, clip] of clips.entries()) {
    const duration = getClipDuration(clip)
    if (time < offset + duration || clipIndex === clips.length - 1) {
      return { clipIndex, localTime: clip.startTime + Math.min(duration, Math.max(0, time - offset)) * (clip.playbackRate || 1) }
    }
    offset += duration
  }
  return { clipIndex: 0, localTime: 0 }
}

export function sourceTimeToTimeline(clips, clipIndex, localTime) {
  const clip = clips[clipIndex]
  if (!clip) return 0
  const offset = clips.slice(0, clipIndex).reduce((sum, entry) => sum + getClipDuration(entry), 0)
  return offset + Math.min(getClipDuration(clip), Math.max(0, localTime - clip.startTime) / (clip.playbackRate || 1))
}

export function getSplitDisabledReason(clips, selectedClipId, time, action) {
  const index = clips.findIndex(clip => clip.id === selectedClipId)
  if (index < 0) return '请先选择片段'
  const clip = clips[index]
  if (!(clip.sourceDuration > 0)) return '正在确认素材时长，暂不能分割'
  const offset = clips.slice(0, index).reduce((sum, entry) => sum + getClipDuration(entry), 0)
  const leftDuration = time - offset
  const rightDuration = getClipDuration(clip) - leftDuration
  if (!Number.isFinite(time) || leftDuration <= 0 || rightDuration <= 0) return '请将播放头移到选中片段内部'
  if ((action !== 'left' && leftDuration < 0.1 - 1e-8) || (action !== 'right' && rightDuration < 0.1 - 1e-8)) {
    return '分割后片段时长不能少于 0.1 秒'
  }
  return ''
}

export function splitTimelineClip(clips, selectedClipId, time, action) {
  if (!['split', 'left', 'right'].includes(action)) throw new Error('未知分割操作')
  const reason = getSplitDisabledReason(clips, selectedClipId, time, action)
  if (reason) throw new Error(reason)
  const index = clips.findIndex(clip => clip.id === selectedClipId)
  const clip = clips[index]
  const { localTime } = timelineTimeToSource(clips, time)
  const left = { ...clip, endTime: localTime }
  const right = { ...clip, startTime: localTime }
  left.duration = getClipDuration(left)
  right.duration = getClipDuration(right)
  if (action === 'split') {
    left.id = globalThis.crypto.randomUUID()
    right.id = globalThis.crypto.randomUUID()
  }
  const replacements = action === 'left' ? [right] : action === 'right' ? [left] : [left, right]
  return {
    clips: [...clips.slice(0, index), ...replacements, ...clips.slice(index + 1)],
    selectedClipId: replacements[replacements.length - 1].id
  }
}

export function selectedExportClips(clips, selectedClipId) {
  const clip = clips.find(entry => entry.id === selectedClipId)
  if (!clip) throw new Error('请先选择要导出的片段')
  return normalizeTimelineClips([JSON.parse(JSON.stringify(clip))])
}

export function buildVideoEditDraft(sourceUrl, clips, selectedClipId) {
  return JSON.parse(JSON.stringify({ version: 1, sourceUrl, clips: clips.length ? normalizeTimelineClips(clips) : [], selectedClipId }))
}

export function restoreVideoEditDraft(draft, sourceUrl) {
  if (!draft || draft.version !== 1 || draft.sourceUrl !== sourceUrl || !Array.isArray(draft.clips)) return null
  try {
    const clips = draft.clips.length ? normalizeTimelineClips(draft.clips) : []
    if (clips.some(clip => !clip.id) || new Set(clips.map(clip => clip.id)).size !== clips.length) return null
    return { clips, selectedClipId: clips.some(clip => clip.id === draft.selectedClipId) ? draft.selectedClipId : clips[0]?.id || null }
  } catch {
    return null
  }
}

export function getTimelineTotalSeconds(clips) {
  if (!Array.isArray(clips)) return 0
  return clips.reduce((sum, clip) => sum + Math.max(0, Number(clip?.duration) || 0), 0)
}

export function buildTimelineEstimate(clips) {
  const normalizedClips = normalizeTimelineClips(clips)
  return {
    clips: normalizedClips,
    totalSeconds: getTimelineTotalSeconds(normalizedClips)
  }
}
