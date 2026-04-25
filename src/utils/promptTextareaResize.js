export function isTextareaResizeHandlePointer(event, textarea, threshold = 18) {
  if (!event || !textarea || typeof textarea.getBoundingClientRect !== 'function') {
    return false
  }

  const rect = textarea.getBoundingClientRect()
  return (
    event.clientX >= rect.right - threshold &&
    event.clientX <= rect.right + threshold &&
    event.clientY >= rect.bottom - threshold &&
    event.clientY <= rect.bottom + threshold
  )
}
