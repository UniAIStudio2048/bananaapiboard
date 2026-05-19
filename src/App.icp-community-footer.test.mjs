import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')

assert.doesNotMatch(
  source,
  /route\.name !== 'communityDetail'/,
  'community detail pages should not be excluded from the global ICP footer'
)

assert.match(
  source,
  /route\.name === 'communityWorkflow'/,
  'full-screen community workflow preview should remain excluded from the ICP footer'
)

const footerBlock = source.match(/<!-- 底部备案号[\s\S]*?<\/footer>/)?.[0] || ''

assert.doesNotMatch(
  footerBlock,
  /route\.path !== '\/'/,
  'community landing mode mounts the community home on /, so the global ICP footer must not unconditionally exclude /'
)

assert.match(
  source,
  /isCommunityLandingPage/,
  'App should distinguish the 3D landing page from community landing mode before deciding whether to show the ICP footer'
)

assert.match(
  source,
  /icp_license_number/,
  'global ICP footer should support ICP license number display'
)

assert.match(
  source,
  /https:\/\/dxzhgl\.miit\.gov\.cn\//,
  'global ICP footer should default the ICP license link to the official MIIT query site'
)

assert.match(
  source,
  /hasIcpFooterLinks/,
  'global ICP footer should render when either ICP filing or ICP license is configured'
)

console.log('App community ICP footer source tests passed')
