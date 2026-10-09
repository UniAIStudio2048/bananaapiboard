import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./VideoNode.vue', import.meta.url), 'utf8')
const snapshotSource = source.slice(source.indexOf('  const capturedState = {'), source.indexOf('\n  const targetNode =', source.indexOf('  const capturedState = {')))

test('video submission snapshots the selected mode label and submode', () => {
  const state = new Proxy({
    activeVideoModeSelector: { value: { value: 'pro', options: [{ value: 'pro', label: 'Pro首尾帧' }] } },
    activeVideoSubmodeSelector: { value: { value: 'wan-pro', options: [{ value: 'wan-pro', label: '专业换人' }] } },
    props: { id: 'node-1', data: {} }, upstreamData: { digitalHumans: [] },
    isHeygenFlow: false, isDigitalHumanFlow: false,
    Boolean
  }, { has: () => true, get: (target, key) => key === Symbol.unscopables ? undefined : target[key] ?? { value: String(key).startsWith('is') ? false : [] } })
  const snapshot = new Function('state', `with (state) { ${snapshotSource}; return capturedState }`)(state)
  assert.equal(snapshot.ledgerVideoMode, 'Pro首尾帧 / 专业换人')
})

test('video request transmits the captured mode label to the history snapshot', () => {
  const request = source.slice(source.indexOf('async function sendGenerateRequest('), source.indexOf('async function executeNodeGeneration('))
  assert.ok(/formData\.append\('ledger_video_mode', capturedState\.ledgerVideoMode\)/.test(request))
})
