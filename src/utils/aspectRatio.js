const STANDARD_RATIOS = [
  { value: '16:9', ratio: 16 / 9 },
  { value: '1:1', ratio: 1 },
  { value: '9:16', ratio: 9 / 16 },
  { value: '4:3', ratio: 4 / 3 },
  { value: '3:4', ratio: 3 / 4 },
  { value: '2:3', ratio: 2 / 3 },
  { value: '3:2', ratio: 3 / 2 },
  { value: '4:5', ratio: 4 / 5 },
  { value: '5:4', ratio: 5 / 4 },
  { value: '21:9', ratio: 21 / 9 },
]

export function findClosestAspectRatio(width, height) {
  const actualRatio = width / height
  let closest = STANDARD_RATIOS[0]
  let minDiff = Math.abs(actualRatio - closest.ratio)

  for (const std of STANDARD_RATIOS) {
    const diff = Math.abs(actualRatio - std.ratio)
    if (diff < minDiff) {
      minDiff = diff
      closest = std
    }
  }

  return closest.value
}

function getImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    let objectUrl = null

    img.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image'))
    }

    if (src instanceof File || src instanceof Blob) {
      objectUrl = URL.createObjectURL(src)
      img.src = objectUrl
    } else {
      img.crossOrigin = 'anonymous'
      img.src = src
    }
  })
}

/**
 * 解析 auto 比例：图生图时检测第一张参考图的比例并匹配最接近的标准比例，文生图时返回 9:16
 * @param {File|Blob|string|null} firstImageSrc - 第一张参考图（File/Blob 对象或 URL），null 表示文生图模式
 * @returns {Promise<string>} 解析后的标准比例字符串
 */
export async function resolveAutoAspectRatio(firstImageSrc) {
  if (!firstImageSrc) return '9:16'

  try {
    const { width, height } = await getImageDimensions(firstImageSrc)
    const ratio = findClosestAspectRatio(width, height)
    console.log(`[auto-ratio] 检测图片尺寸: ${width}x${height}, 匹配最接近比例: ${ratio}`)
    return ratio
  } catch (e) {
    console.warn('[auto-ratio] 无法检测图片比例，使用默认 9:16:', e.message)
    return '9:16'
  }
}
