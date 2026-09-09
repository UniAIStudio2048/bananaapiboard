import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeTimelineClips, getClipDuration, timelineTimeToSource,
  sourceTimeToTimeline, splitTimelineClip, getSplitDisabledReason,
  buildVideoEditDraft, restoreVideoEditDraft, selectedExportClips
} from './videoToolTimeline.js'

const source = { id: 'a', url: 'https://example.com/a.mp4', startTime: 2, endTime: 10, sourceDuration: 12, playbackRate: 2, volumeDb: -6 }

test('normalization calculates output duration and validates property boundaries', () => {
  assert.equal(normalizeTimelineClips([source])[0].duration, 4)
  assert.equal(getClipDuration(source), 4)
  for (const playbackRate of [0, -1, 0.24, 4.01, NaN, Infinity, '']) {
    assert.throws(() => normalizeTimelineClips([{ ...source, playbackRate }]), /playbackRate/)
  }
  for (const volumeDb of [-61, 13, NaN, Infinity, '']) {
    assert.throws(() => normalizeTimelineClips([{ ...source, volumeDb }]), /volumeDb/)
  }
})

test('time conversion respects preceding clips and playback rate', () => {
  const clips = [{ ...source, id: 'previous', playbackRate: 1 }, source]
  assert.deepEqual(timelineTimeToSource(clips, 10), { clipIndex: 1, localTime: 6 })
  assert.equal(sourceTimeToTimeline(clips, 1, 6), 10)
})

test('split preserves independent properties and selects the right fragment', () => {
  const next = { ...source, id: 'b' }
  const result = splitTimelineClip([source, next], 'a', 1.5, 'split')
  assert.equal(result.clips.length, 3)
  assert.equal(result.clips[0].endTime, 5)
  assert.equal(result.clips[1].startTime, 5)
  assert.equal(result.clips[1].volumeDb, -6)
  assert.equal(result.clips[0].duration, 1.5)
  assert.equal(result.clips[1].duration, 2.5)
  assert.notEqual(result.clips[0].id, result.clips[1].id)
  assert.equal(result.selectedClipId, result.clips[1].id)
  assert.deepEqual(result.clips[2], next)
  assert.equal(source.endTime, 10)
})

test('left and right remove only the corresponding part of the selected clip', () => {
  const left = splitTimelineClip([source], 'a', 1.5, 'left')
  const right = splitTimelineClip([source], 'a', 1.5, 'right')
  assert.deepEqual([left.clips[0].startTime, left.clips[0].endTime], [5, 10])
  assert.deepEqual([right.clips[0].startTime, right.clips[0].endTime], [2, 5])
})

test('split rejects unconfirmed metadata, boundaries and short results', () => {
  for (const time of [0, 0.01, 3.99, 4, 5]) {
    assert.ok(getSplitDisabledReason([source], 'a', time, 'split'))
  }
  assert.ok(getSplitDisabledReason([{ ...source, sourceDuration: null }], 'a', 1, 'split'))
  assert.ok(getSplitDisabledReason([source], 'missing', 1, 'split'))
  assert.equal(getSplitDisabledReason([source], 'a', 1, 'split'), '')
  assert.throws(() => splitTimelineClip([source], 'a', 0, 'split'))
})

test('draft restores empty timelines and rejects different source identities', () => {
  const draft = buildVideoEditDraft(source.url, [source], source.id)
  assert.equal(restoreVideoEditDraft(draft, source.url).selectedClipId, 'a')
  assert.equal(restoreVideoEditDraft(draft, 'https://example.com/new.mp4'), null)
  assert.deepEqual(restoreVideoEditDraft(buildVideoEditDraft(source.url, [], null), source.url).clips, [])
  assert.notEqual(draft.clips[0], source)
})

test('export snapshots only the selected clip and rejects missing selections', () => {
  const result = selectedExportClips([source, { ...source, id: 'b' }], 'b')
  assert.equal(result.length, 1)
  assert.equal(result[0].id, 'b')
  result[0].volumeDb = 3
  assert.equal(source.volumeDb, -6)
  assert.throws(() => selectedExportClips([source], null), /选择/)
})
