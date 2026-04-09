<script setup>
/**
 * CanvasSpaceSwitcher.vue - 画布右上角空间快速切换按钮
 * 显示当前空间名称，点击展开下拉菜单切换全局空间
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTeamStore } from '@/stores/team'
import { useI18n } from '@/i18n'

const { t } = useI18n()
const teamStore = useTeamStore()

const isOpen = ref(false)
const dropdownRef = ref(null)

const spaces = computed(() => {
  const list = [
    { id: 'personal', name: t('team.personalSpace'), icon: '👤', type: 'personal' }
  ]
  teamStore.myTeams.value.forEach(team => {
    list.push({
      id: `team-${team.id}`,
      teamId: team.id,
      name: team.name,
      icon: '👥',
      type: 'team',
      role: team.my_role
    })
  })
  return list
})

const currentId = computed(() => {
  if (teamStore.globalSpaceType.value === 'personal') return 'personal'
  return `team-${teamStore.globalTeamId.value}`
})

async function selectSpace(space) {
  if (space.id === currentId.value) {
    isOpen.value = false
    return
  }
  if (space.type === 'personal') {
    teamStore.switchToPersonalSpace()
  } else {
    await teamStore.switchToTeam(space.teamId)
  }
  isOpen.value = false
}

function toggleDropdown() {
  isOpen.value = !isOpen.value
}

function handleClickOutside(event) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isOpen.value = false
  }
}

function getRoleText(role) {
  const map = { owner: '所有者', admin: '管理员', member: '成员' }
  return map[role] || role
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div class="canvas-space-switcher" ref="dropdownRef">
    <button class="space-trigger" @click="toggleDropdown" :title="'当前空间: ' + teamStore.currentSpaceLabel.value">
      <span class="space-icon">{{ teamStore.currentSpaceIcon.value }}</span>
      <span class="space-label">{{ teamStore.currentSpaceLabel.value }}</span>
      <svg class="arrow-icon" :class="{ open: isOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>

    <transition name="space-dropdown">
      <div v-if="isOpen" class="space-dropdown">
        <div
          v-for="space in spaces"
          :key="space.id"
          :class="['space-option', { active: currentId === space.id }]"
          @click="selectSpace(space)"
        >
          <span class="option-icon">{{ space.icon }}</span>
          <span class="option-name">{{ space.name }}</span>
          <span v-if="space.type === 'team' && space.role" class="option-role">{{ getRoleText(space.role) }}</span>
          <svg v-if="currentId === space.id" class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.canvas-space-switcher {
  position: relative;
}

.space-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--canvas-border, rgba(255, 255, 255, 0.12));
  background: var(--canvas-bg-secondary, rgba(255, 255, 255, 0.06));
  color: var(--canvas-text-primary, rgba(255, 255, 255, 0.9));
  font-size: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  height: 32px;
}

.space-trigger:hover {
  background: var(--canvas-bg-hover, rgba(255, 255, 255, 0.1));
  border-color: var(--canvas-border-hover, rgba(255, 255, 255, 0.2));
}

.space-icon {
  font-size: 14px;
  line-height: 1;
}

.space-label {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow-icon {
  opacity: 0.5;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.arrow-icon.open {
  transform: rotate(180deg);
}

.space-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 200px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--canvas-bg-elevated, rgba(30, 30, 30, 0.98));
  border: 1px solid var(--canvas-border, rgba(255, 255, 255, 0.12));
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  z-index: 10000;
  padding: 4px;
  backdrop-filter: blur(16px);
}

.space-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.12s ease;
  color: var(--canvas-text-primary, rgba(255, 255, 255, 0.85));
  font-size: 13px;
}

.space-option:hover {
  background: var(--canvas-bg-hover, rgba(255, 255, 255, 0.08));
}

.space-option.active {
  background: var(--canvas-primary-alpha, rgba(251, 191, 36, 0.15));
  color: var(--canvas-primary, #FBBF24);
}

.option-icon {
  font-size: 15px;
  flex-shrink: 0;
}

.option-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-role {
  font-size: 10px;
  padding: 1px 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: var(--canvas-text-secondary, rgba(255, 255, 255, 0.5));
}

.check-icon {
  flex-shrink: 0;
  color: var(--canvas-primary, #FBBF24);
}

/* 动画 */
.space-dropdown-enter-active,
.space-dropdown-leave-active {
  transition: all 0.15s ease;
}
.space-dropdown-enter-from,
.space-dropdown-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* 亮色主题 */
:root.canvas-theme-light .space-trigger {
  border-color: rgba(0, 0, 0, 0.1);
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.85);
}
:root.canvas-theme-light .space-trigger:hover {
  background: rgba(0, 0, 0, 0.07);
  border-color: rgba(0, 0, 0, 0.18);
}
:root.canvas-theme-light .space-dropdown {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}
:root.canvas-theme-light .space-option {
  color: rgba(0, 0, 0, 0.85);
}
:root.canvas-theme-light .space-option:hover {
  background: rgba(0, 0, 0, 0.05);
}
:root.canvas-theme-light .space-option.active {
  background: rgba(251, 191, 36, 0.12);
  color: #b8860b;
}
:root.canvas-theme-light .option-role {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.5);
}
:root.canvas-theme-light .check-icon {
  color: #b8860b;
}
</style>
