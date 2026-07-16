const MIN_ZOOM = 0.1
const MAX_ZOOM = 5
const ZOOM_SPEED = 0.1
const PAN_SPEED = 50

function isCanvasTarget(target) {
  return Boolean(target?.closest?.('.canvas-board'))
}

function zoomCanvasAtPointer(event, { getViewport, setViewport }) {
  const viewport = getViewport?.()
  const canvas = typeof document !== 'undefined' ? document.querySelector('.canvas-board') : null
  if (!viewport || !canvas || !setViewport) return

  const newZoom = Math.min(
    Math.max(viewport.zoom * (event.deltaY > 0 ? 1 - ZOOM_SPEED : 1 + ZOOM_SPEED), MIN_ZOOM),
    MAX_ZOOM
  )
  if (newZoom === viewport.zoom) return

  const rect = canvas.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  const flowX = (mouseX - viewport.x) / viewport.zoom
  const flowY = (mouseY - viewport.y) / viewport.zoom
  setViewport({
    x: mouseX - flowX * newZoom,
    y: mouseY - flowY * newZoom,
    zoom: newZoom
  })
}

/**
 * Keep Ctrl/meta+wheel from triggering browser zoom while editing a node prompt.
 * Events inside the canvas continue bubbling so CanvasBoard applies its normal
 * interaction-mode behavior. Teleported expanded panels update the canvas here.
 */
export function handlePromptWheel(event, { getViewport, setViewport, interactionMode } = {}) {
  const isModifiedWheel = event.ctrlKey || event.metaKey
  if (isModifiedWheel) {
    event.preventDefault()
    if (isCanvasTarget(event.target)) return

    event.stopPropagation()
    if (interactionMode?.value === 'infinite-canvas') {
      zoomCanvasAtPointer(event, { getViewport, setViewport })
    } else if (setViewport && getViewport) {
      const viewport = getViewport()
      const delta = event.deltaY > 0 ? -PAN_SPEED : PAN_SPEED
      setViewport({ x: viewport.x, y: viewport.y + delta, zoom: viewport.zoom })
    }
    return
  }

  const editor = event.target?.closest?.('[contenteditable="true"], textarea, input, select')
  if (editor) {
    event.stopPropagation()
  }
}
