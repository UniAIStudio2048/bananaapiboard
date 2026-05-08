async function resolveDefaultCanvasUrl(url) {
  const { getProxiedImageUrl } = await import('./canvasThumbnail.js')
  return getProxiedImageUrl(url)
}

function loadImageFromUrl(url, ImageCtor) {
  return new Promise((resolve, reject) => {
    const img = new ImageCtor()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

async function fetchImageAsBlobUrl(url, deps) {
  const response = await deps.fetch(url)
  if (!response.ok) {
    throw new Error(`图片下载失败: ${response.status} ${response.statusText || ''}`.trim())
  }

  const blob = await response.blob()
  const blobUrl = deps.createObjectURL(blob)
  try {
    return await loadImageFromUrl(blobUrl, deps.ImageCtor)
  } finally {
    deps.revokeObjectURL(blobUrl)
  }
}

export async function loadStoryboardImageForCanvas(url, options = {}) {
  const deps = {
    fetch: options.fetch || globalThis.fetch?.bind(globalThis),
    createObjectURL: options.createObjectURL || globalThis.URL?.createObjectURL?.bind(globalThis.URL),
    revokeObjectURL: options.revokeObjectURL || globalThis.URL?.revokeObjectURL?.bind(globalThis.URL),
    ImageCtor: options.ImageCtor || globalThis.Image,
    resolveCanvasUrl: options.resolveCanvasUrl || resolveDefaultCanvasUrl
  }

  if (!url) return null
  if (!deps.ImageCtor) throw new Error('当前浏览器不支持图片加载')

  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return loadImageFromUrl(url, deps.ImageCtor)
  }

  if (deps.fetch && deps.createObjectURL && deps.revokeObjectURL) {
    const canvasUrl = await deps.resolveCanvasUrl(url)
    try {
      return await fetchImageAsBlobUrl(canvasUrl || url, deps)
    } catch (error) {
      if (!canvasUrl || canvasUrl === url) throw error
    }
  }

  const img = new deps.ImageCtor()
  img.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = url
  })
  return img
}
