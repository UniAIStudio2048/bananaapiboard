// This controller owns playback only. Callers retain the original URL for downloads and editing.
export function createStreamVideoPlayback(video, sourceUrl, { resolve, loadHls = () => import('hls.js').then(module => module.default) } = {}) {
  let destroyed = false
  let hls = null
  let timer = null
  let attempts = 0
  let switched = false
  let compatibility = false
  let generatedPoster = null
  let resumeListener = null
  const previousPoster = video.poster
  const restorePosition = () => {
    if (resumeListener) video.removeEventListener('loadedmetadata', resumeListener)
    const position = Number(video.currentTime) || 0
    const playing = !video.paused || video.autoplay
    resumeListener = () => {
      if (destroyed) return
      if (position > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(position, Math.max(0, video.duration - 0.05))
      if (playing) video.play().catch(() => {})
    }
    video.addEventListener('loadedmetadata', resumeListener, { once: true })
  }
  const fallback = () => {
    if (destroyed || !switched) return
    switched = false
    restorePosition()
    hls?.destroy()
    hls = null
    video.removeEventListener('error', fallback)
    video.controlsList?.remove('nodownload')
    if (video.poster === generatedPoster) video.poster = previousPoster
    video.src = sourceUrl
    video.load()
  }
  function requestCompatibility() {
    if (destroyed || switched || compatibility || ![3, 4].includes(video.error?.code)) return
    compatibility = true
    attempts = 0
    clearTimeout(timer)
    video.removeEventListener('error', requestCompatibility)
    void start()
  }
  video.addEventListener('error', requestCompatibility)

  async function start() {
    if (destroyed || !/^https?:\/\//i.test(sourceUrl)) return
    const compatibilityRequested = compatibility
    try {
      const result = await resolve(sourceUrl, { compatibility: compatibilityRequested })
      if (destroyed || compatibilityRequested !== compatibility) return
      if (result.status !== 'ready' || !/^https:\/\//i.test(result.playbackUrl || '')) {
        if (['pending', 'submitting', 'encoding', 'local', 'transcoding'].includes(result.status) && ++attempts < 180) {
          timer = setTimeout(start, 10000)
        }
        return
      }
      const native = result.provider === 'cos_mp4' || !!video.canPlayType('application/vnd.apple.mpegurl')
      const Hls = native ? null : await loadHls()
      if (destroyed || compatibilityRequested !== compatibility || (!native && !Hls.isSupported())) return
      restorePosition()
      switched = true
      video.removeEventListener('error', requestCompatibility)
      video.controlsList?.add('nodownload')
      if (!previousPoster && /^https:\/\//i.test(result.posterUrl || '')) {
        generatedPoster = result.posterUrl
        video.poster = generatedPoster
      }
      if (native) {
        video.addEventListener('error', fallback)
        video.src = result.playbackUrl
        video.load()
      } else {
        hls = new Hls({ maxBufferLength: 20, backBufferLength: 30 })
        hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) fallback() })
        hls.loadSource(result.playbackUrl)
        hls.attachMedia(video)
      }
    } catch {
      if (compatibilityRequested === compatibility) fallback()
    }
  }
  return {
    start,
    destroy() {
      destroyed = true
      clearTimeout(timer)
      video.removeEventListener('error', requestCompatibility)
      video.removeEventListener('error', fallback)
      if (resumeListener) video.removeEventListener('loadedmetadata', resumeListener)
      hls?.destroy()
      if (switched) {
        video.controlsList?.remove('nodownload')
        if (video.poster === generatedPoster) video.poster = previousPoster
      }
    }
  }
}
