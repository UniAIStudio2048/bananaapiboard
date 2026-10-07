import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeWorkflowForSave } from './workflowSaveSanitizer.js'

test('saving during skeleton rendering persists original media in canonical fields', () => {
  const saved = sanitizeWorkflowForSave({ nodes: [{ id: 'media', type: 'image', data: {
    _mediaLoading: true, sourceImages: [], output: { url: null, urls: [] },
    _originalMedia: { sourceImages: ['https://example.com/source.png'], output: { url: 'https://example.com/result.png', urls: ['https://example.com/result.png'] } }
  } }], edges: [] })
  assert.deepEqual(saved.nodes[0].data.sourceImages, ['https://example.com/source.png'])
  assert.equal(saved.nodes[0].data.output.url, 'https://example.com/result.png')
  assert.equal('_originalMedia' in saved.nodes[0].data, false)
  assert.equal('_mediaLoading' in saved.nodes[0].data, false)
})

test('an unloaded shell cannot be exported as an empty persistent media node', () => {
  assert.throws(() => sanitizeWorkflowForSave({ nodes: [{ id: 'unloaded', data: { _shellLoading: true } }] }), /尚未加载/)
})
