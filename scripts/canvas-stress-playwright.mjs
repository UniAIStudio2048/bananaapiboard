import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createCanvasStressSession } from './canvas-stress-fixture.mjs'

const DEFAULT_NODE_COUNTS = [1000, 1500]
const SESSION_KEY = 'workflow_tab_session'
const STRESS_USER_ID = 'canvas-stress-user'

function resolvePlaywrightModulePath() {
  if (process.env.PLAYWRIGHT_MODULE_PATH) return process.env.PLAYWRIGHT_MODULE_PATH

  for (const binDir of (process.env.PATH || '').split(path.delimiter)) {
    const binPath = path.join(binDir, process.platform === 'win32' ? 'playwright.cmd' : 'playwright')
    if (!fs.existsSync(binPath)) continue
    const realBinPath = fs.realpathSync(binPath)
    const packageDir = path.dirname(realBinPath)
    const indexPath = fs.existsSync(path.join(packageDir, 'index.mjs'))
      ? path.join(packageDir, 'index.mjs')
      : path.join(packageDir, 'index.js')
    if (fs.existsSync(indexPath)) return pathToFileURL(indexPath).href
  }

  return 'playwright'
}

function parseInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

function parseNodeCounts(value) {
  if (!value) return DEFAULT_NODE_COUNTS
  const counts = value
    .split(',')
    .map(item => parseInteger(item.trim(), 0))
    .filter(Boolean)
  return counts.length > 0 ? counts : DEFAULT_NODE_COUNTS
}

function json(body) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body)
  }
}

async function installApiStubs(context) {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()

    if (path === '/api/user/me') {
      return route.fulfill(json({
        id: STRESS_USER_ID,
        username: 'canvas-stress',
        role: 'user',
        points: 100000,
        package_points: 100000,
        preferences: {
          canvas: {
            theme: 'dark',
            gridSnap: true,
            edgeStyle: 'bezier',
            interactionMode: 'comfyui'
          }
        }
      }))
    }

    if (path === '/api/settings/app') {
      return route.fulfill(json({ checkin_enabled: false, checkin_reward_points: 0 }))
    }

    if (path.includes('/tickets')) return route.fulfill(json({ tickets: [], items: [] }))
    if (path.includes('/teams')) return route.fulfill(json({ teams: [], items: [] }))
    if (path.includes('/workflows')) return route.fulfill(json({ workflows: [], items: [] }))
    if (path.includes('/assets')) return route.fulfill(json({ assets: [], items: [], total: 0 }))
    if (path.includes('/background-tasks')) return route.fulfill(json({ tasks: [] }))
    if (path.includes('/submission/')) return route.fulfill(json({ found: false }))

    return route.fulfill(json({ ok: true, items: [], data: [] }))
  })
}

async function injectStressSession(context, nodeCount) {
  const session = createCanvasStressSession({ nodeCount })
  await context.addInitScript(({ session, userId, sessionKey }) => {
    const now = Date.now()
    const user = {
      id: userId,
      username: 'canvas-stress',
      role: 'user',
      preferences: {
        canvas: {
          theme: 'dark',
          gridSnap: true,
          edgeStyle: 'bezier',
          interactionMode: 'comfyui'
        }
      }
    }
    localStorage.setItem('token', 'canvas-stress-token')
    localStorage.setItem('user_id', userId)
    localStorage.setItem('userId', userId)
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('canvasOnboardingCompleted', 'true')
    localStorage.setItem('canvasOnboardingEnabled', 'false')
    localStorage.setItem(sessionKey, JSON.stringify({ ...session, userId, savedAt: now }))
    sessionStorage.setItem('canvas_last_user_id', userId)
  }, { session, userId: STRESS_USER_ID, sessionKey: SESSION_KEY })
}

async function collectMetrics(page, nodeCount, mediaRequestCount, interaction) {
  return page.evaluate(async ({ nodeCount, mediaRequestCount, interaction }) => {
    function frameSample(durationMs) {
      return new Promise((resolve) => {
        const start = performance.now()
        let last = start
        const frames = []
        function step(now) {
          frames.push(now - last)
          last = now
          if (now - start < durationMs) {
            requestAnimationFrame(step)
          } else {
            const sorted = [...frames].sort((a, b) => a - b)
            const p95 = sorted[Math.max(0, Math.floor(sorted.length * 0.95) - 1)] || 0
            resolve({
              frames: frames.length,
              maxFrameMs: Math.max(...frames, 0),
              p95FrameMs: p95
            })
          }
        }
        requestAnimationFrame(step)
      })
    }

    const sample = await frameSample(700)
    return {
      nodeCount,
      mountedNodes: document.querySelectorAll('.vue-flow__node').length,
      mountedEdges: document.querySelectorAll('.vue-flow__edge').length,
      miniMapOverview: document.querySelectorAll('.canvas-minimap-overview rect.overview-node').length,
      normalMiniMapNodes: document.querySelectorAll('.vue-flow__minimap .vue-flow__minimap-node').length,
      videoElements: document.querySelectorAll('video').length,
      mediaRequestCount,
      interactionMs: interaction.interactionMs,
      nodeDragMoved: interaction.nodeDragMoved,
      ...sample
    }
  }, { nodeCount, mediaRequestCount, interaction })
}

async function exerciseCanvas(page) {
  const start = Date.now()
  const node = page.locator('.vue-flow__node').nth(1)
  const before = await node.boundingBox()
  let nodeDragMoved = false
  if (before) {
    await page.mouse.move(before.x + before.width / 2, before.y + Math.min(before.height / 2, 80))
    await page.mouse.down()
    await page.mouse.move(before.x + before.width / 2 + 80, before.y + Math.min(before.height / 2, 80) + 40, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(150)
    const after = await node.boundingBox()
    nodeDragMoved = !!after && (Math.abs(after.x - before.x) > 20 || Math.abs(after.y - before.y) > 20)
  }

  await page.mouse.move(720, 420)
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, i % 2 === 0 ? 220 : -160)
  }
  await page.mouse.move(600, 360)
  await page.mouse.down()
  await page.mouse.move(820, 520, { steps: 8 })
  await page.mouse.up()
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -240)
  await page.keyboard.up('Control')
  return {
    interactionMs: Date.now() - start,
    nodeDragMoved
  }
}

async function runCase(browser, options, nodeCount) {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 1
  })
  await installApiStubs(context)
  await injectStressSession(context, nodeCount)

  let mediaRequestCount = 0
  const page = await context.newPage()
  page.on('request', (request) => {
    const url = request.url()
    const type = request.resourceType()
    if (type === 'media' || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) {
      mediaRequestCount += 1
    }
  })

  const target = new URL('/canvas', options.baseUrl).toString()
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs })
  await page.locator('.vue-flow').first().waitFor({ state: 'attached', timeout: options.timeoutMs })
  await page.waitForFunction(
    () => document.querySelectorAll('.vue-flow__node').length > 0,
    null,
    { timeout: options.timeoutMs }
  )
  if (options.showMiniMap) {
    await page.locator('.canvas-map-toggle-btn').click({ timeout: options.timeoutMs })
  }
  await page.waitForTimeout(500)

  const interaction = await exerciseCanvas(page)
  await page.waitForTimeout(300)

  const metrics = await collectMetrics(page, nodeCount, mediaRequestCount, interaction)
  await context.close()
  return metrics
}

function assertMetrics(metrics, options) {
  const failures = []
  if (metrics.mountedNodes > options.maxMountedNodes) {
    failures.push(`mountedNodes ${metrics.mountedNodes} > ${options.maxMountedNodes}`)
  }
  if (metrics.videoElements > options.maxVideoElements) {
    failures.push(`videoElements ${metrics.videoElements} > ${options.maxVideoElements}`)
  }
  if (metrics.mediaRequestCount > options.maxMediaRequests) {
    failures.push(`mediaRequestCount ${metrics.mediaRequestCount} > ${options.maxMediaRequests}`)
  }
  if (options.enforceTiming && metrics.interactionMs > options.maxInteractionMs) {
    failures.push(`interactionMs ${metrics.interactionMs} > ${options.maxInteractionMs}`)
  }
  if (options.enforceTiming && metrics.p95FrameMs > options.maxP95FrameMs) {
    failures.push(`p95FrameMs ${metrics.p95FrameMs.toFixed(1)} > ${options.maxP95FrameMs}`)
  }
  if (metrics.nodeCount >= 1000 && metrics.normalMiniMapNodes > 0) {
    failures.push(`normalMiniMapNodes ${metrics.normalMiniMapNodes} should be 0 for large canvas`)
  }
  if (options.showMiniMap && metrics.nodeCount >= 1000 && metrics.miniMapOverview < metrics.nodeCount) {
    failures.push(`miniMapOverview ${metrics.miniMapOverview} < ${metrics.nodeCount}`)
  }
  if (!metrics.nodeDragMoved) {
    failures.push('nodeDragMoved should be true')
  }
  if (failures.length > 0) {
    throw new Error(`Canvas stress ${metrics.nodeCount} failed: ${failures.join(', ')}`)
  }
}

async function main() {
  const options = {
    baseUrl: process.env.CANVAS_STRESS_URL || 'http://127.0.0.1:5173',
    nodeCounts: parseNodeCounts(process.env.CANVAS_STRESS_NODE_COUNTS),
    width: parseInteger(process.env.CANVAS_STRESS_WIDTH, 1440),
    height: parseInteger(process.env.CANVAS_STRESS_HEIGHT, 900),
    timeoutMs: parseInteger(process.env.CANVAS_STRESS_TIMEOUT_MS, 30000),
    maxMountedNodes: parseInteger(process.env.CANVAS_STRESS_MAX_MOUNTED_NODES, 280),
    maxVideoElements: parseInteger(process.env.CANVAS_STRESS_MAX_VIDEO_ELEMENTS, 0),
    maxMediaRequests: parseInteger(process.env.CANVAS_STRESS_MAX_MEDIA_REQUESTS, 0),
    maxInteractionMs: parseInteger(process.env.CANVAS_STRESS_MAX_INTERACTION_MS, 7000),
    maxP95FrameMs: parseInteger(process.env.CANVAS_STRESS_MAX_P95_FRAME_MS, 33),
    enforceTiming: process.env.CANVAS_STRESS_ENFORCE_TIMING === '1',
    showMiniMap: process.env.CANVAS_STRESS_SHOW_MAP !== '0',
    headless: process.env.CANVAS_STRESS_HEADLESS !== '0'
  }

  const playwrightModulePath = resolvePlaywrightModulePath()
  const playwright = await import(playwrightModulePath)
  const chromium = playwright.chromium || playwright.default?.chromium
  if (!chromium) throw new Error(`Unable to load Playwright chromium from ${playwrightModulePath}`)
  const browser = await chromium.launch({ headless: options.headless })
  const results = []
  try {
    for (const nodeCount of options.nodeCounts) {
      const metrics = await runCase(browser, options, nodeCount)
      assertMetrics(metrics, options)
      results.push(metrics)
      console.log(JSON.stringify(metrics))
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
