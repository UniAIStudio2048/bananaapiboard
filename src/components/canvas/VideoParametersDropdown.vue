<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  aspectRatios: {
    type: Array,
    default: () => []
  },
  aspectRatio: {
    type: String,
    default: ''
  },
  resolutionOptions: {
    type: Array,
    default: () => []
  },
  resolution: {
    type: String,
    default: ''
  },
  durationOptions: {
    type: Array,
    default: () => []
  },
  duration: {
    type: [String, Number],
    default: ''
  },
  showDuration: Boolean
})

const emit = defineEmits([
  'update:aspectRatio',
  'update:resolution',
  'update:duration'
])

const rootRef = ref(null)
const isOpen = ref(false)
const openUpward = ref(false)

const currentAspectRatio = computed(() => {
  return props.aspectRatios.find(option => option.value === props.aspectRatio)
})

const currentResolution = computed(() => {
  return props.resolutionOptions.find(option => option.value === props.resolution)
})

const currentDuration = computed(() => {
  return props.durationOptions.find(option => String(option.value) === String(props.duration))
})

const triggerLabel = computed(() => {
  const values = []
  if (currentAspectRatio.value?.value) values.push(currentAspectRatio.value.value)
  if (currentResolution.value?.label || currentResolution.value?.value) {
    values.push(currentResolution.value.label || currentResolution.value.value)
  }
  if (props.showDuration && (currentDuration.value?.label || currentDuration.value?.value)) {
    values.push(currentDuration.value.label || `${currentDuration.value.value}s`)
  }
  return values.join(' · ') || '生成参数'
})

const durationIndex = computed(() => {
  return Math.max(0, props.durationOptions.findIndex(option => String(option.value) === String(props.duration)))
})

function getAspectRatioClass(value) {
  return `ratio-${String(value || '').replace(':', '-')}`
}

function togglePanel(event) {
  event.stopPropagation()
  if (isOpen.value) {
    isOpen.value = false
    return
  }

  const trigger = event.currentTarget
  const rect = trigger?.getBoundingClientRect()
  openUpward.value = Boolean(rect && rect.bottom + 430 > window.innerHeight && rect.top > 430)
  isOpen.value = true
}

function selectAspectRatio(value) {
  emit('update:aspectRatio', value)
}

function selectResolution(value) {
  emit('update:resolution', value)
}

function selectDuration(value) {
  emit('update:duration', value)
}

function handleDurationSlider(event) {
  const index = Number(event.target.value)
  const option = props.durationOptions[index]
  if (option) selectDuration(option.value)
}

function handleDocumentMouseDown(event) {
  if (!rootRef.value?.contains(event.target)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', handleDocumentMouseDown))
onUnmounted(() => document.removeEventListener('mousedown', handleDocumentMouseDown))
</script>

<template>
  <div ref="rootRef" class="video-parameters-dropdown" @mousedown.stop @click.stop>
    <button
      type="button"
      class="video-parameters-trigger"
      :aria-expanded="isOpen"
      @click="togglePanel"
    >
      <span class="video-parameters-trigger-icon" aria-hidden="true"></span>
      <span class="video-parameters-trigger-label">{{ triggerLabel }}</span>
      <span class="video-parameters-trigger-arrow" :class="{ open: isOpen }" aria-hidden="true">⌃</span>
    </button>

    <Transition name="video-parameters-fade">
      <div
        v-if="isOpen"
        class="video-parameters-panel"
        :class="{ 'opens-upward': openUpward }"
      >
        <section v-if="aspectRatios.length > 0" class="video-parameters-section">
          <h3>比例</h3>
          <div class="video-aspect-ratio-grid">
            <button
              v-for="option in aspectRatios"
              :key="option.value"
              type="button"
              class="video-aspect-ratio-option"
              :class="{ active: option.value === aspectRatio }"
              @click="selectAspectRatio(option.value)"
            >
              <span class="video-aspect-ratio-icon" :class="getAspectRatioClass(option.value)" aria-hidden="true"></span>
              <span>{{ option.value }}</span>
            </button>
          </div>
        </section>

        <section v-if="resolutionOptions.length > 0" class="video-parameters-section">
          <h3>清晰度</h3>
          <div class="video-resolution-grid">
            <button
              v-for="option in resolutionOptions"
              :key="option.value"
              type="button"
              class="video-resolution-option"
              :class="{ active: option.value === resolution }"
              @click="selectResolution(option.value)"
            >
              {{ option.label || option.value }}
            </button>
          </div>
        </section>

        <section v-if="showDuration && durationOptions.length > 0" class="video-parameters-section">
          <h3>生成时长</h3>
          <div v-if="durationOptions.length <= 6" class="video-duration-option-grid">
            <button
              v-for="option in durationOptions"
              :key="option.value"
              type="button"
              class="video-duration-option"
              :class="{ active: String(option.value) === String(duration) }"
              @click="selectDuration(option.value)"
            >
              {{ option.label || `${option.value}s` }}
            </button>
          </div>
          <div v-else class="video-duration-slider-row">
            <input
              type="range"
              :min="0"
              :max="durationOptions.length - 1"
              :value="durationIndex"
              step="1"
              aria-label="生成时长"
              @input="handleDurationSlider"
            >
            <output>{{ currentDuration?.label || `${currentDuration?.value || ''}s` }}</output>
          </div>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.video-parameters-dropdown {
  position: relative;
  z-index: 112;
}

.video-parameters-trigger {
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 220px;
  min-height: 34px;
  gap: 8px;
  padding: 5px 10px;
  color: rgba(255, 255, 255, 0.94);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  cursor: pointer;
}

.video-parameters-trigger:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.18);
}

.video-parameters-trigger-icon {
  position: relative;
  width: 17px;
  height: 12px;
  flex: 0 0 auto;
  border: 1.5px solid currentColor;
  border-radius: 3px;
}

.video-parameters-trigger-label {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-parameters-trigger-arrow {
  flex: 0 0 auto;
  margin-left: 1px;
  color: rgba(255, 255, 255, 0.54);
  font-size: 11px;
  line-height: 1;
  transform: rotate(180deg);
  transition: transform 0.16s ease;
}

.video-parameters-trigger-arrow.open {
  transform: rotate(0deg);
}

.video-parameters-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  width: min(360px, calc(100vw - 32px));
  max-height: min(480px, calc(100vh - 80px));
  padding: 18px 20px;
  overflow-y: auto;
  background: #252525;
  border: 1px solid rgba(255, 255, 255, 0.11);
  border-radius: 18px;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.video-parameters-panel.opens-upward {
  top: auto;
  bottom: calc(100% + 8px);
}

.video-parameters-section + .video-parameters-section {
  margin-top: 16px;
}

.video-parameters-section h3 {
  margin: 0 0 9px;
  color: rgba(255, 255, 255, 0.57);
  font-size: 15px;
  font-weight: 700;
}

.video-aspect-ratio-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.video-aspect-ratio-option,
.video-resolution-option,
.video-duration-option {
  color: rgba(255, 255, 255, 0.58);
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;
}

.video-aspect-ratio-option:hover,
.video-resolution-option:hover,
.video-duration-option:hover {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.42);
}

.video-aspect-ratio-option.active,
.video-resolution-option.active,
.video-duration-option.active {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.92);
}

.video-aspect-ratio-option {
  display: flex;
  min-height: 74px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 3px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.video-aspect-ratio-icon {
  display: block;
  border: 1.5px solid currentColor;
  border-radius: 3px;
}

.video-aspect-ratio-icon.ratio-16-9 { width: 22px; height: 13px; }
.video-aspect-ratio-icon.ratio-9-16 { width: 12px; height: 22px; }
.video-aspect-ratio-icon.ratio-1-1 { width: 17px; height: 17px; }
.video-aspect-ratio-icon.ratio-3-4 { width: 14px; height: 19px; }
.video-aspect-ratio-icon.ratio-4-3 { width: 19px; height: 14px; }

.video-resolution-grid,
.video-duration-option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(74px, 1fr));
  gap: 8px;
}

.video-resolution-option,
.video-duration-option {
  min-height: 42px;
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
}

.video-duration-slider-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
}

.video-duration-slider-row input {
  width: 100%;
  height: 4px;
  accent-color: #2587d9;
  cursor: pointer;
}

.video-duration-slider-row output {
  min-width: 64px;
  padding: 7px 10px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  font-weight: 700;
  text-align: center;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 9px;
}

.video-parameters-fade-enter-active,
.video-parameters-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.video-parameters-fade-enter-from,
.video-parameters-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.opens-upward.video-parameters-fade-enter-from,
.opens-upward.video-parameters-fade-leave-to {
  transform: translateY(6px);
}

:global(:root.canvas-theme-light) .video-parameters-trigger {
  color: rgba(0, 0, 0, 0.76);
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.12);
}

:global(:root.canvas-theme-light) .video-parameters-panel {
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.12);
}

:global(:root.canvas-theme-light) .video-parameters-section h3,
:global(:root.canvas-theme-light) .video-aspect-ratio-option,
:global(:root.canvas-theme-light) .video-resolution-option,
:global(:root.canvas-theme-light) .video-duration-option {
  color: rgba(0, 0, 0, 0.56);
  border-color: rgba(0, 0, 0, 0.2);
}

:global(:root.canvas-theme-light) .video-aspect-ratio-option.active,
:global(:root.canvas-theme-light) .video-resolution-option.active,
:global(:root.canvas-theme-light) .video-duration-option.active {
  color: rgba(0, 0, 0, 0.92);
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.78);
}
</style>
