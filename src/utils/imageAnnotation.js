/**
 * 图片标注工具函数
 * 用于在图片上添加标记点并生成标注后的图片
 */

/**
 * 在 Canvas 上绘制图钉标记
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {number} x - X 坐标
 * @param {number} y - Y 坐标
 * @param {string} label - 标签文字 (A, B, C...)
 * @param {boolean} isHovered - 是否处于悬停状态
 * @param {number} sizeScale - 额外的尺寸缩放系数（用于原图绘制）
 */
export function drawPinMarker(ctx, x, y, label, isHovered = false, sizeScale = 1) {
  const hoverScale = isHovered ? 1.2 : 1
  const totalScale = hoverScale * sizeScale
  const pinSize = 24 * totalScale
  const pinHeadRadius = 12 * totalScale
  const pinPointLength = 8 * totalScale

  ctx.save()
  
  // 阴影效果（阴影大小也要缩放）
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
  ctx.shadowBlur = 8 * sizeScale
  ctx.shadowOffsetX = 2 * sizeScale
  ctx.shadowOffsetY = 2 * sizeScale
  
  // 绘制图钉尖端（三角形）
  ctx.beginPath()
  ctx.moveTo(x, y) // 尖端
  ctx.lineTo(x - 4 * totalScale, y - pinPointLength)
  ctx.lineTo(x + 4 * totalScale, y - pinPointLength)
  ctx.closePath()
  ctx.fillStyle = '#1e40af' // 深蓝色
  ctx.fill()
  
  // 绘制图钉头部（圆形）
  ctx.beginPath()
  ctx.arc(x, y - pinPointLength - pinHeadRadius, pinHeadRadius, 0, Math.PI * 2)
  ctx.fillStyle = '#3b82f6' // 蓝色
  ctx.fill()
  
  // 绘制边框（边框宽度也要缩放）
  ctx.strokeStyle = '#1e3a8a'
  ctx.lineWidth = 2 * sizeScale
  ctx.stroke()
  
  ctx.shadowColor = 'transparent'
  
  // 绘制字母（字体大小也要缩放）
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${14 * totalScale}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x, y - pinPointLength - pinHeadRadius)
  
  ctx.restore()
}

/**
 * 检查点击位置是否在标记点附近
 * @param {number} clickX - 点击的 X 坐标
 * @param {number} clickY - 点击的 Y 坐标
 * @param {number} markerX - 标记的 X 坐标
 * @param {number} markerY - 标记的 Y 坐标
 * @param {number} threshold - 判定阈值（像素）
 * @returns {boolean}
 */
export function isNearMarker(clickX, clickY, markerX, markerY, threshold = 30) {
  const distance = Math.sqrt(
    Math.pow(clickX - markerX, 2) + Math.pow(clickY - markerY, 2)
  )
  return distance <= threshold
}

/**
 * 查找距离点击位置最近的标记
 * @param {number} clickX - 点击的 X 坐标
 * @param {number} clickY - 点击的 Y 坐标
 * @param {Array} markers - 标记数组
 * @param {number} threshold - 判定阈值（像素）
 * @returns {number} - 标记索引，-1 表示没有找到
 */
export function findNearestMarker(clickX, clickY, markers, threshold = 30) {
  let nearestIndex = -1
  let minDistance = threshold
  
  markers.forEach((marker, index) => {
    const distance = Math.sqrt(
      Math.pow(clickX - marker.x, 2) + Math.pow(clickY - marker.y, 2)
    )
    if (distance < minDistance) {
      minDistance = distance
      nearestIndex = index
    }
  })
  
  return nearestIndex
}

/**
 * 将标记点数组转换为字母标签
 * @param {number} index - 索引 (0-25)
 * @returns {string} - 字母 (A-Z)
 */
export function indexToLabel(index) {
  if (index < 0 || index > 25) return ''
  return String.fromCharCode(65 + index) // A=65
}

/**
 * 获取全局标记索引对应的字母
 * @param {number} globalIndex - 全局索引 (0-25)
 * @returns {string} - 字母 (A-Z)
 */
export function getGlobalLabel(globalIndex) {
  if (globalIndex < 0 || globalIndex > 25) return ''
  return String.fromCharCode(65 + globalIndex) // A=65
}

/**
 * 合成标注后的图片
 * @param {HTMLImageElement} image - 原始图片
 * @param {Array} markers - 标记点数组 [{x, y, label}]
 * @param {string} format - 输出格式 ('blob' | 'base64')
 * @param {number} quality - JPEG 质量 (0-1)，默认 0.85
 * @param {Object} canvasSize - Canvas 显示尺寸 {width, height}，用于坐标转换
 * @returns {Promise<Blob|string>}
 */
export async function generateAnnotatedImage(image, markers, format = 'blob', quality = 0.85, canvasSize = null) {
  return new Promise((resolve, reject) => {
    try {
      // 创建临时 Canvas，使用原始图片尺寸
      const canvas = document.createElement('canvas')
      const originalWidth = image.naturalWidth || image.width
      const originalHeight = image.naturalHeight || image.height
      
      canvas.width = originalWidth
      canvas.height = originalHeight
      const ctx = canvas.getContext('2d')
      
      // 绘制原始图片
      ctx.drawImage(image, 0, 0, originalWidth, originalHeight)
      
      // 计算缩放比例
      // marker.x/y 是基于 Canvas 内部坐标的
      // 需要转换到原始图片尺寸
      let displayWidth, displayHeight
      
      if (canvasSize) {
        // 如果提供了 Canvas 尺寸，使用它
        displayWidth = canvasSize.width
        displayHeight = canvasSize.height
      } else {
        // 否则假设 markers 已经是基于原始尺寸的
        displayWidth = originalWidth
        displayHeight = originalHeight
      }
      
      const scaleX = originalWidth / displayWidth
      const scaleY = originalHeight / displayHeight
      
      // 计算标记的尺寸缩放因子（取两个方向的平均值）
      const markerSizeScale = (scaleX + scaleY) / 2
      
      console.log('[generateAnnotatedImage] 图片尺寸:', {
        canvas: canvasSize ? `${canvasSize.width}x${canvasSize.height}` : 'N/A',
        original: `${originalWidth}x${originalHeight}`,
        scale: `${scaleX.toFixed(2)}x${scaleY.toFixed(2)}`,
        markerSizeScale: `${markerSizeScale.toFixed(2)}x`
      })
      
      // 绘制所有标记点
      markers.forEach(marker => {
        const scaledX = marker.x * scaleX
        const scaledY = marker.y * scaleY
        console.log('[generateAnnotatedImage] 标记', marker.label, '坐标:', {
          canvas: `(${marker.x.toFixed(0)}, ${marker.y.toFixed(0)})`,
          original: `(${scaledX.toFixed(0)}, ${scaledY.toFixed(0)})`,
          size: `${markerSizeScale.toFixed(2)}x`
        })
        // 传入尺寸缩放系数，让标记在原图上也能清晰可见
        drawPinMarker(ctx, scaledX, scaledY, marker.label, false, markerSizeScale)
      })
      
      // 输出格式 - 使用 JPEG 格式压缩
      if (format === 'blob') {
        canvas.toBlob((blob) => {
          if (blob) {
            console.log('[generateAnnotatedImage] 生成图片大小:', (blob.size / 1024 / 1024).toFixed(2), 'MB')
            resolve(blob)
          } else {
            reject(new Error('Failed to generate blob'))
          }
        }, 'image/jpeg', quality) // 使用 JPEG 格式和指定质量
      } else if (format === 'base64') {
        const base64 = canvas.toDataURL('image/jpeg', quality)
        resolve(base64)
      } else {
        reject(new Error('Unsupported format'))
      }
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * 获取鼠标/触摸在 Canvas 上的相对坐标
 * @param {MouseEvent|TouchEvent} event - 事件对象
 * @param {HTMLCanvasElement} canvas - Canvas 元素
 * @returns {{x: number, y: number}}
 */
export function getCanvasCoordinates(event, canvas) {
  const rect = canvas.getBoundingClientRect()
  let clientX, clientY
  
  // 处理触摸事件
  if (event.touches && event.touches.length > 0) {
    clientX = event.touches[0].clientX
    clientY = event.touches[0].clientY
  } else if (event.changedTouches && event.changedTouches.length > 0) {
    clientX = event.changedTouches[0].clientX
    clientY = event.changedTouches[0].clientY
  } else {
    clientX = event.clientX
    clientY = event.clientY
  }
  
  // 获取鼠标相对于 Canvas DOM 元素的位置（CSS 像素）
  const cssX = clientX - rect.left
  const cssY = clientY - rect.top
  
  // 获取 Canvas 的内部分辨率和显示尺寸
  const canvasWidth = canvas.width    // Canvas 内部宽度
  const canvasHeight = canvas.height  // Canvas 内部高度
  const displayWidth = rect.width     // CSS 显示宽度
  const displayHeight = rect.height   // CSS 显示高度
  
  // 计算缩放比例并转换坐标
  const scaleX = canvasWidth / displayWidth
  const scaleY = canvasHeight / displayHeight
  
  const canvasX = cssX * scaleX
  const canvasY = cssY * scaleY
  
  console.log('[getCanvasCoordinates]', {
    css: `(${cssX.toFixed(0)}, ${cssY.toFixed(0)})`,
    canvas: `(${canvasX.toFixed(0)}, ${canvasY.toFixed(0)})`,
    scale: `${scaleX.toFixed(2)}x${scaleY.toFixed(2)}`,
    canvasSize: `${canvasWidth}x${canvasHeight}`,
    displaySize: `${displayWidth.toFixed(0)}x${displayHeight.toFixed(0)}`
  })
  
  return {
    x: canvasX,
    y: canvasY
  }
}

/**
 * 将标记点转换为提示词格式
 * @param {string} label - 标签 (A, B, C...)
 * @returns {string}
 */
export function labelToPromptText(label) {
  return `${label}位置`
}

/**
 * 解析提示词中的标记引用
 * @param {string} prompt - 提示词文本
 * @returns {Array<string>} - 引用的标签列表 ['A', 'B']
 */
export function parsePromptReferences(prompt) {
  const regex = /([A-Z])位置/g
  const matches = []
  let match
  
  while ((match = regex.exec(prompt)) !== null) {
    matches.push(match[1])
  }
  
  return matches
}

