import { uploadCanvasMedia } from '@/api/canvas/workflow'

export function isDirectorDataImageUrl(value) {
  return typeof value === 'string' && /^data:image\//i.test(value)
}

export async function dataUrlToDirectorFile(dataUrl, filename = `director-snapshot-${Date.now()}.png`) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], filename, { type: blob.type || 'image/png' })
}

export async function persistDirectorStudioImageSource(source) {
  if (!isDirectorDataImageUrl(source)) return source
  const file = await dataUrlToDirectorFile(source)
  const result = await uploadCanvasMedia(file, 'image')
  return result.url
}
