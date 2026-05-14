import { getCloudVideoPosterUrl, isVideoUrl } from './cloudMediaUrl.js'

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
  if (item?.type === 'video' || isVideoUrl(url)) return getCloudVideoPosterUrl(url, 96)
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

export function restoreTextareaSelectionAndScroll(textarea, start, end = start, scrollPosition = null) {
  if (!textarea) return

  const scrollTop = Number.isFinite(scrollPosition?.scrollTop) ? scrollPosition.scrollTop : textarea.scrollTop
  const scrollLeft = Number.isFinite(scrollPosition?.scrollLeft) ? scrollPosition.scrollLeft : textarea.scrollLeft

  textarea.focus()
  textarea.setSelectionRange(start, end)

  textarea.scrollTop = scrollTop
  textarea.scrollLeft = scrollLeft
}

function isElementNode(node) {
  return node?.nodeType === 1
}

function getPromptMentionText(node) {
  return isElementNode(node) ? node.getAttribute('data-prompt-mention') || '' : ''
}

export function removePromptEditorOrphanTextNodes(root) {
  if (!root?.childNodes) return
  Array.from(root.childNodes)
    .filter(node => node.nodeType === 3)
    .forEach(node => node.remove())
}

export function serializePromptEditorContent(root) {
  if (!root) return ''

  let text = ''
  const walk = (node) => {
    if (!node) return

    if (node.nodeType === 3) {
      text += node.nodeValue || ''
      return
    }

    if (!isElementNode(node) && node.nodeType !== 11) return

    if (isElementNode(node)) {
      const mention = getPromptMentionText(node)
      if (mention) {
        text += mention
        return
      }
      if (node.tagName === 'BR') {
        text += '\n'
        return
      }
    }

    node.childNodes?.forEach?.(walk)
  }

  walk(root)
  return text
}

export function getPromptEditorSelectionRange(root) {
  if (!root || typeof window === 'undefined') return { start: 0, end: 0 }

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return { start: 0, end: 0 }

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    const end = serializePromptEditorContent(root).length
    return { start: end, end }
  }

  const measure = (container, offset) => {
    const preRange = document.createRange()
    preRange.selectNodeContents(root)
    preRange.setEnd(container, offset)
    return serializePromptEditorContent(preRange.cloneContents()).length
  }

  const start = measure(range.startContainer, range.startOffset)
  const end = measure(range.endContainer, range.endOffset)
  return start <= end ? { start, end } : { start: end, end: start }
}

function getPromptEditorDomPosition(root, index) {
  const targetIndex = Math.max(0, Number.isFinite(index) ? index : 0)
  let position = 0
  let fallback = { node: root, offset: root.childNodes?.length || 0 }

  const visit = (node) => {
    if (!node) return null

    if (node.nodeType === 3) {
      const length = (node.nodeValue || '').length
      if (targetIndex <= position + length) {
        return { node, offset: Math.max(0, targetIndex - position) }
      }
      position += length
      fallback = { node, offset: length }
      return null
    }

    if (!isElementNode(node) && node.nodeType !== 11) return null

    if (isElementNode(node)) {
      const mention = getPromptMentionText(node)
      if (mention) {
        const parent = node.parentNode || root
        const childIndex = Array.prototype.indexOf.call(parent.childNodes || [], node)
        if (targetIndex <= position) return { node: parent, offset: childIndex }
        if (targetIndex <= position + mention.length) return { node: parent, offset: childIndex + 1 }
        position += mention.length
        fallback = { node: parent, offset: childIndex + 1 }
        return null
      }
      if (node.tagName === 'BR') {
        const parent = node.parentNode || root
        const childIndex = Array.prototype.indexOf.call(parent.childNodes || [], node)
        if (targetIndex <= position) return { node: parent, offset: childIndex }
        position += 1
        fallback = { node: parent, offset: childIndex + 1 }
        return null
      }
    }

    for (const child of Array.from(node.childNodes || [])) {
      const found = visit(child)
      if (found) return found
    }
    fallback = { node, offset: node.childNodes?.length || 0 }
    return null
  }

  return visit(root) || fallback
}

export function restorePromptEditorSelection(root, start, end = start) {
  if (!root || typeof window === 'undefined' || typeof document === 'undefined') return

  const selection = window.getSelection()
  if (!selection) return

  const range = document.createRange()
  const startPos = getPromptEditorDomPosition(root, start)
  const endPos = getPromptEditorDomPosition(root, end)
  range.setStart(startPos.node, startPos.offset)
  range.setEnd(endPos.node, endPos.offset)
  selection.removeAllRanges()
  selection.addRange(range)
  root.focus?.()
}

function getPromptMentionReplaceEnd(text, mentionStart, caret) {
  const safeStart = Math.max(0, Number.isFinite(mentionStart) ? mentionStart : 0)
  const minimumEnd = Math.min(String(text || '').length, safeStart + 1)
  const safeCaret = Number.isFinite(caret) ? Math.max(caret, minimumEnd) : minimumEnd
  if (safeCaret >= minimumEnd) return Math.min(String(text || '').length, safeCaret)

  const rest = String(text || '').slice(minimumEnd)
  const match = rest.match(/^[^\s@]*/)
  return minimumEnd + (match?.[0]?.length || 0)
}

export function getActivePromptMentionRange(text = '', caret = 0, {
  maxQueryLength = 3,
  completedPattern = /^(?:视频|图片|音频|文件)\d/
} = {}) {
  const value = String(text || '')
  const cursor = Math.max(0, Math.min(value.length, Number.isFinite(caret) ? caret : 0))
  const before = value.slice(0, cursor)
  const atIndex = before.lastIndexOf('@')
  if (atIndex === -1) return null

  const query = before.slice(atIndex + 1)
  if (/\s/.test(query)) return null
  if (query.length > maxQueryLength) return null
  if (completedPattern?.test?.(query)) return null

  return {
    start: atIndex,
    end: cursor,
    query
  }
}

export function replacePromptEditorMentionText({
  text = '',
  mentionStart = 0,
  caret,
  replacement = '',
  appendSpace = false
} = {}) {
  const value = String(text || '')
  const rawStart = Math.max(0, Math.min(value.length, Number.isFinite(mentionStart) ? mentionStart : 0))
  const start = value[rawStart] !== '@' && value[rawStart - 1] === '@' ? rawStart - 1 : rawStart
  const end = getPromptMentionReplaceEnd(value, start, caret)
  const prefix = appendSpace && start > 0 && value[start - 1] !== ' ' && value[start - 1] !== '\n' ? ' ' : ''
  const suffix = appendSpace && value[end] !== ' ' && value[end] !== '\n' ? ' ' : ''
  const nextText = value.slice(0, start) + prefix + replacement + suffix + value.slice(end)
  return {
    text: nextText,
    cursor: start + prefix.length + replacement.length + suffix.length
  }
}

export function setPromptEditorSelectionByPoint(root, clientX, clientY) {
  if (!root || typeof document === 'undefined') return null

  let range = null
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(clientX, clientY)
  } else if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(clientX, clientY)
    if (position) {
      range = document.createRange()
      range.setStart(position.offsetNode, position.offset)
      range.collapse(true)
    }
  }

  if (!range || !root.contains(range.startContainer)) {
    const text = serializePromptEditorContent(root)
    const rect = root.getBoundingClientRect?.()
    const index = rect && Number.isFinite(clientX) && clientX < rect.left + rect.width / 2 ? 0 : text.length
    restorePromptEditorSelection(root, index, index)
    return index
  }

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)

  const current = getPromptEditorSelectionRange(root)
  restorePromptEditorSelection(root, current.start, current.start)
  return current.start
}

export function getPromptMediaTagCaretIndex({ segments, segmentIndex, clickX, tagRects } = {}) {
  const seg = Array.isArray(segments) ? segments[segmentIndex] : null
  if (!seg || !Number.isFinite(seg.start) || !Number.isFinite(seg.end)) return 0

  const rects = Array.isArray(tagRects) ? tagRects : []
  const currentRect = rects[segmentIndex]
  const hasCurrentRect = currentRect &&
    Number.isFinite(currentRect.left) &&
    Number.isFinite(currentRect.right)

  const fallbackIndex = () => {
    if (!hasCurrentRect || !Number.isFinite(clickX)) return seg.start
    return clickX - currentRect.left < (currentRect.right - currentRect.left) / 2
      ? seg.start
      : seg.end
  }

  if (!hasCurrentRect || !Number.isFinite(clickX)) return fallbackIndex()

  const previousRect = rects[segmentIndex - 1]
  if (
    previousRect &&
    Number.isFinite(previousRect.right) &&
    clickX >= previousRect.right &&
    clickX <= currentRect.left
  ) {
    return seg.start
  }

  const nextRect = rects[segmentIndex + 1]
  if (
    nextRect &&
    Number.isFinite(nextRect.left) &&
    clickX >= currentRect.right &&
    clickX <= nextRect.left
  ) {
    return seg.end
  }

  return fallbackIndex()
}

export function getPromptMediaTagBoundaryCaretRect({ segments, caretIndex, tagRects, height } = {}) {
  if (!Array.isArray(segments) || !Number.isFinite(caretIndex)) return null

  const rects = Array.isArray(tagRects) ? tagRects : []
  const caretHeight = Number.isFinite(height) && height > 0 ? height : 18
  const tagRectIndexes = []
  let tagRectIndex = 0
  for (let i = 0; i < segments.length; i += 1) {
    if (segments[i]?.isTag) {
      tagRectIndexes[i] = tagRectIndex
      tagRectIndex += 1
    } else {
      tagRectIndexes[i] = -1
    }
  }

  for (let i = 0; i < segments.length - 1; i += 1) {
    const previous = segments[i]
    const next = segments[i + 1]
    if (!previous?.isTag || !next?.isTag) continue
    if (previous.end !== caretIndex || next.start !== caretIndex) continue

    const previousRect = rects[tagRectIndexes[i]]
    const nextRect = rects[tagRectIndexes[i + 1]]
    if (
      !previousRect ||
      !nextRect ||
      !Number.isFinite(previousRect.right) ||
      !Number.isFinite(previousRect.top) ||
      !Number.isFinite(nextRect.left) ||
      !Number.isFinite(nextRect.top)
    ) {
      return null
    }

    const previousBottom = Number.isFinite(previousRect.bottom)
      ? previousRect.bottom
      : previousRect.top + (Number.isFinite(previousRect.height) ? previousRect.height : caretHeight)
    const nextBottom = Number.isFinite(nextRect.bottom)
      ? nextRect.bottom
      : nextRect.top + (Number.isFinite(nextRect.height) ? nextRect.height : caretHeight)
    if (Math.min(previousBottom, nextBottom) < Math.max(previousRect.top, nextRect.top)) return null

    const previousHeight = Number.isFinite(previousRect.height)
      ? previousRect.height
      : previousBottom - previousRect.top
    const boundaryGap = nextRect.left - previousRect.right

    return {
      left: previousRect.right + boundaryGap / 2,
      top: previousRect.top + Math.max(0, (previousHeight - caretHeight) / 2),
      height: caretHeight
    }
  }

  return null
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function getPromptOverlayClickCaretRect({ clickX, clickY, overlayRect, lineRect, height } = {}) {
  if (!Number.isFinite(clickX)) return null

  const caretHeight = Number.isFinite(height) && height > 0 ? height : 18
  const hasOverlayBounds = overlayRect &&
    Number.isFinite(overlayRect.left) &&
    Number.isFinite(overlayRect.right)
  const hasLineBounds = lineRect &&
    Number.isFinite(lineRect.left) &&
    Number.isFinite(lineRect.right) &&
    lineRect.right >= lineRect.left

  if (!hasOverlayBounds && !hasLineBounds) return null

  const minLeft = hasOverlayBounds && hasLineBounds
    ? Math.max(overlayRect.left, lineRect.left)
    : hasLineBounds
      ? lineRect.left
      : overlayRect.left
  const maxLeft = hasOverlayBounds && hasLineBounds
    ? Math.min(overlayRect.right, lineRect.right)
    : hasLineBounds
      ? lineRect.right
      : overlayRect.right
  const left = minLeft <= maxLeft
    ? clampNumber(clickX, minLeft, maxLeft)
    : clampNumber(clickX, maxLeft, minLeft)

  const lineTop = Number.isFinite(lineRect?.top) ? lineRect.top : null
  const lineBottom = Number.isFinite(lineRect?.bottom)
    ? lineRect.bottom
    : lineTop != null && Number.isFinite(lineRect?.height)
      ? lineTop + lineRect.height
      : null
  const lineHeight = Number.isFinite(lineRect?.height)
    ? lineRect.height
    : lineTop != null && lineBottom != null
      ? lineBottom - lineTop
      : null
  const top = lineTop != null
    ? lineTop + Math.max(0, ((Number.isFinite(lineHeight) ? lineHeight : caretHeight) - caretHeight) / 2)
    : Number.isFinite(clickY)
      ? clickY - (caretHeight / 2)
      : Number.isFinite(overlayRect?.top)
        ? overlayRect.top
        : 0

  return {
    left,
    top,
    height: caretHeight
  }
}

/**
 * 测量一段文本在 textarea 当前字体下的近似渲染宽度（用于 @引用 芯片与底层透明文本对齐）
 */
export function measureTextareaTextWidth(textarea, text) {
  if (!textarea || typeof document === 'undefined' || text == null) return 0

  const style = window.getComputedStyle(textarea)
  const span = document.createElement('span')
  span.style.visibility = 'hidden'
  span.style.position = 'absolute'
  span.style.whiteSpace = 'pre'
  span.style.fontSize = style.fontSize
  span.style.fontFamily = style.fontFamily
  span.style.fontWeight = style.fontWeight
  span.style.fontStyle = style.fontStyle
  span.style.letterSpacing = style.letterSpacing
  span.style.lineHeight = style.lineHeight
  span.textContent = String(text)

  document.body.appendChild(span)
  const width = span.getBoundingClientRect().width
  document.body.removeChild(span)
  return width
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

/**
 * 用与光标相同的镜像布局测量 textarea 内 [start,end) 文本在同一行上的宽度，
 * 比孤立 span 测字宽更接近真实排版（避免叠加层 slot 与透明文本错位）。
 */
export function measureTextareaSubstringWidthByCaret(textarea, start, end) {
  if (!textarea || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0

  const slice = textarea.value.slice(start, end)
  if (!slice) return 0

  const rStart = getTextareaCaretViewportRect(textarea, start)
  const rEnd = getTextareaCaretViewportRect(textarea, end)
  if (!rStart || !rEnd) return measureTextareaTextWidth(textarea, slice)

  const dy = Math.abs(rEnd.top - rStart.top)
  if (dy > 6) return measureTextareaTextWidth(textarea, slice)

  return Math.max(0, rEnd.left - rStart.left)
}
