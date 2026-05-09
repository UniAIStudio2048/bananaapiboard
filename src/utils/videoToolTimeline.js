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

    return {
      ...clip,
      url,
      startTime,
      endTime,
      duration: endTime - startTime
    }
  })
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
