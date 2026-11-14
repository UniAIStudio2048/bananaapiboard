<script setup>
import { t as translateUi } from '@/i18n'

/**
 * ImageEditor.vue - 图片编辑器组件
 * 基于 TUI Image Editor 实现
 * 
 * 功能：
 * - 重绘（画笔蒙版）
 * - 擦除（橡皮擦）
 * - 裁剪
 * - 涂鸦
 * - 滤镜
 */
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import ImageEditor from 'tui-image-editor'
import 'tui-image-editor/dist/tui-image-editor.css'
import 'tui-color-picker/dist/tui-color-picker.css'

const props = defineProps({
  // 图片URL
  imageUrl: {
    type: String,
    required: true
  },
  // 初始激活的工具
  initialTool: {
    type: String,
    default: '' // crop, draw, shape, icon, text, mask, filter
  },
  // 是否显示
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'save', 'save-mask'])

// 编辑器实例
const editorInstance = ref(null)
const editorContainer = ref(null)
const isLoading = ref(true)
const currentTool = ref(props.initialTool)

// 中文本地化
const localeZh = {
  get Crop() { return translateUi('uiMessages.m184506303bf5') },
  get Delete() { return translateUi('canvas.delete') },
  get DeleteAll() { return translateUi('uiMessages.m9b2ccbb48e31') },
  get Undo() { return translateUi('canvas.undoShortcut') },
  get Redo() { return translateUi('canvas.redo') },
  get Reset() { return translateUi('common.reset') },
  get Flip() { return translateUi('uiMessages.m3733e06a5224') },
  get Rotate() { return translateUi('directorStudio.inspector.rotation') },
  get Draw() { return translateUi('uiMessages.mc444a8125ada') },
  get Shape() { return translateUi('uiMessages.mc2f71c1b10ef') },
  get Icon() { return translateUi('uiMessages.m0d720eeea264') },
  get Text() { return translateUi('uiMessages.m14b69bd6eeb0') },
  get Mask() { return translateUi('uiMessages.me7c802f4a183') },
  get Filter() { return translateUi('uiMessages.m32319e81a408') },
  get Bold() { return translateUi('canvas.textNode.bold') },
  get Italic() { return translateUi('canvas.textNode.italic') },
  get Underline() { return translateUi('canvas.textNode.underline') },
  get Left() { return translateUi('uiMessages.m2bd74486069f') },
  get Center() { return translateUi('uiMessages.m4cc3885c182e') },
  get Right() { return translateUi('uiMessages.m331c711e0660') },
  get Color() { return translateUi('directorStudio.inspector.color') },
  'Text size': translateUi('uiMessages.mf71561b5af0a'),
  get Custom() { return translateUi('uiMessages.m4eafa9e925b3') },
  get Square() { return translateUi('imageGen.square') },
  get Apply() { return translateUi('user.applyCoupon') },
  get Cancel() { return translateUi('canvas.cancel') },
  'Flip X': translateUi('uiMessages.m44775fbf3342'),
  'Flip Y': translateUi('uiMessages.mfcd75ef0a054'),
  get Range() { return translateUi('uiMessages.mae72b532f4b8') },
  get Stroke() { return translateUi('uiMessages.madcb8080365d') },
  get Fill() { return translateUi('uiMessages.m05fb7cba476b') },
  get Circle() { return translateUi('uiMessages.m81639a8a9bce') },
  get Triangle() { return translateUi('uiMessages.m3ecb21308383') },
  get Rectangle() { return translateUi('uiMessages.m88b75a101595') },
  get Free() { return translateUi('uiMessages.md1047eed5dd5') },
  get Straight() { return translateUi('onboarding.settings.edgeStyleStraight') },
  get Arrow() { return translateUi('uiMessages.m83fa01a2d780') },
  'Arrow-2': translateUi('uiMessages.m1beae3614daa'),
  'Arrow-3': translateUi('uiMessages.m9f62df73e4de'),
  'Star-1': translateUi('uiMessages.m6065234896ad'),
  'Star-2': translateUi('uiMessages.m5fd4102caaee'),
  get Polygon() { return translateUi('uiMessages.m388216f2d6f6') },
  get Location() { return translateUi('directorStudio.inspector.position') },
  get Heart() { return translateUi('uiMessages.mc2e1f17f72c1') },
  get Bubble() { return translateUi('uiMessages.mb4b35dae92ac') },
  'Custom icon': translateUi('uiMessages.m70ffa5d85100'),
  get Load() { return translateUi('uiMessages.m8f8f90778463') },
  get Download() { return translateUi('canvas.assetPanel.directory.download') },
  'Load Mask Image': translateUi('uiMessages.m58b76aacf243'),
  get Grayscale() { return translateUi('uiMessages.m71b7f9dc68ea') },
  get Blur() { return translateUi('uiMessages.m36bab7a3de7f') },
  get Sharpen() { return translateUi('uiMessages.mfc538f246da7') },
  get Emboss() { return translateUi('uiMessages.mcef5b18134bf') },
  'Remove White': translateUi('uiMessages.ma0db6da5a754'),
  get Distance() { return translateUi('uiMessages.m3865483de52d') },
  get Brightness() { return translateUi('uiMessages.m8e2f643ad160') },
  get Noise() { return translateUi('uiMessages.m68efe2f78fe8') },
  'Color Filter': translateUi('uiMessages.mc59815b5d020'),
  get Threshold() { return translateUi('uiMessages.md35480d7d7af') },
  get Invert() { return translateUi('uiMessages.mc9fe2bcf441c') },
  get Sepia() { return translateUi('uiMessages.m4425d6003a10') },
  get Sepia2() { return translateUi('uiMessages.m14a97bc2dd62') },
  'Blend Color': translateUi('uiMessages.mbcc860f7653f'),
  get Multiply() { return translateUi('uiMessages.mf3c8694d8297') },
  get Tint() { return translateUi('uiMessages.m5bddf6a1c0f5') },
  'Gradient transparency': translateUi('uiMessages.mb02d0dd03524')
}

// 自定义深色主题
const darkTheme = {
  'common.bi.image': '',
  'common.bisize.width': '0',
  'common.bisize.height': '0',
  'common.backgroundImage': 'none',
  'common.backgroundColor': '#1e1e1e',
  'common.border': '0px',

  // 头部
  'header.backgroundImage': 'none',
  'header.backgroundColor': '#1e1e1e',
  'header.border': '0px',

  // 加载按钮
  'loadButton.backgroundColor': '#fff',
  'loadButton.border': '1px solid #ddd',
  'loadButton.color': '#222',
  'loadButton.fontFamily': 'NotoSans, sans-serif',
  'loadButton.fontSize': '12px',

  // 下载按钮
  'downloadButton.backgroundColor': '#fdba74',
  'downloadButton.border': '1px solid #fdba74',
  'downloadButton.color': '#000',
  'downloadButton.fontFamily': 'NotoSans, sans-serif',
  'downloadButton.fontSize': '12px',

  // 菜单
  'menu.normalIcon.color': '#8a8a8a',
  'menu.activeIcon.color': '#fdba74',
  'menu.disabledIcon.color': '#434343',
  'menu.hoverIcon.color': '#e9e9e9',
  'menu.iconSize.width': '24px',
  'menu.iconSize.height': '24px',

  // 子菜单
  'submenu.backgroundColor': '#1e1e1e',
  'submenu.partition.color': '#3c3c3c',
  'submenu.normalIcon.color': '#8a8a8a',
  'submenu.activeIcon.color': '#fdba74',
  'submenu.normalLabel.color': '#8a8a8a',
  'submenu.activeLabel.color': '#fdba74',

  // 复选框
  'checkbox.border': '1px solid #ccc',
  'checkbox.backgroundColor': '#fff',

  // 范围滑块
  'range.pointer.color': '#fdba74',
  'range.bar.color': '#666',
  'range.subbar.color': '#fdba74',
  'range.disabledPointer.color': '#414141',
  'range.disabledBar.color': '#282828',
  'range.disabledSubbar.color': '#414141',
  'range.value.color': '#fff',
  'range.value.fontWeight': 'lighter',
  'range.value.fontSize': '11px',
  'range.value.border': '1px solid #353535',
  'range.value.backgroundColor': '#151515',
  'range.title.color': '#fff',
  'range.title.fontWeight': 'lighter',

  // 颜色选择器
  'colorpicker.button.border': '1px solid #1e1e1e',
  'colorpicker.title.color': '#fff'
}

// 初始化编辑器
async function initEditor() {
  if (!editorContainer.value || !props.imageUrl) return
  
  isLoading.value = true
  
  // 销毁旧实例
  if (editorInstance.value) {
    editorInstance.value.destroy()
    editorInstance.value = null
  }
  
  await nextTick()
  
  try {
    editorInstance.value = new ImageEditor(editorContainer.value, {
      includeUI: {
        loadImage: {
          path: props.imageUrl,
          name: 'EditImage'
        },
        locale: localeZh,
        theme: darkTheme,
        menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'mask', 'filter'],
        initMenu: props.initialTool || '',
        uiSize: {
          width: '100%',
          height: '100%'
        },
        menuBarPosition: 'top'
      },
      cssMaxWidth: 1200,
      cssMaxHeight: 800,
      usageStatistics: false,
      selectionStyle: {
        cornerSize: 20,
        rotatingPointOffset: 70
      }
    })
    
    // 监听图片加载完成
    editorInstance.value.on('objectActivated', () => {
      console.log('[ImageEditor] 对象已激活')
    })
    
    // 设置初始工具
    if (props.initialTool) {
      setTimeout(() => {
        switchTool(props.initialTool)
      }, 500)
    }
    
    isLoading.value = false
  } catch (error) {
    console.error('[ImageEditor] 初始化失败:', error)
    isLoading.value = false
  }
}

// 切换工具
function switchTool(tool) {
  if (!editorInstance.value) return
  
  currentTool.value = tool
  
  try {
    // 使用 UI API 切换菜单
    const ui = editorInstance.value.ui
    if (ui && ui.changeMenu) {
      ui.changeMenu(tool)
    }
  } catch (error) {
    console.error('[ImageEditor] 切换工具失败:', error)
  }
}

// 获取编辑后的图片
function getEditedImage(format = 'png', quality = 0.92) {
  if (!editorInstance.value) return null
  
  try {
    const dataUrl = editorInstance.value.toDataURL({
      format: format,
      quality: quality
    })
    return dataUrl
  } catch (error) {
    console.error('[ImageEditor] 获取图片失败:', error)
    return null
  }
}

// 获取蒙版图片（用于 inpainting）
function getMaskImage() {
  if (!editorInstance.value) return null
  
  try {
    // 获取当前画布状态
    const canvas = editorInstance.value._graphics.getCanvas()
    
    // 创建蒙版画布
    const maskCanvas = document.createElement('canvas')
    maskCanvas.width = canvas.width
    maskCanvas.height = canvas.height
    const ctx = maskCanvas.getContext('2d')
    
    // 填充黑色背景
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
    
    // 获取所有绘制对象并渲染为白色
    const objects = canvas.getObjects()
    objects.forEach(obj => {
      if (obj.type === 'path' || obj.type === 'circle' || obj.type === 'rect') {
        // 克隆对象并设置为白色
        obj.clone((cloned) => {
          cloned.set({
            fill: '#ffffff',
            stroke: '#ffffff'
          })
          ctx.save()
          ctx.translate(cloned.left, cloned.top)
          ctx.rotate(cloned.angle * Math.PI / 180)
          cloned.render(ctx)
          ctx.restore()
        })
      }
    })
    
    return maskCanvas.toDataURL('image/png')
  } catch (error) {
    console.error('[ImageEditor] 获取蒙版失败:', error)
    return null
  }
}

// 保存图片
function handleSave() {
  const imageData = getEditedImage()
  if (imageData) {
    emit('save', {
      dataUrl: imageData,
      format: 'png'
    })
  }
}

// 保存蒙版（用于重绘/擦除）
function handleSaveMask() {
  const imageData = getEditedImage()
  const maskData = getMaskImage()
  
  emit('save-mask', {
    image: imageData,
    mask: maskData
  })
}

// 关闭编辑器
function handleClose() {
  emit('close')
}

// 撤销
function handleUndo() {
  if (editorInstance.value) {
    editorInstance.value.undo()
  }
}

// 重做
function handleRedo() {
  if (editorInstance.value) {
    editorInstance.value.redo()
  }
}

// 重置
function handleReset() {
  if (editorInstance.value) {
    editorInstance.value.clearObjects()
  }
}

// 监听可见性变化
watch(() => props.visible, (newVal) => {
  if (newVal) {
    nextTick(() => {
      initEditor()
    })
  }
})

// 监听图片URL变化
watch(() => props.imageUrl, () => {
  if (props.visible) {
    initEditor()
  }
})

// 监听初始工具变化
watch(() => props.initialTool, (newTool) => {
  if (newTool && editorInstance.value) {
    switchTool(newTool)
  }
})

onMounted(() => {
  if (props.visible) {
    initEditor()
  }
})

onUnmounted(() => {
  if (editorInstance.value) {
    editorInstance.value.destroy()
    editorInstance.value = null
  }
})

// 暴露方法
defineExpose({
  getEditedImage,
  getMaskImage,
  switchTool,
  undo: handleUndo,
  redo: handleRedo,
  reset: handleReset
})
</script>

<template>
  <Teleport to="body">
    <Transition name="editor-fade">
      <div v-if="visible" class="image-editor-overlay">
        <div class="image-editor-container">
          <!-- 顶部操作栏 -->
          <div class="editor-header">
            <div class="header-left">
              <button class="header-btn" @click="handleClose" :title="translateUi('common.close')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
                <span>{{ translateUi('common.close') }}</span>
              </button>
            </div>
            
            <div class="header-center">
              <span class="editor-title">{{ translateUi('uiMessages.md721fd5257b8') }}</span>
            </div>
            
            <div class="header-right">
              <button class="header-btn" @click="handleUndo" :title="translateUi('canvas.undo')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l4-4M3 10l4 4"/>
                </svg>
              </button>
              <button class="header-btn" @click="handleRedo" :title="translateUi('canvas.redo')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10H11a5 5 0 0 0-5 5v2M21 10l-4-4M21 10l-4 4"/>
                </svg>
              </button>
              <button class="header-btn" @click="handleReset" :title="translateUi('common.reset')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M4 4v5h5M20 20v-5h-5"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L4 7m16 10l-1.64 1.36A9 9 0 0 1 3.51 15"/>
                </svg>
              </button>
              <div class="header-divider"></div>
              <button class="header-btn primary" @click="handleSave" :title="translateUi('common.save')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17,21 17,13 7,13 7,21"/>
                  <polyline points="7,3 7,8 15,8"/>
                </svg>
                <span>{{ translateUi('common.save') }}</span>
              </button>
            </div>
          </div>
          
          <!-- 编辑器主体 -->
          <div class="editor-body">
            <!-- 加载状态 -->
            <div v-if="isLoading" class="editor-loading">
              <div class="loading-spinner"></div>
              <span>{{ translateUi('uiMessages.m0c3f2eedbe31') }}</span>
            </div>
            
            <!-- TUI 编辑器容器 -->
            <div ref="editorContainer" class="tui-editor-wrapper"></div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.image-editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-editor-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
}

/* 顶部操作栏 */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #252525;
  border-bottom: 1px solid #333;
  flex-shrink: 0;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.editor-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.header-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid #444;
  border-radius: 6px;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.header-btn:hover {
  background: #333;
  border-color: #555;
  color: #fff;
}

.header-btn.primary {
  background: linear-gradient(135deg, #fdba74, #f97316);
  border-color: transparent;
  color: #000;
  font-weight: 500;
}

.header-btn.primary:hover {
  background: linear-gradient(135deg, #fed7aa, #fb923c);
}

.header-btn svg {
  width: 18px;
  height: 18px;
}

.header-divider {
  width: 1px;
  height: 24px;
  background: #444;
  margin: 0 8px;
}

/* 编辑器主体 */
.editor-body {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.tui-editor-wrapper {
  width: 100%;
  height: 100%;
}

/* 加载状态 */
.editor-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: #888;
  z-index: 10;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #333;
  border-top-color: #fdba74;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 动画 */
.editor-fade-enter-active,
.editor-fade-leave-active {
  transition: opacity 0.3s ease;
}

.editor-fade-enter-from,
.editor-fade-leave-to {
  opacity: 0;
}

/* TUI 编辑器样式覆盖 */
:deep(.tui-image-editor-container) {
  background: #1e1e1e !important;
}

:deep(.tui-image-editor-header) {
  display: none !important; /* 隐藏默认头部，使用自定义头部 */
}

:deep(.tui-image-editor-main-container) {
  background: #1e1e1e !important;
}

:deep(.tui-image-editor-canvas-container) {
  background: #2a2a2a !important;
  background-image: 
    linear-gradient(45deg, #333 25%, transparent 25%),
    linear-gradient(-45deg, #333 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #333 75%),
    linear-gradient(-45deg, transparent 75%, #333 75%) !important;
  background-size: 20px 20px !important;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px !important;
}

:deep(.tui-image-editor-menu) {
  background: #252525 !important;
}

:deep(.tui-image-editor-submenu) {
  background: #252525 !important;
}

:deep(.tui-image-editor-menu > .tui-image-editor-item) {
  border-radius: 4px;
  margin: 2px;
}

:deep(.tui-image-editor-menu > .tui-image-editor-item:hover) {
  background: #333 !important;
}

:deep(.tui-image-editor-menu > .tui-image-editor-item.active) {
  background: #444 !important;
}

:deep(.tui-image-editor-help-menu) {
  background: #252525 !important;
}

/* 隐藏下载和加载按钮 */
:deep(.tui-image-editor-header-buttons) {
  display: none !important;
}

:deep(.tui-image-editor-header-logo) {
  display: none !important;
}
</style>

