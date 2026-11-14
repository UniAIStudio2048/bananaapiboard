<template>
  <Teleport to="body">
    <div v-if="isOpen" class="image-preset-dialog-overlay" @click="handleOverlayClick">
      <div class="image-preset-dialog" @click.stop>
        <div class="dialog-header">
          <h2 class="dialog-title">{{ editMode ? translateUi('uiMessages.m4fb14b307359') : translateUi('uiMessages.m20855d556d73') }}</h2>
          <button class="close-btn" @click="close">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="dialog-body">
          <!-- 预设名称 -->
          <div class="form-group">
            <label class="form-label">
              {{ translateUi('uiMessages.m5fe110aa6d1d') }} <span class="required">*</span>
            </label>
            <input
              v-model="formData.name"
              type="text"
              class="form-input"
              :placeholder="translateUi('uiMessages.m31a4ee8eff99')"
              maxlength="50"
              @input="validateName"
            />
            <div class="form-hint">
              <span :class="{ 'text-warning': formData.name.length > 40 }">
                {{ translateUi('uiMessages.m5257713441ae', { value1: (formData.name.length) }) }}
              </span>
              <span v-if="nameError" class="text-error">{{ nameError }}</span>
            </div>
          </div>

          <!-- 预设描述 -->
          <div class="form-group">
            <label class="form-label">
              {{ translateUi('uiMessages.mdd98177083fe') }} <span class="optional">{{ translateUi('uiMessages.m4dc0652b94e5') }}</span>
            </label>
            <input
              v-model="formData.description"
              type="text"
              class="form-input"
              :placeholder="translateUi('uiMessages.m9cceb95e94ec')"
              maxlength="100"
            />
            <div class="form-hint">
              <span>{{ translateUi('uiMessages.m993d9ac82775', { value1: (formData.description?.length || 0) }) }}</span>
            </div>
          </div>

          <!-- 提示词模板 -->
          <div class="form-group">
            <label class="form-label">
              {{ translateUi('uiMessages.m99711af0ad83') }} <span class="required">*</span>
            </label>
            <textarea
              v-model="formData.prompt"
              class="form-textarea"
              :placeholder="translateUi('uiMessages.mf719564ff678')"
              rows="8"
              maxlength="6000"
              @input="validatePrompt"
            ></textarea>
            <div class="form-hint">
              <span :class="{ 'text-warning': formData.prompt.length > 5500, 'text-error': formData.prompt.length > 5900 }">
                {{ translateUi('uiMessages.m9ddfcc864398', { value1: (formData.prompt.length) }) }}
              </span>
              <span v-if="promptError" class="text-error">{{ promptError }}</span>
            </div>
          </div>

          <!-- 分类选择 -->
          <div class="form-group">
            <label class="form-label">{{ translateUi('directorStudio.inspector.category') }}</label>
            <div class="category-grid">
              <button
                v-for="cat in categories"
                :key="cat.value"
                type="button"
                class="category-btn"
                :class="{ active: formData.category === cat.value }"
                @click="formData.category = cat.value"
              >
                {{ cat.label }}
              </button>
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <button class="btn btn-secondary" @click="close">
            {{ translateUi('common.cancel') }}
          </button>
          <button
            v-if="!editMode"
            class="btn btn-secondary"
            @click="handleTempUse"
            :disabled="!isFormValid || isSubmitting"
          >
            {{ translateUi('uiMessages.mcd8cf299109f') }}
          </button>
          <button
            class="btn btn-primary"
            @click="handleSubmit"
            :disabled="!isFormValid || isSubmitting"
          >
            <svg v-if="isSubmitting" class="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ isSubmitting ? translateUi('common.saving') : (editMode ? translateUi('uiMessages.m3055a035f0eb') : translateUi('uiMessages.mbbba898d6e9c')) }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { t as translateUi } from '@/i18n'

import { ref, computed, watch } from 'vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    required: true
  },
  preset: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'submit', 'temp-use'])

// 分类选项
const categories = [
  { value: 'general', get label() { return translateUi('uiMessages.m835b700e028c') } },
  { value: 'character', get label() { return translateUi('user.role') } },
  { value: 'landscape', get label() { return translateUi('uiMessages.m0f70eef46ff0') } },
  { value: 'style', get label() { return translateUi('uiMessages.m645f12e4a922') } },
  { value: 'anime', get label() { return translateUi('uiMessages.mdbc31bd44b06') } },
  { value: 'realistic', get label() { return translateUi('uiMessages.m93294b654c40') } },
  { value: 'abstract', get label() { return translateUi('uiMessages.m775f63691afe') } },
  { value: 'other', get label() { return translateUi('uiMessages.md2909f1647e7') } }
]

// 表单数据
const formData = ref({
  name: '',
  description: '',
  prompt: '',
  category: 'general'
})

// 验证错误
const nameError = ref('')
const promptError = ref('')
const isSubmitting = ref(false)

// 是否是编辑模式
const editMode = computed(() => !!props.preset)

// 表单验证
const isFormValid = computed(() => {
  return formData.value.name.trim().length > 0 &&
         formData.value.name.trim().length <= 50 &&
         formData.value.prompt.trim().length > 0 &&
         formData.value.prompt.length <= 6000 &&
         !nameError.value &&
         !promptError.value
})

// 验证名称
function validateName() {
  const name = formData.value.name.trim()
  if (!name) {
    nameError.value = translateUi('uiMessages.m1e396cf6fce0')
  } else if (name.length > 50) {
    nameError.value = translateUi('uiMessages.m519dfdc0a18e')
  } else {
    nameError.value = ''
  }
}

// 验证提示词
function validatePrompt() {
  const prompt = formData.value.prompt
  if (!prompt.trim()) {
    promptError.value = translateUi('uiMessages.me35619733cdd')
  } else if (prompt.length > 6000) {
    promptError.value = translateUi('uiMessages.me75489536df7')
  } else {
    promptError.value = ''
  }
}

// 监听预设属性变化，初始化表单
watch(() => props.preset, (newPreset) => {
  if (newPreset) {
    formData.value = {
      name: newPreset.name || '',
      description: newPreset.description || '',
      prompt: newPreset.prompt || '',
      category: newPreset.category || 'general'
    }
  } else {
    formData.value = {
      name: '',
      description: '',
      prompt: '',
      category: 'general'
    }
  }
  nameError.value = ''
  promptError.value = ''
}, { immediate: true })

// 监听打开状态，重置表单
watch(() => props.isOpen, (isOpen) => {
  if (!isOpen) {
    isSubmitting.value = false
  }
})

// 关闭对话框
function close() {
  emit('close')
}

// 点击遮罩层关闭
function handleOverlayClick() {
  close()
}

// 提交表单（保存并使用）
async function handleSubmit() {
  if (!isFormValid.value || isSubmitting.value) return

  isSubmitting.value = true
  try {
    await emit('submit', {
      name: formData.value.name.trim(),
      description: formData.value.description.trim(),
      prompt: formData.value.prompt,
      category: formData.value.category
    })
  } finally {
    isSubmitting.value = false
  }
}

// 临时使用（不保存）
function handleTempUse() {
  if (!isFormValid.value) return

  emit('temp-use', {
    prompt: formData.value.prompt
  })
  close()
}
</script>

<style scoped>
.image-preset-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.image-preset-dialog {
  background: var(--canvas-bg-primary, #1e1e1e);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.dialog-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--canvas-border, rgba(255, 255, 255, 0.1));
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--canvas-text-primary, #ffffff);
  margin: 0;
}

.close-btn {
  padding: 6px;
  border: none;
  background: transparent;
  color: var(--canvas-text-secondary, #a0a0a0);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--canvas-bg-tertiary, rgba(255, 255, 255, 0.06));
  color: var(--canvas-text-primary, #ffffff);
}

.dialog-body {
  padding: 24px;
  overflow-y: auto;
  flex: 1;
}

.form-group {
  margin-bottom: 20px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--canvas-text-primary, #ffffff);
  margin-bottom: 8px;
}

.required {
  color: #ef4444;
}

.optional {
  color: var(--canvas-text-secondary, #a0a0a0);
  font-weight: 400;
  font-size: 12px;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 12px;
  background: var(--canvas-bg-secondary, #2a2a2a);
  border: 1px solid var(--canvas-border, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  color: var(--canvas-text-primary, #ffffff);
  font-size: 14px;
  transition: all 0.15s ease;
  font-family: inherit;
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--canvas-text-secondary, #a0a0a0);
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--primary-color, #8b5cf6);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
}

.form-textarea {
  resize: vertical;
  min-height: 160px;
  line-height: 1.5;
}

.form-hint {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
  color: var(--canvas-text-secondary, #a0a0a0);
  gap: 12px;
}

.text-warning {
  color: #f59e0b;
}

.text-error {
  color: #ef4444;
}

/* 分类按钮网格 */
.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.category-btn {
  padding: 6px 12px;
  background: var(--canvas-bg-secondary, #2a2a2a);
  border: 1px solid var(--canvas-border, rgba(255, 255, 255, 0.1));
  border-radius: 6px;
  color: var(--canvas-text-secondary, #a0a0a0);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.category-btn:hover {
  border-color: var(--primary-color, #8b5cf6);
  color: var(--canvas-text-primary, #ffffff);
}

.category-btn.active {
  background: rgba(139, 92, 246, 0.15);
  border-color: var(--primary-color, #8b5cf6);
  color: var(--primary-color, #8b5cf6);
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--canvas-border, rgba(255, 255, 255, 0.1));
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--canvas-bg-tertiary, rgba(255, 255, 255, 0.06));
  color: var(--canvas-text-primary, #ffffff);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--canvas-bg-tertiary, rgba(255, 255, 255, 0.1));
}

.btn-primary {
  background: var(--primary-color, #8b5cf6);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-color-hover, #7c3aed);
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
