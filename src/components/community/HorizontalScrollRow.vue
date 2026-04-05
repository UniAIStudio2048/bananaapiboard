<template>
  <div class="relative group/scroll">
    <!-- 左箭头 -->
    <button
      v-show="canScrollLeft"
      class="absolute left-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-r from-black/80 to-transparent flex items-center justify-center opacity-0 group-hover/scroll:opacity-100 transition-opacity"
      aria-label="向左滚动"
      @click="scrollBy(-1)"
    >
      <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
      </svg>
    </button>

    <!-- 滚动容器 -->
    <div
      ref="scrollContainer"
      class="flex gap-3 overflow-x-auto scroll-smooth scrollbar-hide"
      style="scroll-snap-type: x mandatory; -ms-overflow-style: none; scrollbar-width: none;"
      @scroll="updateScrollState"
      @wheel.prevent="handleWheel"
    >
      <div
        v-for="work in works"
        :key="work.id"
        class="flex-shrink-0 w-[calc(50%-6px)] sm:w-[calc(33.333%-8px)] lg:w-[calc(25%-9px)]"
        style="scroll-snap-align: start;"
      >
        <WorkCard
          :work="work"
          :landscape="true"
          @click="$emit('click', $event)"
          @like="$emit('like', $event)"
        />
      </div>
    </div>

    <!-- 右箭头 -->
    <button
      v-show="canScrollRight"
      class="absolute right-0 top-0 bottom-0 z-10 w-10 bg-gradient-to-l from-black/80 to-transparent flex items-center justify-center opacity-0 group-hover/scroll:opacity-100 transition-opacity"
      aria-label="向右滚动"
      @click="scrollBy(1)"
    >
      <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
      </svg>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import WorkCard from './WorkCard.vue'

defineProps({
  works: { type: Array, default: () => [] }
})

defineEmits(['click', 'like'])

const scrollContainer = ref(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(true)

function updateScrollState() {
  const el = scrollContainer.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 10
  canScrollRight.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 10
}

function scrollBy(direction) {
  const el = scrollContainer.value
  if (!el) return
  const cardWidth = el.querySelector(':first-child')?.offsetWidth || 300
  el.scrollBy({ left: direction * (cardWidth + 12), behavior: 'smooth' })
}

function handleWheel(e) {
  const el = scrollContainer.value
  if (!el) return
  el.scrollLeft += e.deltaY || e.deltaX
}

onMounted(() => {
  nextTick(updateScrollState)
})
</script>

<style scoped>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
