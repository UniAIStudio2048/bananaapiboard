export function getNativeImageEditorPointerCoords(event, canvasRect, canvasSize) {
  const rectWidth = Number(canvasRect?.width) || 1
  const rectHeight = Number(canvasRect?.height) || 1
  const canvasWidth = Number(canvasSize?.width) || rectWidth
  const canvasHeight = Number(canvasSize?.height) || rectHeight
  const displayWidth = Number(canvasSize?.displayWidth) || rectWidth
  const displayHeight = Number(canvasSize?.displayHeight) || rectHeight
  const pointerX = Number(event.clientX) - Number(canvasRect?.left || 0)
  const pointerY = Number(event.clientY) - Number(canvasRect?.top || 0)
  const x = pointerX * (canvasWidth / rectWidth)
  const y = pointerY * (canvasHeight / rectHeight)

  return {
    x,
    y,
    displayX: x * (displayWidth / canvasWidth),
    displayY: y * (displayHeight / canvasHeight)
  }
}
