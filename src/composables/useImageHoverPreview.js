import { getCanvasThumbnailUrl } from '@/utils/canvasThumbnail'

const PREVIEW_WIDTH = 512
const PREVIEW_MAX_SIZE = 280
const SHOW_DELAY = 250
const HIDE_DELAY = 60
const GAP = 8

let previewEl = null
let imgEl = null
let videoEl = null
let audioEl = null
let currentUrl = null
let currentType = null
let showTimer = null
let hideTimer = null
let targetEl = null
let aliveCheckId = null

function ensurePreviewEl() {
  if (previewEl && document.body.contains(previewEl)) return
  previewEl = document.createElement('div')
  Object.assign(previewEl.style, {
    position: 'fixed',
    zIndex: '99999',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 0.15s ease',
    borderRadius: '6px',
    overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    background: '#1a1a1a',
  })

  imgEl = document.createElement('img')
  Object.assign(imgEl.style, {
    display: 'none',
    maxWidth: `${PREVIEW_MAX_SIZE}px`,
    maxHeight: `${PREVIEW_MAX_SIZE}px`,
    objectFit: 'contain',
  })
  imgEl.onload = reposition

  videoEl = document.createElement('video')
  Object.assign(videoEl.style, {
    display: 'none',
    maxWidth: `${PREVIEW_MAX_SIZE}px`,
    maxHeight: `${PREVIEW_MAX_SIZE}px`,
    objectFit: 'contain',
    background: '#000',
  })
  videoEl.muted = true
  videoEl.loop = true
  videoEl.playsInline = true
  videoEl.preload = 'auto'
  videoEl.onloadedmetadata = reposition

  previewEl.appendChild(imgEl)
  previewEl.appendChild(videoEl)
  document.body.appendChild(previewEl)
}

function ensureAudioEl() {
  if (audioEl) return
  audioEl = document.createElement('audio')
  audioEl.preload = 'auto'
  audioEl.style.display = 'none'
  document.body.appendChild(audioEl)
}

function reposition() {
  if (!targetEl || !previewEl || previewEl.style.opacity === '0') return
  positionAbove(targetEl.getBoundingClientRect())
}

function positionAbove(rect) {
  if (!previewEl) return
  const vw = window.innerWidth

  const previewW = previewEl.offsetWidth || 100
  const previewH = previewEl.offsetHeight || 100

  let left = rect.left + rect.width / 2 - previewW / 2
  if (left < GAP) left = GAP
  if (left + previewW + GAP > vw) left = vw - previewW - GAP

  let top = rect.top - previewH - GAP
  if (top < GAP) top = GAP

  previewEl.style.left = `${Math.round(left)}px`
  previewEl.style.top = `${Math.round(top)}px`
}

function getPreviewUrl(url) {
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  return getCanvasThumbnailUrl(url, PREVIEW_WIDTH)
}

function hideVisualPreview() {
  if (previewEl) {
    previewEl.style.opacity = '0'
  }
  if (videoEl) videoEl.pause()
  imgEl && (imgEl.style.display = 'none')
  videoEl && (videoEl.style.display = 'none')
}

function switchToImage(url) {
  imgEl.style.display = 'block'
  videoEl.style.display = 'none'
  videoEl.pause()
  videoEl.removeAttribute('src')
  imgEl.src = url
  currentType = 'image'
}

function switchToVideo(url) {
  imgEl.style.display = 'none'
  videoEl.style.display = 'block'
  videoEl.src = url
  videoEl.play().catch(() => {})
  currentType = 'video'
}

function startAliveCheck() {
  stopAliveCheck()
  aliveCheckId = setInterval(() => {
    const visualGone = targetEl && !document.body.contains(targetEl)
    const audioGone = audioTargetEl && !document.body.contains(audioTargetEl)
    if (visualGone || audioGone) {
      forceHide()
    }
  }, 200)
}

function stopAliveCheck() {
  if (aliveCheckId) {
    clearInterval(aliveCheckId)
    aliveCheckId = null
  }
}

function doShow(url, type) {
  ensurePreviewEl()

  if (currentUrl !== url || currentType !== type) {
    if (type === 'video') {
      switchToVideo(url)
    } else {
      switchToImage(getPreviewUrl(url))
    }
    currentUrl = url
  }

  if (targetEl) {
    positionAbove(targetEl.getBoundingClientRect())
  }
  previewEl.style.opacity = '1'
  startAliveCheck()

  requestAnimationFrame(() => {
    if (targetEl && previewEl && previewEl.style.opacity === '1') {
      positionAbove(targetEl.getBoundingClientRect())
    }
  })
}

let audioTargetEl = null
let audioOverlay = null

function ensureAudioStyles() {
  if (document.getElementById('audio-hover-styles')) return
  const style = document.createElement('style')
  style.id = 'audio-hover-styles'
  style.textContent = `
    .audio-hover-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      background: rgba(0,0,0,0.25);
      border-radius: inherit;
      pointer-events: none;
      z-index: 5;
    }
    .audio-hover-bar {
      width: 3px;
      background: rgba(168, 85, 247, 0.9);
      border-radius: 2px;
      animation: audioBarBounce 0.6s ease-in-out infinite alternate;
    }
    .audio-hover-bar:nth-child(1) { height: 8px; animation-delay: 0s; }
    .audio-hover-bar:nth-child(2) { height: 14px; animation-delay: 0.15s; }
    .audio-hover-bar:nth-child(3) { height: 10px; animation-delay: 0.3s; }
    .audio-hover-bar:nth-child(4) { height: 16px; animation-delay: 0.1s; }
    .audio-hover-bar:nth-child(5) { height: 6px; animation-delay: 0.25s; }
    @keyframes audioBarBounce {
      0% { transform: scaleY(0.4); }
      100% { transform: scaleY(1.6); }
    }
  `
  document.head.appendChild(style)
}

function showAudioOverlay(el) {
  removeAudioOverlay()
  ensureAudioStyles()
  const parent = el
  if (getComputedStyle(parent).position === 'static') {
    parent.style.position = 'relative'
  }
  audioOverlay = document.createElement('div')
  audioOverlay.className = 'audio-hover-overlay'
  for (let i = 0; i < 5; i++) {
    const bar = document.createElement('div')
    bar.className = 'audio-hover-bar'
    audioOverlay.appendChild(bar)
  }
  parent.appendChild(audioOverlay)
}

function removeAudioOverlay() {
  if (audioOverlay) {
    try {
      if (audioOverlay.parentNode) {
        audioOverlay.parentNode.removeChild(audioOverlay)
      }
    } catch (_) {}
  }
  audioOverlay = null
}

function doPlayAudio(url, event) {
  ensureAudioEl()
  if (audioEl.src !== url) {
    audioEl.src = url
  }
  audioEl.currentTime = 0
  audioEl.play().catch(() => {})
  audioTargetEl = event.currentTarget || event.target
  showAudioOverlay(audioTargetEl)
  startAliveCheck()
}

function doStopAudio() {
  if (audioEl) {
    audioEl.pause()
    audioEl.currentTime = 0
  }
  removeAudioOverlay()
  audioTargetEl = null
}

export function showImagePreview(url, event) {
  if (!url) return
  clearTimeout(hideTimer)
  clearTimeout(showTimer)
  targetEl = event.currentTarget || event.target
  showTimer = setTimeout(() => doShow(url, 'image'), SHOW_DELAY)
}

export function showVideoPreview(url, event) {
  if (!url) return
  clearTimeout(hideTimer)
  clearTimeout(showTimer)
  targetEl = event.currentTarget || event.target
  showTimer = setTimeout(() => doShow(url, 'video'), SHOW_DELAY)
}

function forceHide() {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  stopAliveCheck()
  targetEl = null
  doStopAudio()
  if (previewEl) {
    hideVisualPreview()
    currentUrl = null
    currentType = null
  }
}

export function hidePreview() {
  clearTimeout(showTimer)
  clearTimeout(hideTimer)
  stopAliveCheck()
  targetEl = null
  doStopAudio()
  hideTimer = setTimeout(() => {
    if (previewEl) {
      hideVisualPreview()
      currentUrl = null
      currentType = null
    }
  }, HIDE_DELAY)
}

export function useImageHoverPreview() {
  return {
    onHoverStart(url, event) { showImagePreview(url, event) },
    onVideoHoverStart(url, event) { showVideoPreview(url, event) },
    onAudioHoverStart(url, event) { doPlayAudio(url, event) },
    onHoverEnd() { hidePreview() },
  }
}
