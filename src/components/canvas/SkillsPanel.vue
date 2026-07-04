<template>
  <div class="skills-panel-backdrop" @click.self="emit('close')">
    <section class="skills-panel" role="dialog" aria-modal="true" aria-labelledby="skills-panel-title">
      <header class="skills-panel-header">
        <div>
          <p class="skills-panel-kicker">Canvas Skills</p>
          <h2 id="skills-panel-title">Agent API</h2>
        </div>
        <button class="skills-close-btn" type="button" title="关闭" @click="emit('close')">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div v-if="error" class="skills-alert">{{ error }}</div>

      <div class="skills-field">
        <span>Base URL</span>
        <code>{{ baseUrl }}</code>
      </div>

      <div class="skills-card">
        <div class="skills-card-head">
          <div>
            <span class="skills-label">API Key</span>
            <strong>{{ activeKey?.key_prefix || '未创建' }}</strong>
          </div>
          <button class="skills-link-btn" type="button" :disabled="loading" @click="loadSkills">刷新</button>
        </div>
        <div class="skills-key-row">
          <code>{{ visibleKey }}</code>
          <button class="skills-icon-btn" type="button" :disabled="!fullKey" @click="showKey = !showKey">
            {{ showKey ? '隐藏' : '显示' }}
          </button>
        </div>
        <div class="skills-actions">
          <button type="button" :disabled="!fullKey" @click="copyText(fullKey, 'API Key 已复制')">复制 Key</button>
          <button type="button" :disabled="!activeKey?.id || resetting" @click="confirmResetKey">重置 Key</button>
          <button type="button" :disabled="loading" @click="ensureKey">创建 Key</button>
        </div>
      </div>

      <div class="skills-card">
        <div class="skills-card-head">
          <div>
            <span class="skills-label">SKILL.md</span>
            <strong>安装内容</strong>
          </div>
          <RouterLink class="skills-docs-link" to="/docs" target="_blank">打开文档</RouterLink>
        </div>
        <pre class="skills-markdown-preview">{{ markdownPreview }}</pre>
        <div class="skills-actions">
          <button type="button" :disabled="!skillMarkdown" @click="copyText(skillMarkdown, 'SKILL.md 已复制')">复制 SKILL.md</button>
          <button type="button" :disabled="!packagePayload" @click="downloadPackage">下载 package.json</button>
        </div>
      </div>

      <footer class="skills-panel-footer">
        <span>{{ statusMessage || '使用当前租户域名调用 /api/skills/*，不要使用后端源站域名。' }}</span>
      </footer>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { createSkillKey, getSkillKeys, getSkillPackage, resetSkillKey } from '@/api/skills'

const emit = defineEmits(['close'])

const loading = ref(false)
const resetting = ref(false)
const keys = ref([])
const packageData = ref(null)
const error = ref('')
const statusMessage = ref('')
const showKey = ref(false)
const baseUrl = ref(window.location.origin)

const activeKey = computed(() => keys.value.find(key => key.status === 'active') || keys.value[0] || null)
const fullKey = computed(() => activeKey.value?.api_key || packageData.value?.api_key || '')
const visibleKey = computed(() => {
  if (!fullKey.value) return '创建或重置后会显示完整 API Key'
  if (showKey.value) return fullKey.value
  const prefix = activeKey.value?.key_prefix || fullKey.value.slice(0, 16)
  return `${prefix}••••••••••••••••`
})
const skillMarkdown = computed(() => packageData.value?.markdown || '')
const markdownPreview = computed(() => skillMarkdown.value || '正在加载 SKILL.md...')
const packagePayload = computed(() => packageData.value?.package || null)

function normalizeKeyResponse(data) {
  if (Array.isArray(data?.keys)) return data.keys
  if (Array.isArray(data?.data)) return data.data
  if (data?.key) return [data.key]
  return []
}

async function loadSkills() {
  loading.value = true
  error.value = ''
  try {
    const [keysResult, packageResult] = await Promise.all([
      getSkillKeys(),
      getSkillPackage().catch(() => null)
    ])
    keys.value = normalizeKeyResponse(keysResult)
    packageData.value = packageResult
    if (!activeKey.value) {
      await ensureKey()
    }
  } catch (err) {
    error.value = err.message || '加载 Skills 失败'
  } finally {
    loading.value = false
  }
}

async function ensureKey() {
  if (activeKey.value?.api_key) return
  loading.value = true
  error.value = ''
  try {
    const result = await createSkillKey({ name: 'Canvas Skill' })
    keys.value = normalizeKeyResponse(result)
    if (!keys.value.length && result?.key) keys.value = [result.key]
    packageData.value = await getSkillPackage()
    showKey.value = true
    statusMessage.value = 'API Key 已创建'
  } catch (err) {
    error.value = err.message || '创建 API Key 失败'
  } finally {
    loading.value = false
  }
}

async function confirmResetKey() {
  if (!activeKey.value?.id) return
  if (!window.confirm('重置后旧 API Key 会失效，继续？')) return
  resetting.value = true
  error.value = ''
  try {
    const result = await resetSkillKey(activeKey.value.id)
    keys.value = normalizeKeyResponse(result)
    if (!keys.value.length && result?.key) keys.value = [result.key]
    packageData.value = await getSkillPackage()
    showKey.value = true
    statusMessage.value = 'API Key 已重置'
  } catch (err) {
    error.value = err.message || '重置 API Key 失败'
  } finally {
    resetting.value = false
  }
}

async function copyText(text, message) {
  if (!text) return
  await navigator.clipboard.writeText(text)
  statusMessage.value = message
}

function downloadPackage() {
  if (!packagePayload.value) return
  const body = JSON.stringify(packagePayload.value, null, 2)
  const blob = new Blob([body], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'banana-canvas-skill.package.json'
  link.click()
  URL.revokeObjectURL(url)
}

onMounted(loadSkills)
</script>

<style scoped>
.skills-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9300;
  display: flex;
  justify-content: flex-end;
  padding: 72px 18px 18px;
  background: rgba(0, 0, 0, 0.18);
}

.skills-panel {
  width: min(420px, calc(100vw - 32px));
  max-height: calc(100vh - 90px);
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  background: rgba(16, 18, 24, 0.96);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
  color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(22px);
}

.skills-panel-header,
.skills-card-head,
.skills-actions,
.skills-panel-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.skills-panel-header {
  padding: 18px 18px 12px;
}

.skills-panel-kicker,
.skills-label {
  margin: 0 0 4px;
  color: rgba(255, 255, 255, 0.52);
  font-size: 12px;
  text-transform: uppercase;
}

.skills-panel h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.skills-close-btn,
.skills-icon-btn,
.skills-link-btn,
.skills-actions button,
.skills-docs-link {
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.86);
  cursor: pointer;
  font-size: 12px;
  text-decoration: none;
}

.skills-close-btn {
  width: 32px;
  height: 32px;
  font-size: 22px;
  line-height: 1;
}

.skills-field,
.skills-card {
  margin: 0 18px 14px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.055);
}

.skills-field {
  display: grid;
  gap: 6px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
}

.skills-field code,
.skills-key-row code {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skills-card-head strong {
  display: block;
  font-size: 14px;
}

.skills-key-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin: 12px 0;
  padding: 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.22);
}

.skills-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.skills-actions button,
.skills-docs-link,
.skills-link-btn,
.skills-icon-btn {
  padding: 8px 10px;
}

.skills-actions button:disabled,
.skills-icon-btn:disabled,
.skills-link-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.skills-markdown-preview {
  max-height: 190px;
  overflow: auto;
  margin: 12px 0;
  padding: 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.26);
  color: rgba(255, 255, 255, 0.76);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.skills-alert {
  margin: 0 18px 14px;
  padding: 10px 12px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 8px;
  background: rgba(127, 29, 29, 0.35);
  color: #fecaca;
  font-size: 13px;
}

.skills-panel-footer {
  padding: 0 18px 18px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
}

@media (max-width: 640px) {
  .skills-panel-backdrop {
    padding: 64px 12px 12px;
  }
}
</style>
