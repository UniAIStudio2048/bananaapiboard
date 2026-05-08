<script setup>
import { computed, ref, watch } from 'vue'
import { formatModelTextIcon, parseModelIcon } from '@/utils/modelIcon'

const props = defineProps({
  icon: {
    type: [String, Number],
    default: ''
  },
  label: {
    type: String,
    default: ''
  }
})

const imageFailed = ref(false)
const parsedIcon = computed(() => parseModelIcon(props.icon))
const isImageIcon = computed(() => !imageFailed.value && (parsedIcon.value.type === 'image' || parsedIcon.value.type === 'lobe/avatar'))
const fallbackText = computed(() => formatModelTextIcon(props.icon || props.label))
const iconTitle = computed(() => parsedIcon.value.title || props.label || parsedIcon.value.raw || '')
const imageClass = computed(() => ({
  'model-icon-image': true,
  'model-icon-image-square': parsedIcon.value.type === 'lobe/avatar' && parsedIcon.value.shape === 'square'
}))

watch(
  () => props.icon,
  () => {
    imageFailed.value = false
  }
)

function handleImageError() {
  imageFailed.value = true
}
</script>

<template>
  <span class="model-icon-root" :title="iconTitle">
    <img
      v-if="isImageIcon"
      :src="parsedIcon.src"
      :alt="label || parsedIcon.slug || 'model icon'"
      :class="imageClass"
      @error="handleImageError"
    />
    <span v-else class="model-icon-text">{{ fallbackText }}</span>
  </span>
</template>

<style scoped>
.model-icon-root {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  line-height: 1;
  font-size: inherit;
}

.model-icon-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  display: block;
}

.model-icon-image-square {
  border-radius: inherit;
}

.model-icon-text {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: inherit;
  font-weight: inherit;
}
</style>
