<script setup>
/**
 * SpaceSwitcher.vue - 空间切换器组件（下拉菜单版）
 * 用于在历史记录、资产、工作流面板顶部切换空间筛选
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useTeamStore } from '@/stores/team'

const props = defineProps({
  // 当前选中的空间: 'current' | 'personal' | 'team-xxx' | 'all'
  modelValue: {
    type: String,
    default: 'current'
  },
  // 是否显示"全部"选项
  showAll: {
    type: Boolean,
    default: true
  },
  // 紧凑模式（用于小空间）
  compact: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const teamStore = useTeamStore()

// 下拉菜单是否展开
const isOpen = ref(false)
const dropdownRef = ref(null)

// 当前选中的空间
const selectedSpace = computed({
  get: () => props.modelValue,
  set: (val) => {
    emit('update:modelValue', val)
    emit('change', val)
  }
})

// 构建可选的空间列表
const spaces = computed(() => {
  const list = []
  
  // 当前空间（跟随全局）
  list.push({
    id: 'current',
    name: teamStore.currentSpaceLabel.value,
    icon: teamStore.currentSpaceIcon.value,
    type: 'current',
    label: '当前'
  })
  
  // 个人空间
  list.push({
    id: 'personal',
    name: '个人空间',
    icon: '👤',
    type: 'personal'
  })
  
  // 团队空间
  teamStore.myTeams.value.forEach(team => {
    list.push({
      id: `team-${team.id}`,
      teamId: team.id,
      name: team.name,
      icon: '👥',
      type: 'team',
      role: team.my_role,
      memberCount: team.member_count
    })
  })
  
  // 全部
  if (props.showAll) {
    list.push({
      id: 'all',
      name: '全部',
      icon: '◈',
      type: 'all'
    })
  }
  
  return list
})

// 获取角色显示文本
function getRoleText(role) {
  const roleMap = {
    owner: '所有者',
    admin: '管理员',
    member: '成员'
  }
  return roleMap[role] || role
}

// 切换空间
function selectSpace(spaceId) {
  selectedSpace.value = spaceId
  isOpen.value = false
}

// 获取当前选中空间的显示信息
const selectedSpaceInfo = computed(() => {
  return spaces.value.find(s => s.id === selectedSpace.value) || spaces.value[0]
})

// 切换下拉菜单
function toggleDropdown() {
  isOpen.value = !isOpen.value
}

// 点击外部关闭
function handleClickOutside(event) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div :class="['space-switcher-dropdown', { compact }]" ref="dropdownRef">
    <div class="switcher-label">空间:</div>
    <div class="dropdown-wrapper">
      <button class="dropdown-trigger" @click="toggleDropdown">
        <span class="space-icon">{{ selectedSpaceInfo.icon }}</span>
        <span class="space-name">{{ selectedSpaceInfo.label || selectedSpaceInfo.name }}</span>
        <span class="dropdown-arrow" :class="{ open: isOpen }">▾</span>
      </button>
      
      <transition name="dropdown-fade">
        <div v-if="isOpen" class="dropdown-menu">
          <div
            v-for="space in spaces"
            :key="space.id"
            :class="['dropdown-item', { active: selectedSpace === space.id }]"
            @click="selectSpace(space.id)"
          >
            <span class="space-icon">{{ space.icon }}</span>
            <span class="space-name">{{ space.label || space.name }}</span>
            <span 
              v-if="space.type === 'team' && space.role" 
              class="role-badge"
            >
              {{ getRoleText(space.role) }}
            </span>
            <span 
              v-if="space.type === 'team' && space.memberCount" 
              class="member-count"
            >
              {{ space.memberCount }}人
            </span>
            <span v-if="selectedSpace === space.id" class="check-mark">✓</span>
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.space-switcher-dropdown {
  display: flex;
  align-items: center;
  gap: 8px;
}

.space-switcher-dropdown.compact {
  gap: 4px;
}

.switcher-label {
  font-size: 12px;
  color: var(--canvas-text-secondary, rgba(255, 255, 255, 0.5));
  white-space: nowrap;
}

.dropdown-wrapper {
  position: relative;
}

.dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--canvas-border, rgba(255, 255, 255, 0.1));
  background: var(--canvas-bg-secondary, rgba(255, 255, 255, 0.05));
  color: var(--canvas-text-primary, rgba(255, 255, 255, 0.9));
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  min-width: 120px;
}

.dropdown-trigger:hover {
  background: var(--canvas-bg-hover, rgba(255, 255, 255, 0.08));
  border-color: var(--canvas-border-hover, rgba(255, 255, 255, 0.2));
}

.dropdown-arrow {
  margin-left: auto;
  font-size: 10px;
  opacity: 0.6;
  transition: transform 0.2s ease;
}

.dropdown-arrow.open {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 180px;
  max-height: 280px;
  overflow-y: auto;
  background: var(--canvas-bg-elevated, rgba(30, 30, 30, 0.98));
  border: 1px solid var(--canvas-border, rgba(255, 255, 255, 0.1));
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  padding: 4px;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--canvas-text-primary, rgba(255, 255, 255, 0.85));
  font-size: 13px;
}

.dropdown-item:hover {
  background: var(--canvas-bg-hover, rgba(255, 255, 255, 0.08));
}

.dropdown-item.active {
  background: var(--canvas-primary-alpha, rgba(251, 191, 36, 0.15));
  color: var(--canvas-primary, #FBBF24);
}

.space-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.space-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: var(--canvas-text-secondary, rgba(255, 255, 255, 0.6));
}

.member-count {
  font-size: 10px;
  opacity: 0.6;
}

.check-mark {
  font-size: 12px;
  color: var(--canvas-primary, #FBBF24);
  margin-left: auto;
}

/* 动画 */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.15s ease;
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* 紧凑模式 */
.compact .dropdown-trigger {
  padding: 4px 8px;
  font-size: 11px;
  min-width: 100px;
}

.compact .switcher-label {
  font-size: 11px;
}

.compact .space-icon {
  font-size: 12px;
}

/* 亮色主题适配 */
:root.canvas-theme-light .switcher-label {
  color: rgba(0, 0, 0, 0.5);
}

:root.canvas-theme-light .dropdown-trigger {
  border-color: rgba(0, 0, 0, 0.12);
  background: rgba(0, 0, 0, 0.04);
  color: rgba(0, 0, 0, 0.85);
}

:root.canvas-theme-light .dropdown-trigger:hover {
  background: rgba(0, 0, 0, 0.06);
  border-color: rgba(0, 0, 0, 0.2);
}

:root.canvas-theme-light .dropdown-menu {
  background: rgba(255, 255, 255, 0.98);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

:root.canvas-theme-light .dropdown-item {
  color: rgba(0, 0, 0, 0.85);
}

:root.canvas-theme-light .dropdown-item:hover {
  background: rgba(0, 0, 0, 0.05);
}

:root.canvas-theme-light .dropdown-item.active {
  background: rgba(251, 191, 36, 0.12);
  color: #b8860b;
}

:root.canvas-theme-light .role-badge {
  background: rgba(0, 0, 0, 0.08);
  color: rgba(0, 0, 0, 0.6);
}

:root.canvas-theme-light .check-mark {
  color: #b8860b;
}
</style>
