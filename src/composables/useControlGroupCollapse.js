import { computed, ref } from 'vue'

export function useControlGroupCollapse() {
  const pinned = ref(true)
  const hovered = ref(false)
  const expanded = computed(() => pinned.value || hovered.value)

  function toggle() {
    pinned.value = !pinned.value
    if (!pinned.value) hovered.value = false
  }

  function enter() {
    if (!pinned.value) hovered.value = true
  }

  function leave() {
    hovered.value = false
  }

  return {
    pinned,
    expanded,
    toggle,
    enter,
    leave
  }
}
