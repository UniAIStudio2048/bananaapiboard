<template>
  <main class="docs-layout">
    <aside class="docs-sidebar">
      <div class="docs-brand">{{ brandName }}</div>
      <nav>
        <a v-for="section in sections" :key="section.id" :href="`#${section.id}`">{{ section.title }}</a>
      </nav>
    </aside>

    <article class="docs-content">
      <header class="docs-hero">
        <p>Canvas Skills</p>
        <h1>租户域名 Agent API</h1>
        <span>所有请求都应使用 <code>{{ baseUrl }}</code>。不要把后端源站域名写进 Skill 或自动化脚本。</span>
      </header>

      <section id="quick-start">
        <h2>快速开始</h2>
        <p>在画布右上角打开 Skills，创建 API Key，复制 SKILL.md 到 Codex、Claude Code 或其他支持 Skill 的 agent。</p>
        <pre><code>{{ quickStartExample }}</code></pre>
      </section>

      <section id="install">
        <h2>安装 Skill</h2>
        <p>Skill 包包含 API 说明、鉴权头和示例请求。安装后 agent 可以读取模型、提交生成任务，并把结果写回画布节点。</p>
      </section>

      <section id="api-key">
        <h2>API Key</h2>
        <p>浏览器端通过登录会话管理 Key；agent 端通过 <code>Authorization: Bearer bsk_...</code> 调用 Skills API。</p>
      </section>

      <section id="models">
        <h2>/api/skills/models</h2>
        <p>返回当前租户和当前用户可用的图像、视频模型。模型权限和套餐校验沿用现有生成系统。</p>
      </section>

      <section id="images">
        <h2>/api/skills/images/generate</h2>
        <pre><code>{{ imageExample }}</code></pre>
      </section>

      <section id="videos">
        <h2>/api/skills/videos/generate</h2>
        <pre><code>{{ videoExample }}</code></pre>
      </section>

      <section id="tasks">
        <h2>/api/skills/tasks</h2>
        <p>轮询 <code>/api/skills/tasks/:taskId</code> 获取状态、预览 URL、结果 URL、扣费点数和写回状态。</p>
      </section>

      <section id="writeback">
        <h2>canvas_writeback</h2>
        <p>提交生成时传入 <code>canvas_writeback</code> 可把结果写回指定工作流节点，目前推荐使用 <code>replace_output</code> 模式。</p>
      </section>

      <section id="billing">
        <h2>计费</h2>
        <p>Skills API 不绕过积分、团队空间或模型套餐规则。团队任务需传入 <code>space_type</code> 和 <code>team_id</code>。</p>
      </section>

      <section id="errors">
        <h2>错误码</h2>
        <div class="docs-table">
          <span>401</span><p>API Key 缺失、过期或已重置。</p>
          <span>403</span><p>模型、团队空间或画布写回权限不足。</p>
          <span>404</span><p>任务、工作流或节点不存在。</p>
          <span>402</span><p>积分不足或套餐不支持当前模型。</p>
        </div>
      </section>
    </article>

    <aside class="docs-toc">
      <span>On this page</span>
      <a v-for="section in sections" :key="section.id" :href="`#${section.id}`">{{ section.title }}</a>
    </aside>
  </main>
</template>

<script setup>
import { computed } from 'vue'
import { getBrand } from '@/config/tenant'

const baseUrl = window.location.origin
const brandName = computed(() => getBrand()?.name || 'Banana AI')
const sections = [
  { id: 'quick-start', title: '快速开始' },
  { id: 'install', title: '安装 Skill' },
  { id: 'api-key', title: 'API Key' },
  { id: 'models', title: 'Models' },
  { id: 'images', title: 'Images' },
  { id: 'videos', title: 'Videos' },
  { id: 'tasks', title: 'Tasks' },
  { id: 'writeback', title: 'Writeback' },
  { id: 'billing', title: '计费' },
  { id: 'errors', title: '错误码' }
]

const quickStartExample = `const baseUrl = window.location.origin
const response = await fetch(baseUrl + '/api/skills/models', {
  headers: { Authorization: 'Bearer bsk_your_key' }
})`

const imageExample = `POST ${baseUrl}/api/skills/images/generate
{
  "model": "nano-banana",
  "prompt": "product photo on a clean desk",
  "aspect_ratio": "1:1",
  "canvas_writeback": {
    "workflow_id": "workflow-id",
    "node_id": "image-node-id",
    "mode": "replace_output"
  }
}`

const videoExample = `POST ${baseUrl}/api/skills/videos/generate
{
  "model": "sora-2",
  "prompt": "slow camera push in",
  "duration": 5,
  "source_assets": ["https://tenant.example.com/uploads/input.png"]
}`
</script>

<style scoped>
.docs-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr) 220px;
  gap: 0;
  background: #080a0f;
  color: rgba(255, 255, 255, 0.86);
}

.docs-sidebar,
.docs-toc {
  position: sticky;
  top: 0;
  height: 100vh;
  padding: 28px 24px;
  border-color: rgba(255, 255, 255, 0.08);
}

.docs-sidebar {
  border-right: 1px solid rgba(255, 255, 255, 0.08);
}

.docs-toc {
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.docs-brand {
  margin-bottom: 28px;
  font-size: 18px;
  font-weight: 700;
}

.docs-sidebar nav,
.docs-toc {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.docs-sidebar a,
.docs-toc a {
  color: rgba(255, 255, 255, 0.58);
  font-size: 14px;
  text-decoration: none;
}

.docs-sidebar a:hover,
.docs-toc a:hover {
  color: #fff;
}

.docs-toc span {
  margin-bottom: 4px;
  color: rgba(255, 255, 255, 0.42);
  font-size: 12px;
  text-transform: uppercase;
}

.docs-content {
  width: min(860px, 100%);
  padding: 56px 44px 96px;
}

.docs-hero {
  margin-bottom: 44px;
}

.docs-hero p {
  margin: 0 0 10px;
  color: #8bd3ff;
  font-weight: 700;
}

.docs-hero h1 {
  margin: 0 0 14px;
  font-size: clamp(34px, 5vw, 56px);
  line-height: 1.04;
}

.docs-hero span,
.docs-content p {
  color: rgba(255, 255, 255, 0.66);
  line-height: 1.75;
}

.docs-content section {
  padding: 28px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.docs-content h2 {
  margin: 0 0 12px;
  font-size: 24px;
}

.docs-content code,
.docs-content pre {
  font-family: 'SF Mono', Monaco, Consolas, monospace;
}

.docs-content code {
  color: #d8f99d;
}

.docs-content pre {
  overflow: auto;
  margin: 16px 0 0;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: #10131a;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  line-height: 1.65;
}

.docs-table {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 10px 16px;
  margin-top: 18px;
}

.docs-table span {
  color: #8bd3ff;
  font-family: 'SF Mono', Monaco, Consolas, monospace;
}

.docs-table p {
  margin: 0;
}

@media (max-width: 1080px) {
  .docs-layout {
    grid-template-columns: 220px minmax(0, 1fr);
  }

  .docs-toc {
    display: none;
  }
}

@media (max-width: 760px) {
  .docs-layout {
    display: block;
  }

  .docs-sidebar {
    position: static;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .docs-sidebar nav {
    flex-flow: row wrap;
  }

  .docs-content {
    padding: 36px 20px 72px;
  }
}
</style>
