/**
 * 前端图片压缩工具
 * 在上传前自动压缩大图片，减少上传体积和时间
 */

const DEFAULT_OPTIONS = {
  maxWidth: 4096,        // 最大宽度
  maxHeight: 4096,       // 最大高度
  quality: 0.85,         // JPEG/WebP 压缩质量
  maxSizeMB: 5,          // 超过此大小才压缩（MB）
  mimeType: 'image/jpeg' // 输出格式
}

/**
 * 压缩单张图片
 * @param {File} file - 原始文件
 * @param {Object} options - 压缩选项
 * @returns {Promise<File>} 压缩后的文件
 */
export async function compressImage(file, options = {}) {
  // 非图片文件直接返回
  if (!file.type.startsWith('image/')) return file

  // GIF 不压缩（会丢失动画）
  if (file.type === 'image/gif') return file

  // 小于阈值不压缩
  const opts = { ...DEFAULT_OPTIONS, ...options }
  if (file.size < opts.maxSizeMB * 1024 * 1024) return file

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img

      // 计算缩放比例
      if (width > opts.maxWidth || height > opts.maxHeight) {
        const ratio = Math.min(opts.maxWidth / width, opts.maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      // 如果尺寸没变且文件不大，直接返回
      if (width === img.width && height === img.height && file.size < opts.maxSizeMB * 1024 * 1024 * 2) {
        resolve(file)
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      // 保持原格式或转为 JPEG
      const outputType = file.type === 'image/png' ? 'image/png' : opts.mimeType
      const quality = outputType === 'image/png' ? undefined : opts.quality

      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(file) // 压缩失败返回原文件
          return
        }

        // 如果压缩后反而更大，返回原文件
        if (blob.size >= file.size) {
          resolve(file)
          return
        }

        const compressed = new File([blob], file.name, {
          type: outputType,
          lastModified: file.lastModified
        })

        console.log(`[compress] ${file.name}: ${(file.size/1024/1024).toFixed(1)}MB → ${(compressed.size/1024/1024).toFixed(1)}MB (${Math.round((1 - compressed.size/file.size) * 100)}% 减少)`)
        resolve(compressed)
      }, outputType, quality)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file) // 加载失败返回原文件
    }

    img.src = url
  })
}

/**
 * 批量压缩图片
 * @param {File[]} files - 文件列表
 * @param {Object} options - 压缩选项
 * @returns {Promise<File[]>} 压缩后的文件列表
 */
export async function compressImages(files, options = {}) {
  return Promise.all(files.map(f => compressImage(f, options)))
}
