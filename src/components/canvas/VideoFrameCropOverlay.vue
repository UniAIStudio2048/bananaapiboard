<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { frameCropPixels, initialFrameCrop, moveFrameCrop, resizeFrameCrop } from '@/utils/videoFrameCrop'

const props = defineProps({ videoElement: { type: Object, default: null }, busy: { type: Boolean, default: false } })
const emit = defineEmits(['change', 'cancel', 'confirm'])
const surface = ref(null)
const crop = ref(initialFrameCrop())
const dimensions = ref({ width: 0, height: 0 })
const available = ref({ width: 0, height: 0 })
const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
let video = null
let observer = null
let drag = null

const ready = computed(() => dimensions.value.width >= 2 && dimensions.value.height >= 2)
const pixels = computed(() => ready.value ? frameCropPixels(crop.value, dimensions.value.width, dimensions.value.height) : null)
const surfaceStyle = computed(() => {
  if (!ready.value || !available.value.width || !available.value.height) return {}
  const scale = Math.min(available.value.width / dimensions.value.width, available.value.height / dimensions.value.height)
  return { width: `${dimensions.value.width * scale}px`, height: `${dimensions.value.height * scale}px` }
})
const cropStyle = computed(() => ({
  left: `${crop.value.x * 100}%`, top: `${crop.value.y * 100}%`,
  width: `${crop.value.width * 100}%`, height: `${crop.value.height * 100}%`
}))

function updateMetadata() {
  if (video?.videoWidth && video?.videoHeight) dimensions.value = { width: video.videoWidth, height: video.videoHeight }
}

function bindVideo(element) {
  video?.removeEventListener('loadedmetadata', updateMetadata)
  video = element
  video?.addEventListener('loadedmetadata', updateMetadata)
  updateMetadata()
}

watch(() => props.videoElement, bindVideo, { immediate: true })
watch(pixels, value => emit('change', value), { immediate: true })

function startDrag(event, edge = 'move') {
  if (!ready.value || props.busy) return
  const bounds = surface.value?.getBoundingClientRect()
  if (!bounds?.width || !bounds?.height) return
  drag = { edge, x: event.clientX, y: event.clientY, bounds, initial: { ...crop.value } }
}

function onPointerMove(event) {
  if (!drag) return
  const dx = (event.clientX - drag.x) / drag.bounds.width
  const dy = (event.clientY - drag.y) / drag.bounds.height
  crop.value = drag.edge === 'move'
    ? moveFrameCrop(drag.initial, dx, dy)
    : resizeFrameCrop(drag.initial, drag.edge, dx, dy, dimensions.value.width, dimensions.value.height)
}

function onPointerUp() { drag = null }

function adjustByKey(event, edge = 'move') {
  const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  const step = steps[event.key]
  if (!step || !ready.value || props.busy) return
  event.preventDefault()
  event.stopPropagation()
  const dx = step[0] * (event.shiftKey ? 10 : 2) / dimensions.value.width
  const dy = step[1] * (event.shiftKey ? 10 : 2) / dimensions.value.height
  crop.value = edge === 'move' ? moveFrameCrop(crop.value, dx, dy) : resizeFrameCrop(crop.value, edge, dx, dy, dimensions.value.width, dimensions.value.height)
}

function onKey(event) {
  if (event.key === 'Escape' && !props.busy) { event.preventDefault(); event.stopPropagation(); emit('cancel') }
  if (event.key === 'Enter' && event.target?.tagName !== 'BUTTON' && pixels.value && !props.busy) { event.preventDefault(); event.stopPropagation(); emit('confirm', pixels.value) }
}

onMounted(() => {
  const wrapper = surface.value?.parentElement
  if (wrapper) {
    const measure = () => { available.value = { width: wrapper.clientWidth, height: wrapper.clientHeight } }
    measure()
    observer = new ResizeObserver(measure)
    observer.observe(wrapper)
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('keydown', onKey, true)
})
onUnmounted(() => {
  observer?.disconnect()
  bindVideo(null)
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  window.removeEventListener('keydown', onKey, true)
})
</script>

<template>
  <div ref="surface" class="crop-surface nodrag nopan" :style="surfaceStyle" @pointerdown.stop @click.stop @wheel.stop>
    <div v-if="ready" class="crop-selection" :style="cropStyle" tabindex="0" role="group" aria-label="移动裁切区域" @pointerdown.stop.prevent="startDrag($event)" @keydown="adjustByKey($event)">
      <span class="crop-size">{{ pixels.width }} × {{ pixels.height }}</span>
      <div class="crop-grid" aria-hidden="true"></div>
      <button v-for="handle in handles" :key="handle" type="button" class="crop-handle" :class="`handle-${handle}`" :aria-label="`调整裁切边缘 ${handle}`" @pointerdown.stop.prevent="startDrag($event, handle)" @keydown="adjustByKey($event, handle)"></button>
    </div>
    <span v-else class="crop-loading">视频加载中…</span>
  </div>
</template>

<style scoped>
.crop-surface { position: absolute; z-index: 30; left: 50%; top: 50%; transform: translate(-50%, -50%); overflow: hidden; touch-action: none; user-select: none; }
.crop-selection { position: absolute; border: 1px solid #fff; box-shadow: 0 0 0 9999px rgba(0,0,0,.52); cursor: move; box-sizing: border-box; }
.crop-selection:focus-visible, .crop-handle:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.crop-grid { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(to right, transparent 33.2%, rgba(255,255,255,.45) 33.3%, transparent 33.6%, transparent 66.4%, rgba(255,255,255,.45) 66.7%, transparent 66.8%), linear-gradient(to bottom, transparent 33.2%, rgba(255,255,255,.45) 33.3%, transparent 33.6%, transparent 66.4%, rgba(255,255,255,.45) 66.7%, transparent 66.8%); }
.crop-size, .crop-loading { position: absolute; top: 8px; left: 8px; padding: 4px 7px; border-radius: 4px; background: rgba(0,0,0,.72); color: #fff; font-size: 11px; white-space: nowrap; pointer-events: none; }
.crop-handle { position: absolute; width: 10px; height: 10px; padding: 0; border: 1px solid #aaa; border-radius: 50%; background: #fff; transform: translate(-50%, -50%); }
.handle-nw { left: 0; top: 0; cursor: nwse-resize; }.handle-n { left: 50%; top: 0; cursor: ns-resize; }.handle-ne { left: 100%; top: 0; cursor: nesw-resize; }
.handle-e { left: 100%; top: 50%; cursor: ew-resize; }.handle-se { left: 100%; top: 100%; cursor: nwse-resize; }.handle-s { left: 50%; top: 100%; cursor: ns-resize; }
.handle-sw { left: 0; top: 100%; cursor: nesw-resize; }.handle-w { left: 0; top: 50%; cursor: ew-resize; }
</style>
