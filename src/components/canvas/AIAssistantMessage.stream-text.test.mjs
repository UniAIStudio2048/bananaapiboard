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
  // CSS 仍以 1:1 作为图片占位格的保底比例（未知比例时退回方格子），
  // 已知请求比例时由内联 style 覆盖（见 image generation aspect-ratio 测试）
  assert.match(source, /\.media-generating__placeholder \{[\s\S]*?aspect-ratio: 1;/)
})

test('image generation placeholder follows the requested aspect ratio with a ratio badge', () => {
  // 图片生成中占位格按请求比例展示（比例来自任务状态事件，未知回退 1:1），
  // 与视频占位框一致：生成中即预览构图比例，而不是全部生成完成后才显示
  assert.match(source, /:style="\{ aspectRatio: imageGeneratingAspect\.ratio \}"/)
  assert.match(source, /class="media-generating__grid-ratio">\{\{ imageGeneratingAspect\.label \}\}<\/span>/)
  // 比例未知时不显示徽标（不猜测比例）
  assert.match(source, /v-if="message\.mediaGeneratingRatio" class="media-generating__grid-ratio"/)
  assert.match(source, /const imageGeneratingAspect = computed\(\(\) => \{[\s\S]*?const ratio = valid \? raw : '1:1'/)
  assert.match(source, /const ratioStyle = \(numW > 0 && numH > 0\) \? `\$\{numW\} \/ \$\{numH\}` : '1 \/ 1'/)
  // 徽标样式与视频徽标一致（同款胶囊）
  assert.match(source, /\.media-generating__grid-ratio \{[\s\S]*?position: absolute;[\s\S]*?border-radius: 999px;/)
})

test('video generation shows an aspect-ratio placeholder with dynamic ratio label', () => {
  // 视频生成中占位格按实际画幅比例显示（比例来自任务状态事件，未知回退 16:9），不再硬编码
  assert.match(source, /v-if="message\.mediaGenerating === 'video'" class="media-generating__video"/)
  assert.match(source, /class="media-generating__video-frame"/)
  assert.match(source, /:style="\{ aspectRatio: videoGeneratingAspect\.ratio \}"/)
  assert.match(source, /class="media-generating__video-ratio">\{\{ videoGeneratingAspect\.label \}\}<\/span>/)
  assert.doesNotMatch(source, /class="media-generating__video-ratio">16:9<\/span>/)
  assert.match(source, /\.media-generating__video-frame \{[\s\S]*?aspect-ratio: 16 \/ 9;/)
})

test('expanded video cards follow the video real aspect ratio (portrait 9:16 no longer squeezed into 16:9)', () => {
  // 视频加载后按自身宽高比展示：loadedmetadata 记录尺寸，inline style 覆盖 CSS 保底 16:9
  assert.match(source, /function onVideoMetadata\(media, event\) \{[\s\S]*?videoWidth[\s\S]*?videoHeight[\s\S]*?videoDimensions\.value/)
  assert.match(source, /function videoPreviewStyle\(media\) \{[\s\S]*?aspectRatio: `\$\{dim\.w\} \/ \$\{dim\.h\}`/)
  assert.match(source, /class="ai-media-card__preview"[\s\S]*?:style="videoPreviewStyle\(media\)"/)
  assert.match(source, /@loadedmetadata="onVideoMetadata\(media, \$event\)"/)
  // CSS 16:9 仍作为加载前保底（测试既有断言保留）
  assert.match(source, /video\.ai-media-card__preview \{[\s\S]*?aspect-ratio: 16 \/ 9;/)
})

test('collapsed first video shows a play button overlay', () => {
  // 收起态首个视频叠加播放键，提示可播放而非静态封面
  assert.match(source, /v-if="index === 0 && media\.type === 'video'" class="ai-media-results__collapsed-play"/)
  assert.match(source, /\.ai-media-results__collapsed-play \{[\s\S]*?inset: 0;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/)
  assert.match(source, /\.ai-media-results__collapsed-play svg \{[\s\S]*?border-radius: 999px;[\s\S]*?background: rgba\(0, 0, 0, 0\.55\);/)
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
  assert.match(source, /v-if="message\.role === 'assistant' && mediaResults\.length && message\.mediaGenerating !== 'image'" class="ai-media-results"/)
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

test('multi-image generating fills completed images into the placeholder slots in place', () => {
  // 完成的图片原位显示在对应占位格（第 N 张 → 第 N 格），未完成保持灰格
  assert.match(source, /<template v-for="\(_, slotIndex\) in mediaGeneratingCount" :key="slotIndex">/)
  assert.match(source, /v-if="mediaPlaceholderFill\[slotIndex\]"/)
  assert.match(source, /class="media-generating__placeholder media-generating__placeholder--filled"/)
  assert.match(source, /v-else class="media-generating__placeholder"/)
  // 生成中期间隐藏下方结果区（避免完成图片出现在占位卡片下方另起一排）
  // 多图占位按提交顺序槽位填充：已完成图片按其 task_id 在 mediaSubmissionOrder 中的位置入格，
  // 未完成格保持灰格——先完成的后序图不会挤占前面空位，全部完成时也不会“刷新跳动”。
  assert.match(source, /const mediaPlaceholderFill = computed\(\(\) => \{/)
  assert.match(source, /orderIndex\.get\(img\.task_id\)/)
  assert.match(source, /new Array\(total\)\.fill\(null\)/)
  // mediaResults 保留 task_id，供占位槽位与提交顺序对应
  assert.match(source, /task_id: attachment\?\.task_id \|\| null,/)
  assert.match(source, /message\.mediaGenerating !== 'image'/)
  // 填充格样式：覆盖灰格底色与动画，object-fit 展示真实图片
  assert.match(source, /\.media-generating__placeholder--filled \{[\s\S]*?object-fit: cover;[\s\S]*?animation: none;/)
})

test('multi-image placeholder slot count stays constant during generation (uses mediaGeneratingTotal, not the decrementing counter)', () => {
  // 缺陷：mediaGeneratingCount 每完成一张递减（仅作全部完成的结束判断），模板 v-for 用它渲染格子
  // 导致占位格随生成变少。格子总数必须恒定，改由 mediaGeneratingTotal 决定，缺失时回退递减计数。
  assert.match(source, /const mediaGeneratingCount = computed\(\(\) => Math\.max\(1, Number\(props\.message\.mediaGeneratingTotal\) \|\| Number\(props\.message\.mediaGeneratingCount\) \|\| 1\)/)
})
