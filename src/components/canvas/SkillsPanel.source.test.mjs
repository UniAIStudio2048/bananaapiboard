import { localizedPattern } from '../../i18n/sourceAssertions.mjs'
import { readFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'SkillsPanel.vue'), 'utf8')

assert.match(source, /defineEmits\(\['close'\]\)/)
assert.match(source, /getSkillKeys/)
assert.match(source, /createSkillKey/)
assert.match(source, /resetSkillKey/)
assert.match(source, /getSkillPackage/)
assert.match(source, /navigator\.clipboard\.writeText/)
assert.match(source, /window\.location\.origin/)
assert.match(source, /\/docs/)
assert.match(source, /SKILL\.md/)
assert.match(source, /agentInstallPrompt/)
assert.match(source, /packageData\.value\?\.agent_install_prompt/)
assert.match(source, /normalizeSkillBaseUrl/)
assert.match(source, /packageResult\?\.baseUrl/)
assert.match(source, localizedPattern(/通过 AI Agent 安装/))
assert.match(source, localizedPattern(/手动安装/))
assert.match(source, localizedPattern(/复制安装提示词/))
assert.match(source, localizedPattern(/Codex、Claude Code、WorkBuddy、OpenClaw、Hermes/))
assert.match(source, localizedPattern(/其他支持 Skills 调用的智能体/))
assert.match(source, /api_key/)
assert.match(source, /packageData\.value\?\.key\?\.api_key/)
assert.match(source, /\.skills-panel-backdrop\s*\{[\s\S]*align-items:\s*center/)
assert.match(source, /\.skills-panel-backdrop\s*\{[\s\S]*justify-content:\s*center/)
assert.match(source, /\.skills-install-tabs/)
assert.match(source, /:root\.canvas-theme-light\s+\.skills-panel-backdrop\s*\{[\s\S]*background:\s*rgba\(15,\s*23,\s*42,\s*0\.28\)/)
assert.match(source, /:root\.canvas-theme-light\s+\.skills-panel\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.98\)/)
assert.match(source, /:root\.canvas-theme-light\s+\.skills-card\s*\{[\s\S]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.86\)/)
assert.match(source, /:root\.canvas-theme-light\s+\.skills-prompt-box\s*\{[\s\S]*color:\s*#111827/)
assert.doesNotMatch(source, /justify-content:\s*flex-end/)
assert.doesNotMatch(source, localizedPattern(/租户域名/))
assert.doesNotMatch(source, localizedPattern(/后端源站/))

console.log('SkillsPanel source tests passed')
