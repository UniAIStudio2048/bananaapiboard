export function createCanvasOrganizationPreviewController({
  saveHistory,
  onChange = () => {}
} = {}) {
  let current = null

  function setCurrent(preview) {
    current = preview || null
    onChange(current)
  }

  function open(preview) {
    if (!preview) return false
    saveHistory?.({ force: true })
    setCurrent(preview)
    return true
  }

  function keep() {
    if (!current) return false
    setCurrent(null)
    return true
  }

  function keepAfterMutation() {
    if (!current) return false
    saveHistory?.({ force: true })
    setCurrent(null)
    return true
  }

  function beforeCanvasSwitch(action) {
    keep()
    return action()
  }

  return {
    open,
    keep,
    keepAfterMutation,
    beforeCanvasSwitch,
    clear: keep,
    get current() {
      return current
    }
  }
}
