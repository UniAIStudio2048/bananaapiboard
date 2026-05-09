import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTimelineClips, getTimelineTotalSeconds } from './videoToolTimeline.js'

test('normalizes valid timeline clips', () => {
  const clips = normalizeTimelineClips([
    { url: 'https://cdn.example.com/a.mp4', startTime: 2, endTime: 7 },
    { url: 'https://cdn.example.com/b.mp4', startTime: 0, endTime: 5.5 }
  ])

  assert.equal(clips.length, 2)
  assert.equal(clips[0].duration, 5)
  assert.equal(clips[1].duration, 5.5)
  assert.equal(getTimelineTotalSeconds(clips), 10.5)
})

test('rejects invalid clip ranges', () => {
  assert.throws(
    () => normalizeTimelineClips([{ url: 'https://cdn.example.com/a.mp4', startTime: 7, endTime: 2 }]),
    /endTime must be greater/
  )
})
