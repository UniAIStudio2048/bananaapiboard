const DOUBLE_PRESS_MS = 320

export function createCanvasPresentationShortcut({
  isClean,
  toggleEdges,
  showEdges,
  enterClean,
  exitClean,
  now = () => Date.now(),
  schedule = setTimeout,
  cancel = clearTimeout
}) {
  let lastPressAt = null
  let pendingTimer = null

  function clearPending() {
    if (pendingTimer !== null) cancel(pendingTimer)
    pendingTimer = null
    lastPressAt = null
  }

  return {
    press() {
      const pressedAt = now()
      if (lastPressAt !== null && pressedAt - lastPressAt <= DOUBLE_PRESS_MS) {
        clearPending()
        if (isClean()) exitClean()
        else {
          showEdges()
          enterClean()
        }
        return
      }

      clearPending()
      lastPressAt = pressedAt
      pendingTimer = schedule(() => {
        pendingTimer = null
        lastPressAt = null
        toggleEdges()
      }, DOUBLE_PRESS_MS)
    },
    escape() {
      clearPending()
      if (!isClean()) return false
      exitClean()
      return true
    },
    dispose: clearPending
  }
}
