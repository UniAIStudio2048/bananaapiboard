<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  markers: {
    type: Array,
    default: () => []
  },
  rows: {
    type: Number,
    default: 3
  },
  placeholder: {
    type: String,
    default: '描述你想要的图像...'
  }
})

const emit = defineEmits(['update:modelValue', 'input', 'mention-trigger'])

const inputRef = ref(null)
const contentEditableRef = ref(null)
const isFocused = ref(false)

// 解析提示词中的标记引用
const parsedContent = computed(() => {
  const text = props.modelValue || ''
  const parts = []
  let lastIndex = 0
  
  // 匹配 "图X-Y位置" 格式
  const regex = /图(\d+)-([A-Z])位置/g
  let match
  
  while ((match = regex.exec(text)) !== null) {
    // 添加前面的普通文本
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index)
      })
    }
    
    // 添加标记标签
    parts.push({
      type: 'tag',
      content: match[0],
      imageIndex: parseInt(match[1]) - 1,
      label: match[2]
    })
    
    lastIndex = match.index + match[0].length
  }
  
  // 添加剩余的文本
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex)
    })
  }
  
  return parts
})

// 处理输入
function handleInput(e) {
  // 提取纯文本，排除删除按钮的 ×
  const contentDiv = e.target
  let text = ''
  
  // 遍历所有子节点
  contentDiv.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      // 文本节点：直接添加
      text += node.textContent
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.classList.contains('prompt-tag')) {
        // 标签节点：只提取标签文本，不包括删除按钮
        const textSpan = node.querySelector('.prompt-tag-text')
        if (textSpan) {
          text += textSpan.textContent
        }
      } else {
        // 其他元素：提取文本内容
        text += node.textContent
      }
    }
  })
  
  emit('update:modelValue', text)
  emit('input', e)
}

// 处理键盘事件
function handleKeyDown(e) {
  // Delete 或 Backspace 删除标签
  if (e.key === 'Backspace' || e.key === 'Delete') {
    const selection = window.getSelection()
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const container = range.startContainer
      
      // 检查是否在标签元素上
      let tagElement = null
      if (container.nodeType === Node.ELEMENT_NODE) {
        tagElement = container.closest('.prompt-tag')
      } else if (container.parentElement) {
        tagElement = container.parentElement.closest('.prompt-tag')
      }
      
      if (tagElement) {
        e.preventDefault()
        const tagText = tagElement.textContent
        // 从文本中删除这个标签
        const newText = props.modelValue.replace(tagText, '')
        emit('update:modelValue', newText)
        
        nextTick(() => {
          // 设置光标到删除位置
          if (contentEditableRef.value) {
            const range = document.createRange()
            const sel = window.getSelection()
            range.selectNodeContents(contentEditableRef.value)
            range.collapse(false)
            sel.removeAllRanges()
            sel.addRange(range)
          }
        })
      }
    }
  }
  
  // 检测 @ 输入
  if (e.key === '@') {
    nextTick(() => {
      emit('mention-trigger', e)
    })
  }
}

// 删除标签
function removeTag(tagContent) {
  console.log('[removeTag] 删除前 modelValue:', props.modelValue)
  const newText = props.modelValue.replace(tagContent, '')
  console.log('[removeTag] 删除后 newText:', newText)
  emit('update:modelValue', newText)
  
  // 强制更新 contentEditable，不管是否聚焦
  nextTick(() => {
    updateContentEditable()
    if (contentEditableRef.value) {
      contentEditableRef.value.focus()
    }
  })
}

// 同步内容到 contentEditable
watch(() => props.modelValue, (newValue) => {
  if (contentEditableRef.value && document.activeElement !== contentEditableRef.value) {
    // 只在非聚焦状态下更新，避免打断用户输入
    updateContentEditable()
  }
})

function updateContentEditable() {
  if (!contentEditableRef.value) return
  
  // 保存光标位置
  const selection = window.getSelection()
  const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  const cursorOffset = range ? range.startOffset : 0
  
  // 清空并重新构建内容
  contentEditableRef.value.innerHTML = ''
  
  parsedContent.value.forEach(part => {
    if (part.type === 'text') {
      const textNode = document.createTextNode(part.content)
      contentEditableRef.value.appendChild(textNode)
    } else if (part.type === 'tag') {
      const tagSpan = document.createElement('span')
      tagSpan.className = 'prompt-tag'
      tagSpan.contentEditable = 'false'
      tagSpan.setAttribute('data-tag', 'true') // 标记为标签元素
      
      // 标签文本
      const textSpan = document.createElement('span')
      textSpan.className = 'prompt-tag-text'
      textSpan.textContent = part.content
      tagSpan.appendChild(textSpan)
      
      // 添加删除按钮
      const closeBtn = document.createElement('span')
      closeBtn.className = 'prompt-tag-close'
      closeBtn.textContent = '×'
      closeBtn.contentEditable = 'false' // 明确设置不可编辑
      closeBtn.setAttribute('data-tag-content', part.content) // 存储标签内容
      closeBtn.setAttribute('role', 'button') // 语义化
      closeBtn.setAttribute('aria-label', '删除标签')
      
      // 使用 mousedown 和 click 双重监听，确保能触发
      const handleDelete = (e) => {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        console.log('[PromptInputWithTags] 删除标签:', part.content)
        removeTag(part.content)
        return false
      }
      
      // 使用捕获阶段，优先级最高
      closeBtn.addEventListener('mousedown', handleDelete, { capture: true, passive: false })
      closeBtn.addEventListener('click', handleDelete, { capture: true, passive: false })
      closeBtn.addEventListener('touchstart', handleDelete, { capture: true, passive: false })
      
      tagSpan.appendChild(closeBtn)
      
      contentEditableRef.value.appendChild(tagSpan)
    }
  })
}

// 获取纯文本内容
function getPlainText() {
  return props.modelValue
}

// 插入标记引用
function insertMarkerReference(text, insertPosition = null) {
  const currentText = props.modelValue
  
  // 如果指定了插入位置，在该位置插入
  if (insertPosition !== null) {
    const beforeText = currentText.substring(0, insertPosition)
    const afterText = currentText.substring(insertPosition)
    const newText = beforeText + text + afterText
    emit('update:modelValue', newText)
    
    // 设置光标到插入文本后面
    nextTick(() => {
      if (contentEditableRef.value) {
        contentEditableRef.value.focus()
        
        // 计算光标应该在的位置
        const targetPosition = insertPosition + text.length
        
        // 设置光标位置
        setCursorPosition(targetPosition)
      }
    })
  } else {
    // 追加到末尾
    const newText = currentText + text
    emit('update:modelValue', newText)
    
    nextTick(() => {
      if (contentEditableRef.value) {
        contentEditableRef.value.focus()
        // 移动光标到末尾
        const range = document.createRange()
        const sel = window.getSelection()
        range.selectNodeContents(contentEditableRef.value)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    })
  }
}

// 设置光标位置
function setCursorPosition(position) {
  if (!contentEditableRef.value) return
  
  const sel = window.getSelection()
  const range = document.createRange()
  
  let charCount = 0
  let found = false
  
  // 遍历所有文本节点
  const walker = document.createTreeWalker(
    contentEditableRef.value,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    null
  )
  
  let node
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      const textLength = node.textContent.length
      if (charCount + textLength >= position) {
        range.setStart(node, position - charCount)
        range.collapse(true)
        found = true
        break
      }
      charCount += textLength
    } else if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('prompt-tag')) {
      // 跳过标签元素，计算其文本长度
      const tagText = node.textContent
      if (charCount + tagText.length >= position) {
        // 光标应该在标签后面
        range.setStartAfter(node)
        range.collapse(true)
        found = true
        break
      }
      charCount += tagText.length
    }
  }
  
  if (!found) {
    // 如果没找到，设置到末尾
    range.selectNodeContents(contentEditableRef.value)
    range.collapse(false)
  }
  
  sel.removeAllRanges()
  sel.addRange(range)
}

onMounted(() => {
  updateContentEditable()
})

defineExpose({
  getPlainText,
  insertMarkerReference,
  focus: () => contentEditableRef.value?.focus()
})
</script>

<template>
  <div class="prompt-input-container">
    <div
      ref="contentEditableRef"
      contenteditable="true"
      class="prompt-input"
      :class="{ 'is-focused': isFocused }"
      :data-placeholder="placeholder"
      @input="handleInput"
      @keydown="handleKeyDown"
      @focus="isFocused = true"
      @blur="isFocused = false"
    ></div>
  </div>
</template>

<style scoped>
.prompt-input-container {
  position: relative;
  width: 100%;
}

.prompt-input {
  width: 100%;
  min-height: 80px;
  max-height: 200px;
  padding: 10px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  color: #1e293b;
  font-size: 14px;
  line-height: 1.6;
  overflow-y: auto;
  outline: none;
  transition: all 0.2s;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.dark .prompt-input {
  background: #1e293b;
  border-color: #334155;
  color: #e2e8f0;
}

.prompt-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.dark .prompt-input:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.1);
}

.prompt-input:empty:before {
  content: attr(data-placeholder);
  color: #94a3b8;
  pointer-events: none;
}

.dark .prompt-input:empty:before {
  color: #64748b;
}

/* 标签样式 */
.prompt-input :deep(.prompt-tag) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  margin: 0 2px;
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
  color: #1e40af;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s;
  white-space: nowrap;
}

.dark .prompt-input :deep(.prompt-tag) {
  background: linear-gradient(135deg, #1e3a8a, #1e40af);
  color: #93c5fd;
}

.prompt-input :deep(.prompt-tag):hover {
  background: linear-gradient(135deg, #bfdbfe, #93c5fd);
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
}

.dark .prompt-input :deep(.prompt-tag):hover {
  background: linear-gradient(135deg, #1e40af, #2563eb);
}

.prompt-input :deep(.prompt-tag-close) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 4px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  font-size: 14px;
  font-weight: bold;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
  pointer-events: auto; /* 确保可以接收点击事件 */
  user-select: none; /* 防止选中文字 */
  flex-shrink: 0; /* 防止被压缩 */
}

.prompt-input :deep(.prompt-tag-close):hover {
  background: rgba(255, 255, 255, 0.5);
  transform: scale(1.1);
}

/* 滚动条样式 */
.prompt-input::-webkit-scrollbar {
  width: 6px;
}

.prompt-input::-webkit-scrollbar-track {
  background: transparent;
}

.prompt-input::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}

.dark .prompt-input::-webkit-scrollbar-thumb {
  background: #475569;
}
</style>

