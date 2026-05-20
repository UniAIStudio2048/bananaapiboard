import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateSubtitleEraseBilling,
  pickSubtitleEraseChannelFromMasked,
  estimateSubtitleEraseBilling
} from './videoToolBilling.js'

test('subtitle erase billing charges at least one minute', () => {
  assert.deepEqual(calculateSubtitleEraseBilling({ totalSeconds: 15, pricePerMinute: 12, pointsPerSecond: 0 }), {
    totalSeconds: 15,
    billedMinutes: 1,
    billingUnit: 'minute',
    pointsPerSecond: 0,
    pointsCost: 12
  })
})

test('subtitle erase billing rounds up started minutes', () => {
  assert.deepEqual(calculateSubtitleEraseBilling({ totalSeconds: 61, pricePerMinute: 8, pointsPerSecond: 0 }), {
    totalSeconds: 61,
    billedMinutes: 2,
    billingUnit: 'minute',
    pointsPerSecond: 0,
    pointsCost: 16
  })
})

test('subtitle erase billing prefers per-second when rate positive', () => {
  assert.deepEqual(calculateSubtitleEraseBilling({ totalSeconds: 15.2, pricePerMinute: 999, pointsPerSecond: 2 }), {
    totalSeconds: 15.2,
    billedSeconds: 16,
    billedMinutes: 1,
    billingUnit: 'second',
    pointsPerSecond: 2,
    pointsCost: 32
  })
})

test('pickSubtitleEraseChannel respects priority when both configured', () => {
  const base = {
    enabled: true,
    wuhenai: {
      enabled: true,
      configured: true,
      standardPricePerMinute: 4,
      finePricePerMinute: 10,
      standardPointsPerSecond: 0,
      finePointsPerSecond: 0
    },
    volcengine: {
      enabled: true,
      configured: true,
      standardPricePerMinute: 99,
      finePricePerMinute: 99,
      standardPointsPerSecond: 0,
      finePointsPerSecond: 0
    }
  }
  assert.equal(pickSubtitleEraseChannelFromMasked({ ...base, priorityFirst: 'wuhenai' }).id, 'wuhenai')
  assert.equal(pickSubtitleEraseChannelFromMasked({ ...base, priorityFirst: 'volcengine' }).id, 'volcengine')
})

test('pickSubtitleEraseChannel falls back when priority channel not configured', () => {
  const cfg = {
    enabled: true,
    priorityFirst: 'volcengine',
    volcengine: { enabled: true, configured: false, standardPricePerMinute: 1 },
    wuhenai: { enabled: true, configured: true, standardPricePerMinute: 5 }
  }
  assert.equal(pickSubtitleEraseChannelFromMasked(cfg).id, 'wuhenai')
})

test('estimateSubtitleEraseBilling works when master switch off but channel configured', () => {
  const cfg = {
    enabled: false,
    priorityFirst: 'wuhenai',
    wuhenai: {
      enabled: true,
      configured: true,
      subtitleAllAreaPointsPerSecond: 2,
      subtitleSelAreaPointsPerSecond: 0,
      watermarkAllAreaPointsPerSecond: 0,
      watermarkSelAreaPointsPerSecond: 0
    },
    volcengine: { enabled: false, configured: false }
  }
  const est = estimateSubtitleEraseBilling({ totalSeconds: 10, config: cfg, mode: 'subtitle_all_area' })
  assert.equal(est.pointsCost, 20)
  assert.equal(est.channel, 'wuhenai')
})

test('estimateSubtitleEraseBilling uses picked channel rates', () => {
  const cfg = {
    enabled: true,
    priorityFirst: 'wuhenai',
    wuhenai: {
      enabled: true,
      configured: true,
      subtitleAllAreaPointsPerSecond: 1,
      subtitleSelAreaPointsPerSecond: 2,
      watermarkAllAreaPointsPerSecond: 3,
      watermarkSelAreaPointsPerSecond: 4
    },
    volcengine: {
      enabled: true,
      configured: true,
      standardPricePerMinute: 99,
      finePricePerMinute: 99,
      standardPointsPerSecond: 0,
      finePointsPerSecond: 0
    }
  }
  const est = estimateSubtitleEraseBilling({ totalSeconds: 10, config: cfg, mode: 'watermark_sel_area' })
  assert.equal(est.channel, 'wuhenai')
  assert.equal(est.pointsCost, 40)
  assert.equal(est.billingUnit, 'second')
})
