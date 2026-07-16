<script setup>
import { computed, ref, watch } from 'vue'
import {
  getProjectList,
  copyProjectToSpace,
  copyWorkflowToSpace,
  transferProjectSpace,
  transferWorkflowSpace
} from '@/api/canvas/project'
import { useTeamStore } from '@/stores/team'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  resourceType: { type: String, default: 'workflow' },
  resourceId: { type: String, default: '' },
  resourceName: { type: String, default: '' },
  workflowCount: { type: Number, default: 0 },
  currentSpaceType: { type: String, default: 'personal' },
  currentTeamId: { type: String, default: '' },
  currentProjectId: { type: String, default: '' },
  spaceFilter: { type: String, default: 'personal' },
  sourceRole: { type: String, default: '' },
  isDefaultProject: { type: Boolean, default: false },
  operation: { type: String, default: 'move' }
})

const emit = defineEmits(['update:modelValue', 'moved'])
const teamStore = useTeamStore()
const targetSpaceId = ref('')
const selectedProjectId = ref('')
const projects = ref([])
const loading = ref(false)
const loadingProjects = ref(false)
const error = ref('')

const isProject = computed(() => props.resourceType === 'project')
const isCopy = computed(() => props.operation === 'copy')
const allSpaces = computed(() => teamStore.getAllSpaces())
const availableSpaces = computed(() => allSpaces.value.filter(space => {
  const isCurrent = space.type === props.currentSpaceType &&
    (space.type !== 'team' || String(space.teamId) === String(props.currentTeamId))
  if (isProject.value && isCurrent) return false
  if (props.currentSpaceType === 'team' && props.sourceRole === 'member') return isCurrent
  return true
}))
const selectedSpace = computed(() => allSpaces.value.find(space => space.id === targetSpaceId.value) || null)

watch(() => props.modelValue, async visible => {
  if (!visible) return
  error.value = ''
  selectedProjectId.value = ''
  await teamStore.loadMyTeams()
  const currentSpaceId = props.currentSpaceType === 'team' ? `team-${props.currentTeamId}` : 'personal'
  targetSpaceId.value = isProject.value
    ? (availableSpaces.value[0]?.id || '')
    : (availableSpaces.value.some(space => space.id === currentSpaceId) ? currentSpaceId : availableSpaces.value[0]?.id || '')
  await loadTargetProjects()
})

watch(targetSpaceId, () => {
  if (props.modelValue) loadTargetProjects()
})

async function loadTargetProjects() {
  projects.value = []
  selectedProjectId.value = ''
  if (isProject.value || !selectedSpace.value) return
  loadingProjects.value = true
  try {
    const space = selectedSpace.value
    const result = await getProjectList({ spaceType: space.type, teamId: space.teamId })
    projects.value = (result.data || []).filter(project => (
      String(project.id) !== String(props.currentProjectId)
    ))
    const defaultProject = projects.value.find(project => project.is_default)
    selectedProjectId.value = String(defaultProject?.id || projects.value[0]?.id || '')
  } catch (e) {
    error.value = e.message || '加载目标项目失败'
  } finally {
    loadingProjects.value = false
  }
}

function close() {
  if (!loading.value) emit('update:modelValue', false)
}

async function handleMove() {
  const space = selectedSpace.value
  if (!space) {
    error.value = '请选择目标空间'
    return
  }
  if (!isProject.value && !selectedProjectId.value) {
    error.value = '请选择目标项目'
    return
  }

  loading.value = true
  error.value = ''
  const payload = {
    targetSpaceType: space.type,
    targetTeamId: space.teamId || null
  }
  try {
    const result = isProject.value
      ? (isCopy.value
          ? await copyProjectToSpace(props.resourceId, payload)
          : await transferProjectSpace(props.resourceId, payload))
      : (isCopy.value
          ? await copyWorkflowToSpace(props.resourceId, { ...payload, targetProjectId: selectedProjectId.value })
          : await transferWorkflowSpace(props.resourceId, { ...payload, targetProjectId: selectedProjectId.value }))
    emit('moved', result)
    emit('update:modelValue', false)
  } catch (e) {
    error.value = e.message || '移动失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="fixed inset-0 z-[9999] flex items-center justify-center" @click.self="close">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div class="relative w-full max-w-lg mx-4 bg-gray-900 rounded-2xl border border-white/10 shadow-2xl">
        <div class="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 class="text-lg font-semibold text-white">{{ isCopy ? '创建' : '移动' }}{{ isProject ? '项目' : '工作流' }}</h2>
          <button class="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10" @click="close" aria-label="关闭">×</button>
        </div>

        <div class="px-6 py-5 space-y-5">
          <div class="rounded-lg bg-white/5 p-3 text-sm text-white/70">
            <p class="font-medium text-white">{{ resourceName }}</p>
            <p v-if="isProject" class="mt-1 text-xs text-white/45">将连同 {{ workflowCount }} 个工作流{{ isCopy ? '创建副本' : '整体移动' }}；历史生成记录和资产不会迁移。</p>
            <p v-else class="mt-1 text-xs text-white/45">{{ isCopy ? '原工作流会保留。' : '' }}历史生成记录和资产不会迁移。</p>
          </div>

          <div>
            <label class="mb-2 block text-sm text-white/60">目标空间</label>
            <select v-model="targetSpaceId" class="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white">
              <option v-for="space in availableSpaces" :key="space.id" :value="space.id">
                {{ space.type === 'personal' ? '个人空间' : space.name + '（团队）' }}
              </option>
            </select>
            <p v-if="currentSpaceType === 'team' && sourceRole === 'member'" class="mt-2 text-xs text-amber-400">
              普通组员只能移动自己创建的工作流，且不能将团队内容移出团队空间。
            </p>
          </div>

          <div v-if="!isProject">
            <label class="mb-2 block text-sm text-white/60">目标项目</label>
            <div v-if="loadingProjects" class="py-5 text-center text-sm text-white/40">加载项目中…</div>
            <select v-else v-model="selectedProjectId" class="w-full rounded-lg border border-white/10 bg-gray-800 px-3 py-2.5 text-white">
              <option value="" disabled>请选择项目</option>
              <option v-for="project in projects" :key="project.id" :value="String(project.id)">
                {{ project.name }}{{ project.is_default ? '（默认）' : '' }}
              </option>
            </select>
          </div>

          <div v-if="isProject && isDefaultProject" class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            默认项目不能整体移动。
          </div>
          <div v-if="error" class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{{ error }}</div>

          <div class="flex justify-end gap-3">
            <button class="rounded-lg bg-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/15" :disabled="loading" @click="close">取消</button>
            <button
              class="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="loading || isDefaultProject || !selectedSpace || (!isProject && (!selectedProjectId || loadingProjects))"
              @click="handleMove"
            >{{ loading ? (isCopy ? '创建中…' : '移动中…') : (isCopy ? '创建副本' : '确认移动') }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
