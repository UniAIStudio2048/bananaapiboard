export function createCanvasOrganizationPreviewController({
  saveHistory,
  cancelHistory,
  onChange = () => {}
} = {}) {
  let current = null
  let continuousMutation = false
  let pendingMutation = false

  function setCurrent(preview) {
    current = preview || null
    onChange(current)
  }

  function open(preview) {
    if (!preview) return false
    continuousMutation = false
    pendingMutation = false
    saveHistory?.({ force: true })
    setCurrent(preview)
    return true
  }

  function keep() {
    if (!current) return false
    continuousMutation = false
    pendingMutation = false
    setCurrent(null)
    return true
  }

  function keepAfterMutation() {
    if (!current) return false
    if (continuousMutation) {
      pendingMutation = true
      setCurrent(null)
      return true
    }
    saveHistory?.({ force: true })
    setCurrent(null)
    return true
  }

  function beginContinuousMutation() {
    if (!current) return false
    continuousMutation = true
    return true
  }

  function finishContinuousMutation() {
    continuousMutation = false
    if (!pendingMutation) return false
    pendingMutation = false
    saveHistory?.({ force: true })
    return true
  }

  function cancel() {
    if (!current) return false
    const cancelled = cancelHistory?.()
    continuousMutation = false
    pendingMutation = false
    setCurrent(null)
    return cancelled !== false
  }

  function beforeCanvasSwitch(action) {
    keep()
    return action()
  }

  return {
    open,
    keep,
    keepAfterMutation,
    beginContinuousMutation,
    finishContinuousMutation,
    cancel,
    beforeCanvasSwitch,
    clear: keep,
    get current() {
      return current
    }
  }
}
