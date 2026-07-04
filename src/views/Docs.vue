<template>
  <main class="docs-layout">
    <aside class="docs-sidebar" aria-label="Skills 文档导航">
      <div class="docs-sidebar-inner">
        <RouterLink class="docs-return" to="/canvas">返回画布</RouterLink>
        <p class="docs-kicker">Skills Wiki</p>
        <h1>Banana Canvas Skills 知识库</h1>
        <p class="docs-sidebar-summary">
          给 Codex、Claude Code、WorkBuddy、OpenClaw、Hermes 以及其他支持 Skills 调用的智能体使用。
        </p>

        <nav class="docs-toc" aria-label="快速跳转">
          <span class="docs-toc-title">快速跳转</span>
          <a v-for="section in docsSections" :key="section.id" :href="`#${section.id}`">
            {{ section.title }}
          </a>
        </nav>
      </div>
    </aside>

    <article class="docs-content">
      <section id="quick-start" class="docs-section">
        <p class="section-label">Quick Start</p>
        <h2>快速开始</h2>
        <p>
          最省事的安装方式是在画布右上角打开 Skills，创建 API Key，然后复制“安装提示词”给你的智能体。
          智能体安装后应先调用模型列表接口验证 key，再根据用户需求选择图片、视频、上传或写回流程。
        </p>
        <ol class="docs-steps">
          <li>打开画布右上角 Skills。</li>
          <li>复制安装提示词，交给 Codex、Claude Code、WorkBuddy、OpenClaw、Hermes 或其他支持 Skills 调用的智能体。</li>
          <li>智能体只调用当前站点下的 <code>/api/skills/*</code>，请求头使用 <code>Authorization: Bearer bsk_...</code>。</li>
          <li>用户提供本地图片或视频时，先走 COS CDN 直传，再把返回的 URL 传给生成接口。</li>
        </ol>
        <CodeBlock
          id="quick-start-prompt"
          title="给智能体的一次性提示"
          :code="codeBlocks.quickStartPrompt"
          :copied="copiedKey === 'quickStartPrompt'"
          @copy="copyCode('quickStartPrompt')"
        />
      </section>

      <section id="agent-install" class="docs-section">
        <p class="section-label">Install</p>
        <h2>安装 Skill</h2>
        <p>
          推荐让智能体创建名为 <code>banana-canvas-skills</code> 的 Skill，并把站点域名、API Key、可用端点、上传规则和轮询规则写进 Skill 正文。
          如果运行环境不支持持久化 Skill，也可以直接按同样规则执行一次性指令。
        </p>
        <div class="docs-callout">
          安装后第一步必须调用 <code>GET /api/skills/models</code>。如果这个请求失败，不要继续生成任务，应要求用户重新复制或重置 API Key。
        </div>
        <CodeBlock
          id="install-env"
          title="环境变量方式"
          :code="codeBlocks.envExample"
          :copied="copiedKey === 'envExample'"
          @copy="copyCode('envExample')"
        />
      </section>

      <section id="auth-domain" class="docs-section">
        <p class="section-label">Auth</p>
        <h2>认证与域名</h2>
        <p>
          Skills API 使用用户在画布中创建的 <code>bsk_</code> key。智能体不需要浏览器会话，也不需要额外管理后台配置。
          所有请求都应发往当前 docs 所在站点的 HTTPS 域名，并保持 <code>Content-Type: application/json</code>。
        </p>
        <CodeBlock
          id="auth-request"
          title="基础请求格式"
          :code="codeBlocks.authExample"
          :copied="copiedKey === 'authExample'"
          @copy="copyCode('authExample')"
        />
      </section>

      <section id="local-upload" class="docs-section">
        <p class="section-label">Upload</p>
        <h2>本地文件上传</h2>
        <p>
          图片生成和视频生成接口接收 URL，不接收本地文件路径或原始字节。用户上传本地图片或视频时，智能体应先申请一次性上传地址，
          把文件直接 PUT 到腾讯云 COS CDN 存储，再把返回的 <code>asset_url</code> 用作图片 <code>input</code>、视频 <code>source_assets</code> 或 <code>reference_assets</code>。
        </p>
        <ol class="docs-steps">
          <li>调用 <code>POST /api/skills/uploads/presign</code>，传入文件名、MIME、字节大小和媒体类型。</li>
          <li>使用返回的 <code>upload_url</code>、<code>method</code>、<code>headers</code> 直接上传文件字节。</li>
          <li>上传成功后，只把 <code>asset_url</code> 传给模型接口，不要询问或暴露对象存储 AK/SK。</li>
        </ol>
        <CodeBlock
          id="presign-upload"
          title="申请并使用 COS CDN 直传地址"
          :code="codeBlocks.presignUploadExample"
          :copied="copiedKey === 'presignUploadExample'"
          @copy="copyCode('presignUploadExample')"
        />
      </section>

      <section id="models" class="docs-section">
        <p class="section-label">Models</p>
        <h2>/api/skills/models</h2>
        <p>
          模型列表返回当前用户可用的图片和视频模型。智能体应优先使用返回的 <code>name</code> 或 <code>id</code>，
          并避开不可用或需要额外套餐的模型。
        </p>
        <CodeBlock
          id="models-request"
          title="读取可用模型"
          :code="codeBlocks.modelsExample"
          :copied="copiedKey === 'modelsExample'"
          @copy="copyCode('modelsExample')"
        />
      </section>

      <section id="images" class="docs-section">
        <p class="section-label">Images</p>
        <h2>/api/skills/generate</h2>
        <p>
          图片接口同时支持文生图和图生图。文生图只传 <code>prompt</code>；图生图把一个或多个可访问图片 URL 放入 <code>input</code>。
          常用参数包括 <code>model</code>、<code>prompt</code>、<code>ratio</code>、<code>size</code>、<code>n</code> 和可选 <code>canvas_writeback</code>。
        </p>
        <CodeBlock
          id="image-generate"
          title="图生图请求"
          :code="codeBlocks.imageExample"
          :copied="copiedKey === 'imageExample'"
          @copy="copyCode('imageExample')"
        />
      </section>

      <section id="videos" class="docs-section">
        <p class="section-label">Videos</p>
        <h2>/api/skills/videos/generate</h2>
        <p>
          视频接口用于文生视频、图生视频、视频参考和多素材工作流。图片或视频素材都必须是可访问 URL；
          本地素材先通过上传流程转换成 <code>asset_url</code>，再放进 <code>source_assets</code> 或 <code>reference_assets</code>。
        </p>
        <CodeBlock
          id="video-generate"
          title="视频生成请求"
          :code="codeBlocks.videoExample"
          :copied="copiedKey === 'videoExample'"
          @copy="copyCode('videoExample')"
        />
      </section>

      <section id="tasks" class="docs-section">
        <p class="section-label">Tasks</p>
        <h2>/api/skills/tasks</h2>
        <p>
          生成接口通常返回任务 ID。智能体应轮询 <code>GET /api/skills/tasks/:taskId</code>，直到状态进入
          <code>completed</code>、<code>failed</code>、<code>timeout</code> 等终态，再把结果 URL 或错误说明返回给用户。
        </p>
        <CodeBlock
          id="poll-task"
          title="轮询任务状态"
          :code="codeBlocks.pollTaskExample"
          :copied="copiedKey === 'pollTaskExample'"
          @copy="copyCode('pollTaskExample')"
        />
      </section>

      <section id="writeback" class="docs-section">
        <p class="section-label">Canvas</p>
        <h2>canvas_writeback</h2>
        <p>
          当用户明确要求把结果写回已有画布节点时，生成请求可携带 <code>canvas_writeback</code>。
          目前推荐 <code>replace_output</code>，它只替换目标节点的输出，不改变其他画布结构。
        </p>
        <CodeBlock
          id="writeback-example"
          title="写回已有画布节点"
          :code="codeBlocks.writebackExample"
          :copied="copiedKey === 'writebackExample'"
          @copy="copyCode('writebackExample')"
        />
      </section>

      <section id="billing" class="docs-section">
        <p class="section-label">Billing</p>
        <h2>计费与空间</h2>
        <p>
          Skills API 不绕过积分、团队空间或模型套餐规则。个人空间可省略空间参数；团队空间任务应传入 <code>space_type: "team"</code>
          和对应 <code>team_id</code>。如果接口返回套餐或余额错误，智能体应停止重试并把原因告诉用户。
        </p>
        <CodeBlock
          id="space-context"
          title="团队空间上下文"
          :code="codeBlocks.spaceExample"
          :copied="copiedKey === 'spaceExample'"
          @copy="copyCode('spaceExample')"
        />
      </section>

      <section id="errors" class="docs-section">
        <p class="section-label">Errors</p>
        <h2>错误处理</h2>
        <p>
          智能体应把错误码翻译成用户能执行的下一步。认证、模型套餐、积分、权限、任务不存在这几类错误不要盲目重试。
        </p>
        <div class="docs-table">
          <span>invalid_skill_key</span><p>API Key 缺失、格式错误或不匹配。让用户回到画布 Skills 面板复制新 key。</p>
          <span>skill_key_revoked</span><p>API Key 已重置或撤销。停止当前请求，要求用户重新复制。</p>
          <span>model_package_required</span><p>当前模型不可用。重新读取模型列表，选择可用模型，或提示用户升级/分配权限。</p>
          <span>insufficient_points</span><p>积分不足。停止生成并提示用户充值或切换可用空间。</p>
          <span>403</span><p>模型、空间或画布写回权限不足。不要改用其他认证方式。</p>
          <span>404</span><p>任务、工作流或节点不存在。确认 task_id、workflow_id、node_id 后再重试。</p>
        </div>
        <CodeBlock
          id="error-handling"
          title="错误处理策略"
          :code="codeBlocks.errorExample"
          :copied="copiedKey === 'errorExample'"
          @copy="copyCode('errorExample')"
        />
      </section>

      <section id="complete-example" class="docs-section">
        <p class="section-label">Example</p>
        <h2>完整 Agent 示例</h2>
        <p>
          下面的示例展示一个智能体如何读取模型、上传本地文件、提交图生图任务并轮询完成。实际运行时请把 API Key 放入环境变量或智能体的安全密钥配置。
        </p>
        <CodeBlock
          id="complete-agent-example"
          title="Node.js 端到端示例"
          :code="codeBlocks.completeAgentExample"
          :copied="copiedKey === 'completeAgentExample'"
          @copy="copyCode('completeAgentExample')"
        />
      </section>
    </article>
  </main>
</template>

<script setup>
import { computed, defineComponent, h, ref } from 'vue'
import { RouterLink } from 'vue-router'

const CodeBlock = defineComponent({
  name: 'CodeBlock',
  props: {
    id: { type: String, required: true },
    title: { type: String, required: true },
    code: { type: String, required: true },
    copied: { type: Boolean, default: false }
  },
  emits: ['copy'],
  setup(props, { emit }) {
    return () => h('div', { class: 'code-panel' }, [
      h('div', { class: 'code-panel-head' }, [
        h('span', props.title),
        h('button', {
          class: 'copy-code-btn',
          type: 'button',
          'aria-label': `复制 ${props.title}`,
          onClick: () => emit('copy')
        }, props.copied ? '已复制' : '复制')
      ]),
      h('pre', { id: props.id }, [h('code', props.code)])
    ])
  }
})

const docsSections = [
  { id: 'quick-start', title: '快速开始' },
  { id: 'agent-install', title: '安装 Skill' },
  { id: 'auth-domain', title: '认证与域名' },
  { id: 'local-upload', title: '本地文件上传' },
  { id: 'models', title: '模型列表' },
  { id: 'images', title: '图片生成' },
  { id: 'videos', title: '视频生成' },
  { id: 'tasks', title: '任务轮询' },
  { id: 'writeback', title: '画布写回' },
  { id: 'billing', title: '计费与空间' },
  { id: 'errors', title: '错误处理' },
  { id: 'complete-example', title: '完整示例' }
]

const copiedKey = ref('')
let copyTimer = 0

function normalizeHttpsOrigin(value) {
  try {
    const url = new URL(value)
    return `https://${url.host}`
  } catch {
    return 'https://domain.example.com'
  }
}

const baseUrl = normalizeHttpsOrigin(window.location.origin)

const quickStartPrompt = `请帮我安装 Banana Canvas Skills。

适用对象：Codex、Claude Code、WorkBuddy、OpenClaw、Hermes 以及其他支持 Skills 调用的智能体。

配置：
- Base URL: ${baseUrl}
- Authorization: Bearer bsk_your_key
- 只调用 ${baseUrl}/api/skills/*。

安装后先调用 GET ${baseUrl}/api/skills/models 验证 key 和模型列表。
如果用户提供本地图片或视频，先调用 POST ${baseUrl}/api/skills/uploads/presign，把文件 PUT 到 upload_url，再把 asset_url 传给生成接口。`

const envExample = `BANANA_SKILLS_BASE_URL=${baseUrl}
BANANA_SKILLS_API_KEY=bsk_your_key`

const authExample = `curl -sS ${baseUrl}/api/skills/models \\
  -H "Authorization: Bearer $BANANA_SKILLS_API_KEY" \\
  -H "Content-Type: application/json"`

const modelsExample = `GET ${baseUrl}/api/skills/models

响应中优先使用：
- image_models[].name 或 image_models[].id
- video_models[].name 或 video_models[].id
- usable / disabled / accessMessage 用来判断当前模型是否能用`

const presignUploadExample = `POST ${baseUrl}/api/skills/uploads/presign
Authorization: Bearer bsk_your_key
Content-Type: application/json

{
  "filename": "reference.png",
  "content_type": "image/png",
  "size": 348112,
  "media_type": "image"
}

返回：
{
  "upload": {
    "method": "PUT",
    "upload_url": "https://cos-upload.example.com/...",
    "headers": { "Content-Type": "image/png" },
    "asset_url": "https://cdn.example.com/skills/asset.png"
  }
}

下一步：
PUT upload_url
headers = upload.headers
body = 文件字节

上传成功后，将 asset_url 放进 input、source_assets 或 reference_assets。`

const imageExample = `POST ${baseUrl}/api/skills/generate
Authorization: Bearer bsk_your_key
Content-Type: application/json

{
  "model": "model-key-from-models",
  "prompt": "把参考图改成干净的商业产品摄影，保留主体结构",
  "ratio": "1:1",
  "size": "2K",
  "n": 1,
  "input": [
    "https://cdn.example.com/skills/reference.png"
  ]
}`

const videoExample = `POST ${baseUrl}/api/skills/videos/generate
Authorization: Bearer bsk_your_key
Content-Type: application/json

{
  "model": "video-model-key-from-models",
  "prompt": "slow camera push in, soft studio light",
  "duration": 5,
  "resolution": "720p",
  "source_assets": [
    "https://cdn.example.com/skills/source-image.png"
  ],
  "reference_assets": [
    "https://cdn.example.com/skills/reference-video.mp4"
  ]
}`

const pollTaskExample = `async function pollTask(taskId) {
  while (true) {
    const task = await request('/api/skills/tasks/' + encodeURIComponent(taskId))
    if (['completed', 'failed', 'timeout', 'cancelled'].includes(task.status)) {
      return task
    }
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
}`

const writebackExample = `POST ${baseUrl}/api/skills/generate
Authorization: Bearer bsk_your_key
Content-Type: application/json

{
  "model": "model-key-from-models",
  "prompt": "生成并替换这个画布节点的输出",
  "canvas_writeback": {
    "workflow_id": "existing-workflow-id",
    "node_id": "existing-node-id",
    "mode": "replace_output"
  }
}`

const spaceExample = `{
  "model": "model-key-from-models",
  "prompt": "team workspace generation",
  "space_type": "team",
  "team_id": 123
}`

const errorExample = `function explainSkillError(error) {
  const code = error.code || error.error || String(error.status || '')
  if (code === 'invalid_skill_key' || code === 'skill_key_revoked') {
    return '请回到画布 Skills 面板复制或重置 API Key。'
  }
  if (code === 'model_package_required') {
    return '当前模型不可用，请重新读取模型列表并选择 usable 的模型。'
  }
  if (code === 'insufficient_points' || code === '402') {
    return '积分不足，请充值或切换可用空间。'
  }
  if (code === '403') return '权限不足，请确认模型、空间或画布节点权限。'
  if (code === '404') return '任务、工作流或节点不存在，请确认 ID。'
  return error.message || 'Skills 请求失败'
}`

const completeAgentExample = `import { readFile } from 'node:fs/promises'

const baseUrl = process.env.BANANA_SKILLS_BASE_URL || '${baseUrl}'
const apiKey = process.env.BANANA_SKILLS_API_KEY
if (!apiKey) throw new Error('Set BANANA_SKILLS_API_KEY first')

async function request(path, options = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(body.message || body.error || 'request_failed'), body)
  return body
}

async function presignUpload({ filename, contentType, size, mediaType }) {
  const result = await request('/api/skills/uploads/presign', {
    method: 'POST',
    body: JSON.stringify({
      filename,
      content_type: contentType,
      size,
      media_type: mediaType
    })
  })
  return result.upload
}

async function uploadFileToCOS(bytes, upload) {
  const response = await fetch(upload.upload_url, {
    method: upload.method || 'PUT',
    headers: upload.headers || {},
    body: bytes
  })
  if (!response.ok) throw new Error('cos_upload_failed: ' + response.status)
  return upload.asset_url
}

async function pollTask(taskId) {
  while (true) {
    const task = await request('/api/skills/tasks/' + encodeURIComponent(taskId))
    if (['completed', 'failed', 'timeout', 'cancelled'].includes(task.status)) return task
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
}

async function generateFromLocalImage(pathname) {
  const bytes = await readFile(pathname)
  const upload = await presignUpload({
    filename: 'reference.png',
    contentType: 'image/png',
    size: bytes.byteLength,
    mediaType: 'image'
  })
  const assetUrl = await uploadFileToCOS(bytes, upload)
  const models = await request('/api/skills/models')
  const model = models.image_models?.find(item => item.usable !== false)?.name || 'model-key'
  const task = await request('/api/skills/generate', {
    method: 'POST',
    body: JSON.stringify({
      model,
      prompt: 'Edit this image into a polished product photo',
      input: [assetUrl],
      ratio: '1:1',
      size: '2K'
    })
  })
  return pollTask(task.task_id || task.taskId || task.id)
}`

const codeBlocks = computed(() => ({
  quickStartPrompt,
  envExample,
  authExample,
  modelsExample,
  presignUploadExample,
  imageExample,
  videoExample,
  pollTaskExample,
  writebackExample,
  spaceExample,
  errorExample,
  completeAgentExample
}))

async function copyCode(key) {
  const text = codeBlocks.value[key]
  if (!text) return
  await navigator.clipboard.writeText(text)
  copiedKey.value = key
  window.clearTimeout(copyTimer)
  copyTimer = window.setTimeout(() => {
    if (copiedKey.value === key) copiedKey.value = ''
  }, 1600)
}
</script>

<style scoped>
.docs-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 312px minmax(0, 1fr);
  background: #080a0f;
  color: #f8fafc;
}

.docs-sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  border-right: 1px solid rgba(148, 163, 184, 0.16);
  background: #0d1117;
}

.docs-sidebar-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  overflow: auto;
}

.docs-return {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  width: fit-content;
  padding: 0 12px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
}

.docs-return:hover {
  border-color: rgba(45, 212, 191, 0.45);
  background: rgba(45, 212, 191, 0.1);
}

.docs-kicker,
.section-label,
.docs-toc-title {
  margin: 0;
  color: #5eead4;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.docs-sidebar h1 {
  margin: 0;
  color: #f8fafc;
  font-size: 28px;
  line-height: 1.18;
}

.docs-sidebar-summary {
  margin: 0;
  color: #cbd5e1;
  font-size: 14px;
  line-height: 1.75;
}

.docs-toc {
  display: grid;
  gap: 4px;
  padding-top: 8px;
}

.docs-toc a {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  color: #cbd5e1;
  font-size: 14px;
  text-decoration: none;
}

.docs-toc a:hover {
  background: rgba(45, 212, 191, 0.12);
  color: #f8fafc;
}

.docs-content {
  width: min(980px, 100%);
  padding: 56px 36px 96px;
}

.docs-section {
  scroll-margin-top: 24px;
  padding: 34px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.14);
}

.docs-section:first-child {
  border-top: 0;
  padding-top: 0;
}

.docs-section h2 {
  margin: 6px 0 12px;
  color: #f8fafc;
  font-size: 28px;
  line-height: 1.24;
}

.docs-section p,
.docs-steps {
  color: #cbd5e1;
  font-size: 15px;
  line-height: 1.8;
}

.docs-section p {
  margin: 0 0 14px;
}

.docs-steps {
  margin: 12px 0 18px;
  padding-left: 22px;
}

.docs-steps li + li {
  margin-top: 6px;
}

.docs-section code,
.code-panel pre {
  font-family: 'SF Mono', Monaco, Consolas, monospace;
}

.docs-section code {
  color: #7dd3fc;
}

.docs-callout {
  margin: 16px 0;
  padding: 14px 16px;
  border-left: 4px solid #14b8a6;
  border-radius: 8px;
  background: rgba(20, 184, 166, 0.12);
  color: #d1fae5;
  line-height: 1.7;
}

.code-panel {
  margin-top: 18px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  background: #0f172a;
  overflow: hidden;
}

.code-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  font-weight: 700;
}

.copy-code-btn {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.copy-code-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}

.code-panel pre {
  overflow: auto;
  margin: 0;
  padding: 16px;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre;
}

.code-panel code {
  color: #e5e7eb;
}

.docs-table {
  display: grid;
  grid-template-columns: minmax(190px, max-content) minmax(0, 1fr);
  gap: 10px 18px;
  margin: 18px 0 8px;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: #0f172a;
}

.docs-table span {
  color: #5eead4;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
  font-size: 13px;
  font-weight: 800;
}

.docs-table p {
  margin: 0;
}

@media (max-width: 900px) {
  .docs-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .docs-sidebar {
    position: relative;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  }

  .docs-sidebar-inner {
    padding: 18px;
  }

  .docs-sidebar h1 {
    font-size: 24px;
  }

  .docs-toc {
    display: flex;
    gap: 8px;
    overflow: auto;
    padding-bottom: 4px;
  }

  .docs-toc-title {
    flex: 0 0 auto;
    align-self: center;
  }

  .docs-toc a {
    flex: 0 0 auto;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(255, 255, 255, 0.04);
  }

  .docs-content {
    padding: 28px 18px 64px;
  }

  .docs-section h2 {
    font-size: 24px;
  }

  .docs-table {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
}
</style>
