/**
 * 前端图片压缩工具
 * 在上传前自动压缩大图片，减少上传体积和时间
 */

const DEFAULT_OPTIONS = {
  maxLongSide: 1280,
  quality: 0.85,
  maxSizeMB: 10,
  mimeType: 'image/jpeg'
}

/**
 * 压缩单张图片
 * @param {File} file - 原始文件
 * @param {Object} options - 压缩选项
 * @returns {Promise<File>} 压缩后的文件
 */
export async function compressImage(file, options = {}) {
  if (!file.type.startsWith('image/')) return file
  if (file.type === 'image/gif') return file

  const opts = { ...DEFAULT_OPTIONS, ...options }
  const maxBytes = opts.maxSizeMB * 1024 * 1024
  if (file.size < maxBytes) return file

  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img
      const longSide = Math.max(width, height)
      if (longSide > opts.maxLongSide) {
        const ratio = opts.maxLongSide / longSide
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)

      const outputType = file.type === 'image/png' ? 'image/png' : opts.mimeType

      const tryCompress = (q) => new Promise((res) => {
        canvas.toBlob((blob) => res(blob), outputType, outputType === 'image/png' ? undefined : q)
      })

      ;(async () => {
        let quality = 0.92
        let blob = await tryCompress(quality)

        while (blob && blob.size > maxBytes && quality > 0.3) {
          quality -= 0.08
          blob = await tryCompress(quality)
        }

        if (blob && blob.size > maxBytes) {
          let scale = 0.8
          while (blob && blob.size > maxBytes && scale > 0.3) {
            canvas.width = Math.round(width * scale)
            canvas.height = Math.round(height * scale)
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
            blob = await tryCompress(0.8)
            scale -= 0.1
          }
        }

        if (!blob || blob.size >= file.size) {
          resolve(file)
          return
        }

        const compressed = new File([blob], file.name, {
          type: outputType,
          lastModified: file.lastModified
        })

        console.log(`[compress] ${file.name}: ${(file.size/1024/1024).toFixed(1)}MB → ${(compressed.size/1024/1024).toFixed(1)}MB (${Math.round((1 - compressed.size/file.size) * 100)}% 减少)`)
        resolve(compressed)
      })()
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
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
