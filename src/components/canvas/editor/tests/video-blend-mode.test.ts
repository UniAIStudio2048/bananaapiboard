import test from 'node:test'
import assert from 'node:assert/strict'
import { blendModes, canvasBlend, validBlendMode } from '../blend-mode'
import { copyTimelineItems, pasteTimelineItems, type ClipboardDraft } from '../clipboard'
import { duplicateTimelineItems } from '../duplicate'
import { moveMainToVisual, moveVisualToMain } from '../track-transfer'

function fixture():ClipboardDraft {
 return {clips:[{resource_uuid:'v',start:0,end:2,rate:1,volume_db:0,blend_mode:'multiply'}, {resource_uuid:'i',media_type:'image',start:0,end:2,rate:1,volume_db:0,blend_mode:'screen'}],videoLayers:[],imageLayers:[],textLayers:[],audioLayers:[],effectLayers:[]}
}
test('blend catalog validates all supported modes and maps additive mode to Canvas',()=>{
 assert.equal(blendModes.length,17)
 for(const [mode] of blendModes)assert.equal(validBlendMode(mode),true)
 assert.equal(validBlendMode(undefined),true);assert.equal(validBlendMode('lighter'),false);assert.equal(validBlendMode('bogus'),false)
 assert.equal(canvasBlend('normal'),'source-over');assert.equal(canvasBlend('plus-lighter'),'lighter')
})
test('blend survives copying, duplicating and moving video and images between tracks',()=>{
 const state=fixture(), selections=[{kind:'main' as const,index:0},{kind:'main' as const,index:1}]
 const pasted=pasteTimelineItems(state,copyTimelineItems(state,selections),4,()=>crypto.randomUUID())!
 assert.equal(pasted.draft.videoLayers[0].blend_mode,'multiply');assert.equal(pasted.draft.imageLayers[0].blend_mode,'screen')
 const duplicated=duplicateTimelineItems(state,selections,()=>crypto.randomUUID())!
 assert.equal(duplicated.draft.videoLayers[0].blend_mode,'multiply');assert.equal(duplicated.draft.imageLayers[0].blend_mode,'screen')
 const movedVideo=moveMainToVisual(state,0,0,'video')!,restoredVideo=moveVisualToMain(movedVideo.draft,'video',0,false)!
 assert.equal(restoredVideo.draft.clips.at(-1)?.blend_mode,'multiply')
 const movedImage=moveMainToVisual(state,1,0,'image')!,restoredImage=moveVisualToMain(movedImage.draft,'image',0,false)!
 assert.equal(restoredImage.draft.clips.at(-1)?.blend_mode,'screen')
})
