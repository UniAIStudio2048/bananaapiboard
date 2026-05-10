const DEFAULT_OFFSET = 8
const DEFAULT_FALLBACK_LEFT_OFFSET = 12

const DEFAULT_POPUP_HEIGHT = 260

function getViewportHeight(explicitHeight) {
  if (Number.isFinite(explicitHeight)) return explicitHeight
  if (typeof window !== 'undefined' && Number.isFinite(window.innerHeight)) return window.innerHeight
  return null
}

function getVerticalPosition({ top, bottom, offset, popupHeight = DEFAULT_POPUP_HEIGHT, viewportHeight }) {
  const belowTop = Math.round(bottom + offset)
  const actualViewportHeight = getViewportHeight(viewportHeight)

  if (actualViewportHeight && belowTop + popupHeight > actualViewportHeight) {
    return Math.max(offset, Math.round(top - popupHeight - offset))
  }

  return belowTop
}

export function getMentionPopupPosition({ caretRect, fallbackRect, offset = DEFAULT_OFFSET, popupHeight, viewportHeight } = {}) {
  if (caretRect && Number.isFinite(caretRect.left) && Number.isFinite(caretRect.bottom)) {
    return {
      top: getVerticalPosition({
        top: caretRect.top,
        bottom: caretRect.bottom,
        offset,
        popupHeight,
        viewportHeight
      }),
      left: Math.round(caretRect.left)
    }
  }

  const fallbackTop = fallbackRect?.top || 0
  const fallbackBottom = fallbackRect?.bottom || 0
  return {
    top: getVerticalPosition({
      top: fallbackTop,
      bottom: fallbackBottom,
      offset,
      popupHeight,
      viewportHeight
    }),
    left: Math.round((fallbackRect?.left || 0) + DEFAULT_FALLBACK_LEFT_OFFSET)
  }
}

export function getMentionPreviewUrl(item) {
  return item?.thumbnailUrl || item?.thumbnail_url || item?.posterUrl || item?.poster_url || item?.url || ''
}

export function getMentionPreviewImageSrc(item) {
  const explicitPreview = item?.thumbnailUrl || item?.thumbnail_url || item?.posterUrl || item?.poster_url || ''
  if (isBrowserRenderableUrl(explicitPreview)) return explicitPreview

  const url = item?.url || ''
  if (!isBrowserRenderableUrl(url)) return ''
  return getImageThumbnailUrl(url)
}

export function isBrowserRenderableUrl(url) {
  return typeof url === 'string' &&
    url.trim() !== '' &&
    !url.startsWith('asset://')
}

export function getImageThumbnailUrl(url) {
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('data:')) return url
  if (url.includes('?')) return url + '&imageView2/1/w/60/h/60'
  return url + '?imageView2/1/w/60/h/60'
}

export function getTextareaCaretViewportRect(textarea, caretIndex = textarea?.selectionStart || 0) {
  if (!textarea || typeof document === 'undefined') return null

  const textareaRect = textarea.getBoundingClientRect()
  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  const span = document.createElement('span')
  const properties = [
    'boxSizing',
    'width',
    'height',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textTransform',
    'textAlign',
    'textIndent',
    'textDecoration',
    'tabSize'
  ]

  properties.forEach((property) => {
    mirror.style[property] = style[property]
  })

  mirror.style.position = 'fixed'
  mirror.style.visibility = 'hidden'
  mirror.style.pointerEvents = 'none'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.overflowWrap = 'break-word'
  mirror.style.overflow = 'hidden'
  mirror.style.top = `${textareaRect.top}px`
  mirror.style.left = `${textareaRect.left}px`

  const before = textarea.value.slice(0, caretIndex)
  mirror.textContent = before || ''
  span.textContent = '\u200b'
  mirror.appendChild(span)
  mirror.appendChild(document.createTextNode(textarea.value.slice(caretIndex) || ' '))
  document.body.appendChild(mirror)

  mirror.scrollTop = textarea.scrollTop
  mirror.scrollLeft = textarea.scrollLeft
  const rect = span.getBoundingClientRect()
  document.body.removeChild(mirror)

  return rect
}
