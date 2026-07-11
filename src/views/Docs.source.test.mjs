import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'Docs.vue'), 'utf8')

for (const text of [
  '返回画布',
  'Banana Canvas Skills 知识库',
  '快速跳转',
  '快速开始',
  '复制安装提示词',
  '安装 Skill',
  '认证与域名',
  '本地文件上传',
  '/api/skills/models',
  '/api/skills/generate',
  '/api/skills/videos/generate',
  '/api/skills/tasks',
  'canvas_writeback',
  '计费与空间',
  '错误处理',
  '完整 Agent 示例',
  '复制'
]) {
  assert.match(source, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}
assert.match(source, /window\.location\.origin/)
assert.match(source, /normalizeHttpsOrigin/)
assert.match(source, /const docsSections = \[/)
assert.match(source, /v-for="section in docsSections"/)
assert.match(source, /class="docs-sidebar"/)
assert.match(source, /class="docs-toc"/)
assert.match(source, /class:\s*'copy-code-btn'/)
assert.match(source, /\.docs-layout\s*\{[\s\S]*background:\s*#080a0f/)
assert.match(source, /\.docs-sidebar\s*\{[\s\S]*background:\s*#0d1117/)
assert.match(source, /\.docs-section h2\s*\{[\s\S]*color:\s*#f8fafc/)
assert.match(source, /\.docs-section p,\s*[\s\S]*\.docs-steps\s*\{[\s\S]*color:\s*#cbd5e1/)
assert.match(source, /\.code-panel code\s*\{[\s\S]*color:\s*#e5e7eb/)
assert.match(source, /\.docs-table\s*\{[\s\S]*background:\s*#0f172a/)
assert.match(source, /navigator\.clipboard\.writeText/)
assert.match(source, /copyCode\(/)
assert.match(source, /codeBlocks/)
assert.match(source, /presignUploadExample/)
assert.match(source, /upload_url/)
assert.match(source, /asset_url/)
assert.match(source, /source_assets/)
assert.match(source, /reference_assets/)
assert.match(source, /服务端会根据当前租户渠道自动选择视频模式并执行必要的图片过审/)
assert.match(source, /上传只负责存储/)
assert.match(source, /视频请求阶段会按该 Skills Key 所属租户和锁定渠道自动过审/)
assert.match(source, /不会故障转移到其他渠道/)
assert.match(source, /过审失败或超时会停止视频提交/)
assert.match(source, /Seedance 2\.0/)
assert.match(source, /multimodal_ref/)
assert.match(source, /Kling v3 Omni/)
assert.match(source, /video_reference/)
assert.match(source, /media_type/)
assert.match(source, /图片过审/)
assert.match(source, /pollTaskExample/)
assert.match(source, /async function pollTask\(taskId\)/)
assert.match(source, /writebackExample/)
assert.match(source, /completeAgentExample/)
assert.match(source, /Codex、Claude Code、WorkBuddy、OpenClaw、Hermes/)
assert.match(source, /invalid_skill_key/)
assert.match(source, /skill_key_revoked/)
assert.match(source, /model_package_required/)
assert.match(source, /insufficient_points/)
assert.match(source, /docs-layout/)
assert.match(source, /docs-return/)
assert.doesNotMatch(source, /后端源站/)
assert.doesNotMatch(source, /租户ID/)
assert.doesNotMatch(source, /X-Tenant/)
assert.doesNotMatch(source, /browser login token/i)

console.log('Docs source tests passed')
