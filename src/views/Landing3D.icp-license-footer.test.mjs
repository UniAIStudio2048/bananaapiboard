import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./Landing3D.vue', import.meta.url), 'utf8')

assert.match(
  source,
  /icp_license_number/,
  '3D landing footer should support ICP license number display'
)

assert.match(
  source,
  /https:\/\/dxzhgl\.miit\.gov\.cn\//,
  '3D landing footer should default the ICP license link to the official MIIT query site'
)

assert.match(
  source,
  /hasIcpFooterLinks/,
  '3D landing footer should render when either ICP filing or ICP license is configured'
)

console.log('Landing3D ICP license footer source tests passed')
