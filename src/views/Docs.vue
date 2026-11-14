<template>
  <main class="docs-layout">
    <aside class="docs-sidebar" :aria-label="translateUi('uiMessages.m94785087d77b')">
      <div class="docs-sidebar-inner">
        <RouterLink class="docs-return" to="/canvas">{{ translateUi('uiMessages.mbeef286e1e42') }}</RouterLink>
        <p class="docs-kicker">Skills Wiki</p>
        <h1>{{ translateUi('uiMessages.ma1244ebf6f97') }}</h1>
        <p class="docs-sidebar-summary">
          {{ translateUi('uiMessages.m811eed411af1') }}
        </p>

        <nav class="docs-toc" :aria-label="translateUi('uiMessages.m7ad916b385e7')">
          <span class="docs-toc-title">{{ translateUi('uiMessages.m7ad916b385e7') }}</span>
          <a v-for="section in docsSections" :key="section.id" :href="`#${section.id}`">
            {{ section.title }}
          </a>
        </nav>
      </div>
    </aside>

    <article class="docs-content">
      <section id="quick-start" class="docs-section">
        <p class="section-label">Quick Start</p>
        <h2>{{ translateUi('uiMessages.m334c20e1a480') }}</h2>
        <p>
          {{ translateUi('uiMessages.m2ee1545f56ea') }}
        </p>
        <ol class="docs-steps">
          <li>{{ translateUi('uiMessages.m6f3b8275a8be') }}</li>
          <li>{{ translateUi('uiMessages.m8bc7205567e0') }}</li>
          <li>{{ translateUi('uiMessages.m3aebf00d9c60') }} <code>/api/skills/*</code>{{ translateUi('uiMessages.med4fdf62488b') }} <code>Authorization: Bearer bsk_...</code>。</li>
          <li>{{ translateUi('uiMessages.m38a4b6027d11') }}</li>
        </ol>
        <CodeBlock
          id="quick-start-prompt"
          :title="translateUi('uiMessages.m5fd644fb78c7')"
          :code="codeBlocks.quickStartPrompt"
          :copied="copiedKey === 'quickStartPrompt'"
          @copy="copyCode('quickStartPrompt')"
        />
      </section>

      <section id="agent-install" class="docs-section">
        <p class="section-label">Install</p>
        <h2>{{ translateUi('uiMessages.m6c20b954bf44') }}</h2>
        <p>
          {{ translateUi('uiMessages.mfc872e6ee4bf') }} <code>banana-canvas-skills</code> {{ translateUi('uiMessages.mfe6e0aad9757') }}
        </p>
        <div class="docs-callout">
          {{ translateUi('uiMessages.mcf6d961fe777') }} <code>GET /api/skills/models</code>{{ translateUi('uiMessages.m72aa6d301164') }}
        </div>
        <CodeBlock
          id="install-env"
          :title="translateUi('uiMessages.m212c530be048')"
          :code="codeBlocks.envExample"
          :copied="copiedKey === 'envExample'"
          @copy="copyCode('envExample')"
        />
      </section>

      <section id="auth-domain" class="docs-section">
        <p class="section-label">Auth</p>
        <h2>{{ translateUi('uiMessages.m1e144659f89c') }}</h2>
        <p>
          {{ translateUi('uiMessages.mcaf01b7201f2') }} <code>bsk_</code> {{ translateUi('uiMessages.mf462d7922bc9') }} <code>Content-Type: application/json</code>。
        </p>
        <CodeBlock
          id="auth-request"
          :title="translateUi('uiMessages.m67c8e6ed4170')"
          :code="codeBlocks.authExample"
          :copied="copiedKey === 'authExample'"
          @copy="copyCode('authExample')"
        />
      </section>

      <section id="local-upload" class="docs-section">
        <p class="section-label">Upload</p>
        <h2>{{ translateUi('uiMessages.m2946ca7cb41d') }}</h2>
        <p>
          {{ translateUi('uiMessages.ma89cba08de24') }} <code>asset_url</code> {{ translateUi('uiMessages.me28a42931f35') }} <code>input</code>{{ translateUi('uiMessages.m95691d962c7b') }} <code>source_assets</code> {{ translateUi('uiMessages.ma2123d69506f') }} <code>reference_assets</code>{{ translateUi('uiMessages.mbd26d44fc6f3') }} <code>audio/mpeg</code>、<code>audio/wav</code>、<code>audio/ogg</code> {{ translateUi('uiMessages.ma2123d69506f') }} <code>audio/mp4</code>{{ translateUi('uiMessages.m3f0104432871') }}
        </p>
        <ol class="docs-steps">
          <li>{{ translateUi('uiMessages.m653b123c956d') }} <code>POST /api/skills/uploads/presign</code>{{ translateUi('uiMessages.mdb860ba6fd03') }}</li>
          <li>{{ translateUi('uiMessages.m1ca9bf50f7bc') }} <code>upload_url</code>、<code>method</code>、<code>headers</code> {{ translateUi('uiMessages.m2dbb717fb0d3') }}</li>
          <li>{{ translateUi('uiMessages.m234fc5d0ce24') }} <code>asset_url</code> {{ translateUi('uiMessages.maea6cce83a21') }}</li>
        </ol>
        <CodeBlock
          id="presign-upload"
          :title="translateUi('uiMessages.m95553d1a6b8e')"
          :code="codeBlocks.presignUploadExample"
          :copied="copiedKey === 'presignUploadExample'"
          @copy="copyCode('presignUploadExample')"
        />
      </section>

      <section id="models" class="docs-section">
        <p class="section-label">Models</p>
        <h2>/api/skills/models</h2>
        <p>
          {{ translateUi('uiMessages.mbad945378028') }} <code>audio[].capability</code> {{ translateUi('uiMessages.m0231bd78c443') }}
          <code>voice_design</code>、<code>voice_clone</code> {{ translateUi('uiMessages.m3d7114281f5b') }} <code>tts</code>{{ translateUi('uiMessages.m2b82d2d0de33') }} <code>name</code> {{ translateUi('uiMessages.ma2123d69506f') }} <code>id</code>{{ translateUi('uiMessages.madd1a43ee3e9') }}
        </p>
        <CodeBlock
          id="models-request"
          :title="translateUi('uiMessages.m6e18b7346f13')"
          :code="codeBlocks.modelsExample"
          :copied="copiedKey === 'modelsExample'"
          @copy="copyCode('modelsExample')"
        />
      </section>

      <section id="images" class="docs-section">
        <p class="section-label">Images</p>
        <h2>/api/skills/generate</h2>
        <p>
          {{ translateUi('uiMessages.m0ece727c3282') }} <code>prompt</code>{{ translateUi('uiMessages.mcf88543a13be') }} <code>input</code>{{ translateUi('uiMessages.mbfcdaeab0e24') }} <code>model</code>、<code>prompt</code>、<code>ratio</code>、<code>size</code>、<code>n</code> {{ translateUi('uiMessages.ma3be65d4e962') }} <code>canvas_writeback</code>。
        </p>
        <CodeBlock
          id="image-generate"
          :title="translateUi('uiMessages.m921b7f191cab')"
          :code="codeBlocks.imageExample"
          :copied="copiedKey === 'imageExample'"
          @copy="copyCode('imageExample')"
        />
      </section>

      <section id="videos" class="docs-section">
        <p class="section-label">Videos</p>
        <h2>/api/skills/videos/generate</h2>
        <p>
          {{ translateUi('uiMessages.m0e5841be535a') }} <code>asset_url</code>{{ translateUi('uiMessages.m9bf206b91387') }} <code>source_assets</code> {{ translateUi('uiMessages.ma2123d69506f') }} <code>reference_assets</code>{{ translateUi('uiMessages.m9782952ede31') }} <code>GET /api/skills/models</code> {{ translateUi('uiMessages.m886a9cdf2da8') }} <code>imageInputReview</code>{{ translateUi('uiMessages.ma27efc2cbc6c') }}
          <code>mode</code> {{ translateUi('uiMessages.mae6ba72e3f23') }} <code>multimodal_ref</code>/<code>video_edit</code>/<code>video_extend</code>
          {{ translateUi('uiMessages.me9cbdc278c79') }} <code>subject_control</code>/<code>video_reference</code>/<code>multi_shot</code> {{ translateUi('uiMessages.mbcda964eb3f1') }}
        </p>
        <CodeBlock
          id="video-generate"
          :title="translateUi('uiMessages.m7ed2ed2bde4d')"
          :code="codeBlocks.videoExample"
          :copied="copiedKey === 'videoExample'"
          @copy="copyCode('videoExample')"
        />
      </section>

      <section id="audio" class="docs-section">
        <p class="section-label">Audio</p>
        <h2>/api/skills/audio/generate</h2>
        <p>
          {{ translateUi('uiMessages.m22dc318dbe0f') }} <code>GET /api/skills/models</code> {{ translateUi('uiMessages.m8af2350cfd65') }}
          <code>audio[]</code> {{ translateUi('uiMessages.meea50f4175bf') }} <code>capability</code> {{ translateUi('uiMessages.m75b23637c80a') }} <code>prompt</code> {{ translateUi('uiMessages.mde1d5dd076fb') }} <code>style</code>{{ translateUi('uiMessages.m5aa750148a1a') }} <code>reference_audio_url</code>{{ translateUi('uiMessages.m1e055fccd727') }} <code>reference_assets</code>{{ translateUi('uiMessages.m0cc486559160') }} <code>voice_id</code>{{ translateUi('uiMessages.m7f4ebe4ba68e') }} <code>reference_audio_url</code> + <code>reference_audio_text</code> {{ translateUi('uiMessages.mcab3911dfb7f') }} <code>canvas_writeback</code>。
        </p>
        <CodeBlock
          id="audio-generate"
          :title="translateUi('uiMessages.m847cc897cf41')"
          :code="codeBlocks.audioExample"
          :copied="copiedKey === 'audioExample'"
          @copy="copyCode('audioExample')"
        />
      </section>

      <section id="tasks" class="docs-section">
        <p class="section-label">Tasks</p>
        <h2>/api/skills/tasks</h2>
        <p>
          {{ translateUi('uiMessages.m5293d4ba41fa') }} <code>GET /api/skills/tasks/:taskId</code>{{ translateUi('uiMessages.m6fc7ea2a3912') }}
          <code>completed</code>、<code>failed</code>、<code>timeout</code> {{ translateUi('uiMessages.m039fe48058cb') }}
        </p>
        <CodeBlock
          id="poll-task"
          :title="translateUi('uiMessages.m30acc3ecc74b')"
          :code="codeBlocks.pollTaskExample"
          :copied="copiedKey === 'pollTaskExample'"
          @copy="copyCode('pollTaskExample')"
        />
      </section>

      <section id="writeback" class="docs-section">
        <p class="section-label">Canvas</p>
        <h2>canvas_writeback</h2>
        <p>
          {{ translateUi('uiMessages.mf7e971a1e128') }} <code>canvas_writeback</code>{{ translateUi('uiMessages.m729d327b06c2') }} <code>replace_output</code>{{ translateUi('uiMessages.mf79eade3afe4') }}
        </p>
        <CodeBlock
          id="writeback-example"
          :title="translateUi('uiMessages.m7458f19c733e')"
          :code="codeBlocks.writebackExample"
          :copied="copiedKey === 'writebackExample'"
          @copy="copyCode('writebackExample')"
        />
      </section>

      <section id="billing" class="docs-section">
        <p class="section-label">Billing</p>
        <h2>{{ translateUi('uiMessages.m455be382d5d4') }}</h2>
        <p>
          {{ translateUi('uiMessages.mbd295a4038a4') }} <code>space_type: "team"</code>
          {{ translateUi('uiMessages.mbfa48c649732') }} <code>team_id</code>{{ translateUi('uiMessages.m032c41fcdb4c') }}
        </p>
        <CodeBlock
          id="space-context"
          :title="translateUi('uiMessages.mab8f33d375d6')"
          :code="codeBlocks.spaceExample"
          :copied="copiedKey === 'spaceExample'"
          @copy="copyCode('spaceExample')"
        />
      </section>

      <section id="errors" class="docs-section">
        <p class="section-label">Errors</p>
        <h2>{{ translateUi('uiMessages.md4c908b6f8a9') }}</h2>
        <p>
          {{ translateUi('uiMessages.m533d81ad7f55') }}
        </p>
        <div class="docs-table">
          <span>invalid_skill_key</span><p>{{ translateUi('uiMessages.ma38a95717057') }}</p>
          <span>skill_key_revoked</span><p>{{ translateUi('uiMessages.me2ef3566aa4f') }}</p>
          <span>model_package_required</span><p>{{ translateUi('uiMessages.m91d03067557f') }}</p>
          <span>skills_image_review_failed</span><p>{{ translateUi('uiMessages.mc20872e2bf66') }}</p>
          <span>skills_image_review_timeout</span><p>{{ translateUi('uiMessages.mc1ee3cd181a6') }}</p>
          <span>insufficient_points</span><p>{{ translateUi('uiMessages.md12b041b6270') }}</p>
          <span>403</span><p>{{ translateUi('uiMessages.m9ab6da0f8c17') }}</p>
          <span>404</span><p>{{ translateUi('uiMessages.m5b60956c042d') }}</p>
        </div>
        <CodeBlock
          id="error-handling"
          :title="translateUi('uiMessages.m1d99a2b0582b')"
          :code="codeBlocks.errorExample"
          :copied="copiedKey === 'errorExample'"
          @copy="copyCode('errorExample')"
        />
      </section>

      <section id="complete-example" class="docs-section">
        <p class="section-label">Example</p>
        <h2>{{ translateUi('uiMessages.mda8c682d4a2a') }}</h2>
        <p>
          {{ translateUi('uiMessages.m901a2e96380f') }}
        </p>
        <CodeBlock
          id="complete-agent-example"
          :title="translateUi('uiMessages.m2e550f524c2b')"
          :code="codeBlocks.completeAgentExample"
          :copied="copiedKey === 'completeAgentExample'"
          @copy="copyCode('completeAgentExample')"
        />
      </section>
    </article>
  </main>
</template>

<script setup>
import { t as translateUi } from '@/i18n'

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
          'aria-label': translateUi('uiMessages.mf0efbab778ac', { value1: (props.title) }),
          onClick: () => emit('copy')
        }, props.copied ? translateUi('common.copied') : translateUi('canvas.textNode.copy'))
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
  { id: 'audio', title: '音频生成' },
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
如果用户提供本地图片、视频或音频，先调用 POST ${baseUrl}/api/skills/uploads/presign，把文件 PUT 到 upload_url，再把 asset_url 传给生成接口；上传只负责存储，不代表图片已经过审。
音色设计、声音克隆和 TTS 统一调用 POST ${baseUrl}/api/skills/audio/generate，先从 audio[] 按 capability 选择模型；真实音频完成后才计费并可写回画布。
视频统一调用 POST ${baseUrl}/api/skills/videos/generate；服务端会根据当前租户渠道自动选择视频模式并执行必要的图片过审。视频请求阶段会按该 Skills Key 所属租户和锁定渠道自动过审，不会故障转移到其他渠道；过审失败或超时会停止视频提交。
先读取 GET ${baseUrl}/api/skills/models 返回的 video[].imageInputReview。9000 端口的租户管理后台只是配置入口，不要把端口或模型名硬编码成必审模型；只有图片输入且锁定视频渠道与当前租户审图渠道严格匹配时才自动过审，过审结果不能跨渠道复用。不要直接调用供应商过审接口。`

const envExample = `BANANA_SKILLS_BASE_URL=${baseUrl}
BANANA_SKILLS_API_KEY=bsk_your_key`

const authExample = `curl -sS ${baseUrl}/api/skills/models \\
  -H "Authorization: Bearer $BANANA_SKILLS_API_KEY" \\
  -H "Content-Type: application/json"`

const modelsExample = `GET ${baseUrl}/api/skills/models

响应中优先使用：
- image_models[].name 或 image_models[].id
- video_models[].name 或 video_models[].id
- audio[].name 或 audio[].id，并按 capability 选择 voice_design、voice_clone 或 tts
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

const audioExample = `# 统一音频接口：音色设计、声音克隆、TTS
POST ${baseUrl}/api/skills/audio/generate
Authorization: Bearer bsk_your_key
Content-Type: application/json

# 音色设计：prompt + style
{
  "model": "voice-design-model-from-audio",
  "capability": "voice_design",
  "prompt": "请朗读：欢迎来到 Banana Canvas",
  "style": "普通话、温暖醇厚的青年女声、语速适中"
}

# 声音克隆：先通过 uploads/presign 上传参考音频，再传 asset_url
{
  "model": "voice-clone-model-from-audio",
  "capability": "voice_clone",
  "prompt": "请用参考音色朗读：欢迎来到 Banana Canvas",
  "reference_audio_url": "https://cdn.example.com/skills/reference.mp3"
}

# TTS：可复用 voice_id，或直接提供参考音频及其文本
{
  "model": "tts-model-from-audio",
  "capability": "tts",
  "prompt": "欢迎来到 Banana Canvas",
  "voice_id": "voice-id-from-provider",
  "canvas_writeback": {
    "workflow_id": "existing-workflow-id",
    "node_id": "audio-node-id",
    "mode": "replace_output"
  }
}

服务端会轮询供应商任务，只有下载并存储真实音频后才计费；失败或 30 分钟超时不扣费。
完成后轮询 /api/skills/tasks/:taskId，使用 response.task.result_urls[0] 播放或下载 MP3/WAV。`

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
  "prompt": "use the person image and the motion from the video",
  "duration": 5,
  "resolution": "720p",
  "source_assets": [
    { "url": "https://cdn.example.com/skills/person.png", "media_type": "image" }
  ],
  "reference_assets": [
    { "url": "https://cdn.example.com/skills/reference-video.mp4", "media_type": "video" }
  ]
}`

const pollTaskExample = `async function pollTask(taskId) {
  while (true) {
    const response = await request('/api/skills/tasks/' + encodeURIComponent(taskId))
    const task = response.task || response
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
  if (code === 'skills_image_review_failed' || code === 'skills_image_review_timeout') {
    return '视频图片过审未完成，请更换素材或稍后重试。'
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
    const response = await request('/api/skills/tasks/' + encodeURIComponent(taskId))
    const task = response.task || response
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
  audioExample,
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
