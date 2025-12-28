/**
 * Canvas 画布模式弹窗工具
 * 用于替代原生 alert/confirm，提供黑白灰风格的弹窗
 * 包含 Toast 通知功能
 */
import { ref, h, render } from 'vue'
import CanvasDialog from '@/components/canvas/CanvasDialog.vue'
import CanvasToast from '@/components/canvas/CanvasToast.vue'

// 存储当前弹窗的容器
let dialogContainer = null

// Toast 容器
let toastContainer = null

/**
 * 显示弹窗
 * @param {Object} options - 弹窗配置
 * @param {String} options.type - 弹窗类型 'alert' | 'confirm'
 * @param {String} options.title - 标题
 * @param {String} options.message - 消息内容
 * @param {String} options.detail - 详细描述
 * @param {String} options.confirmText - 确认按钮文字
 * @param {String} options.cancelText - 取消按钮文字
 * @returns {Promise<boolean>} - confirm返回true/false，alert返回true
 */
function showDialog(options) {
  return new Promise((resolve) => {
    // 创建弹窗容器
    if (!dialogContainer) {
      dialogContainer = document.createElement('div')
      document.body.appendChild(dialogContainer)
    }

    // 弹窗状态
    const isVisible = ref(true)

    // 处理确认
    function handleConfirm() {
      isVisible.value = false
      setTimeout(() => {
        cleanup()
        resolve(true)
      }, 200)
    }

    // 处理取消
    function handleCancel() {
      isVisible.value = false
      setTimeout(() => {
        cleanup()
        resolve(false)
      }, 200)
    }

    // 清理
    function cleanup() {
      if (dialogContainer) {
        render(null, dialogContainer)
      }
    }

    // 渲染弹窗
    const vnode = h(CanvasDialog, {
      modelValue: isVisible.value,
      type: options.type || 'alert',
      title: options.title || '',
      message: options.message || '',
      detail: options.detail || '',
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      'onUpdate:modelValue': (value) => {
        isVisible.value = value
        if (!value) {
          setTimeout(() => {
            cleanup()
            resolve(false)
          }, 200)
        }
      },
      onConfirm: handleConfirm,
      onCancel: handleCancel
    })

    render(vnode, dialogContainer)
  })
}

/**
 * 显示提示弹窗 (替代 alert)
 * @param {String} message - 消息内容
 * @param {String} title - 标题（可选）
 * @param {String} detail - 详细描述（可选）
 * @returns {Promise<boolean>}
 */
export function showAlert(message, title = '', detail = '') {
  return showDialog({
    type: 'alert',
    title,
    message,
    detail,
    confirmText: '确定'
  })
}

/**
 * 显示确认弹窗 (替代 confirm)
 * @param {String} message - 消息内容
 * @param {String} title - 标题（可选）
 * @param {Object} options - 额外选项
 * @returns {Promise<boolean>}
 */
export function showConfirm(message, title = '', options = {}) {
  return showDialog({
    type: 'confirm',
    title,
    message,
    detail: options.detail || '',
    confirmText: options.confirmText || '确定',
    cancelText: options.cancelText || '取消'
  })
}

/**
 * 显示积分不足弹窗
 * @param {Number} required - 需要的积分
 * @param {Number} current - 当前积分
 * @param {Number} count - 生成次数
 * @returns {Promise<boolean>}
 */
export function showInsufficientPointsDialog(required, current, count = 1) {
  return showDialog({
    type: 'alert',
    title: '积分不足',
    message: `${count}次生成需要 ${required} 积分，您当前只有 ${current} 积分`,
    detail: '请前往购买套餐充值积分',
    confirmText: '确定'
  })
}

/**
 * 显示 Toast 通知
 * @param {String} message - 消息内容
 * @param {String} type - 类型 'success' | 'error' | 'info' | 'warning'
 * @param {Number} duration - 显示时长（毫秒），默认 2000
 */
export function showToast(message, type = 'success', duration = 2000) {
  // 创建 Toast 容器
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.id = 'canvas-toast-container'
    document.body.appendChild(toastContainer)
  }

  // 清理之前的 Toast
  render(null, toastContainer)

  // 处理关闭
  function handleClose() {
    render(null, toastContainer)
  }

  // 渲染 Toast
  const vnode = h(CanvasToast, {
    message,
    type,
    duration,
    onClose: handleClose
  })

  render(vnode, toastContainer)
}

/**
 * Composable 用法
 */
export function useCanvasDialog() {
  return {
    showAlert,
    showConfirm,
    showInsufficientPointsDialog,
    showToast
  }
}

export default useCanvasDialog
