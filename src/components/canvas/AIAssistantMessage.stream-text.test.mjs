import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'AIAssistantMessage.vue'), 'utf8')

test('streaming assistant messages render plain text instead of full markdown', () => {
  assert.match(source, /<template v-else-if="message\.isStreaming && message\.content">[\s\S]*?<div class="ai-message__text-stream">\{\{ message\.content \}\}<\/div>/)
  assert.match(source, /<template v-else>[\s\S]*?<div v-html="formattedContent"><\/div>/)
  assert.match(source, /\.ai-message__text-stream \{[\s\S]*?white-space: pre-wrap;/)
})

test('media generation shows a visual placeholder grid with image/video label', () => {
  assert.match(source, /v-if="message\.mediaGenerating"[\s\S]*?class="media-generating"/)
  assert.match(source, /message\.mediaGenerating === 'video' \? '视频生成中' : '图片生成中'/)
  assert.match(source, /class="media-generating__grid"/)
  assert.match(source, /\.media-generating__placeholder \{[\s\S]*?aspect-ratio: 1;/)
})

test('video generation shows a 16:9 aspect-ratio placeholder with ratio label', () => {
  // 视频生成中占位格按视频画幅 16:9 显示并标注比例（对比图片生成中的 1:1 方格子）
  assert.match(source, /v-if="message\.mediaGenerating === 'video'" class="media-generating__video"/)
  assert.match(source, /class="media-generating__video-frame"/)
  assert.match(source, /class="media-generating__video-ratio">16:9<\/span>/)
  assert.match(source, /\.media-generating__video-frame \{[\s\S]*?aspect-ratio: 16 \/ 9;/)
})

test('assistant media previews normalize API-relative URLs before rendering', () => {
  assert.match(source, /import\s+\{\s*toSameOriginUrl\s*\}\s+from\s+'@\/utils\/canvasThumbnail'/)
  assert.match(source, /:src="toSameOriginUrl\(att\.url\)"/)
  assert.match(source, /url: toSameOriginUrl\(att\.url\)/)
})

test('user messages render the model reference as a tag card', () => {
  assert.match(source, /v-if="message\.role === 'user' && \(message\.skillRef \|\| message\.modelRef \|\| visibleAttachments\.length\)" class="ai-message__references"/)
  assert.match(source, /message\.modelRef\.label \|\| message\.modelRef\.modelId/)
  assert.match(source, /message\.skillRef\.label/)
  assert.match(source, /class="ai-message-reference__thumbnail"/)
  assert.match(source, /\.ai-message-reference \{[\s\S]*?border-radius:\s*10px;/)
})

test('generation results render as visual media cards with a download button', () => {
  assert.match(source, /import \{ startStreamDownload \} from '@\/api\/client'/)
  assert.match(source, /const mediaResults = computed\(\(\) => \{[\s\S]*?MEDIA_TOOL_NAMES\.some\(name => toolName\.includes\(name\)\)/,
    'media results should be extracted from image/video/task-status tool events')
  assert.match(source, /const MEDIA_URL_RE = \//)
  assert.match(source, /mediaTypeFromUrl\(/)
  assert.match(source, /v-if="message\.role === 'assistant' && mediaResults\.length" class="ai-media-results"/)
  assert.match(source, /v-if="media\.type === 'image'"[\s\S]*?class="ai-media-card__preview"/)
  assert.match(source, /class="ai-media-card__download"[\s\S]*?@click\.stop="startStreamDownload\(media\.url, media\.name\)"/)
  assert.match(source, /showMediaResults = !showMediaResults/)
  assert.match(source, /v-if="!showMediaResults"[\s\S]*?class="ai-media-results__collapsed"/)
  assert.match(source, /class="ai-media-results__remaining">\+\{\{ mediaResults\.length - collapsedStack\.length \}\}/)
  // 展开网格图片按自身比例展示：竖屏图不留灰色边框（不再强制正方形 + contain）
  assert.doesNotMatch(source, /\.ai-media-card \{[\s\S]*?aspect-ratio:\s*1;/)
  assert.match(source, /img\.ai-media-card__preview \{[\s\S]*?height: auto;/)
  // 视频无固有宽高，保底 16:9 比例
  assert.match(source, /video\.ai-media-card__preview \{[\s\S]*?aspect-ratio: 16 \/ 9;/)
  // 网格项顶对齐，避免不同比例图片互相拉伸撑出空隙
  assert.match(source, /\.media-generating__grid,\s*\.ai-media-results__grid \{[\s\S]*?align-items: start;/)
})

test('collapsed media stack shows real edges of trailing images and stays clear of text', () => {
  // 折叠态渲染前 3 张真实图片作为堆叠层（露出后续图片的右下边缘），不再是假 box-shadow 阴影层
  assert.match(source, /v-for="\(media, index\) in collapsedStack"[\s\S]*?ai-media-results__collapsed-layer/)
  assert.doesNotMatch(source, /class="ai-media-results__stack"/)
  assert.doesNotMatch(source, /\.ai-media-results__stack\s*\{/)
  assert.doesNotMatch(source, /\.ai-media-results__collapsed-preview\s*\{/)
  // 每层右边/底边内缩 (层数-1-index)*12px，露出下层图片边缘；最上层 z-index 最高
  assert.match(source, /collapsedStack\.length - 1 - index/)
  assert.match(source, /zIndex:\s*collapsedStack\.length - index/)
  assert.match(source, /const collapsedStack = computed\([\s\S]*?mediaResults\.value\.slice\(0, 3\)/)
  // 容器自撑正方形高度，堆叠层不超出边界，不与相邻文字重叠
  assert.match(source, /\.ai-media-results__collapsed \{[\s\S]*?aspect-ratio: 1;/)
  // 背面图片带轻微倾斜（分镜格子折叠感）：每层绕中心旋转 index*1.5deg，左上内缩 index*5px 作旋转余量，不越界
  assert.match(source, /inset: `\$\{index \* 5\}px/)
  assert.match(source, /transform: `rotate\(\$\{index \* 1\.5\}deg\)`/)
})

test('media grids cap width so generated images do not grow with the panel width', () => {
  // 展开网格与折叠态单图上限一致（256px）：容器再宽，两列网格封顶 532px = 256×2 + 20px gap
  assert.match(source, /\.media-generating__grid,\s*\.ai-media-results__grid \{[\s\S]*?width: min\(100%, 532px\);/)
  // 折叠态单图同样封顶 256px，避免折叠图比展开图大
  assert.match(source, /\.ai-media-results__collapsed \{[\s\S]*?width: min\(100%, 256px\);/)
})
