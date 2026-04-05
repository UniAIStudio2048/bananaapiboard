<template>
  <div>
    <!-- 标题行 -->
    <div class="flex items-center justify-between mb-1">
      <h2 class="text-xl font-bold text-white">{{ communityStore.sectionNames.templates }}</h2>
    </div>
    <div class="flex items-center justify-between mb-4">
      <span class="text-sm text-neutral-400">{{ communityStore.sectionNames.templates_subtitle }}</span>
      <router-link to="/community/templates" class="text-sm text-neutral-400 hover:text-white transition-colors">
        查看全部 &gt;
      </router-link>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
      <div v-for="i in 6" :key="i" class="aspect-video rounded-xl bg-neutral-800 animate-pulse" />
    </div>

    <!-- 模板网格 -->
    <div v-else-if="templates.length" class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
      <div v-for="tpl in templates" :key="tpl.id"
           class="group cursor-pointer"
           @click="handlePreview(tpl)">
        <div class="relative aspect-video rounded-xl overflow-hidden bg-neutral-800">
          <img v-if="tpl.cover_url" :src="tpl.cover_url" :alt="tpl.name"
               class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          <div v-else class="w-full h-full flex items-center justify-center text-neutral-600">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <!-- Hover overlay -->
          <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span class="px-3 py-1.5 bg-white text-black text-xs font-medium rounded-full">
              预览工作流
            </span>
          </div>
        </div>
        <p class="mt-1.5 text-sm text-neutral-300 truncate">{{ tpl.name }}</p>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="text-center py-10 text-neutral-600 text-sm">
      暂无模板
    </div>

    <!-- WorkflowPreviewModal -->
    <WorkflowPreviewModal
      v-model="showPreview"
      :workflow-id="selectedTemplate?.workflow_id || ''"
      :template-id="selectedTemplate?.id || 0"
      :title="selectedTemplate?.name || ''"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getTemplates } from '@/api/community'
import { useCommunityStore } from '@/stores/community'
import WorkflowPreviewModal from './WorkflowPreviewModal.vue'

const communityStore = useCommunityStore()

const templates = ref([])
const loading = ref(true)
const showPreview = ref(false)
const selectedTemplate = ref(null)

async function loadTemplates() {
  loading.value = true
  try {
    const res = await getTemplates({ page: 1, pageSize: 12 })
    templates.value = res.data?.templates || []
  } catch (e) {
    console.error('[TemplateGallery] 加载模板失败:', e)
  } finally {
    loading.value = false
  }
}

function handlePreview(tpl) {
  if (!communityStore.requireLogin()) return
  selectedTemplate.value = tpl
  showPreview.value = true
}

onMounted(loadTemplates)
</script>
