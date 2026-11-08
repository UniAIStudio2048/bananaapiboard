import type { AudioLayer, EffectLayer, ImageLayer, TextLayer, VideoLayer } from './api'
import { sliceImageLayer } from './image-keyframes'
import { sliceTextLayer } from './text-keyframes'
import { moveTimelineLayer, splitTimelineLayer } from './TimelineLayer'
import { audioTracks } from './tracks'
import { visualTracks, type VisualRef } from './visual-order'

export type RippleKind='video'|'image'|'text'|'effect'|'audio'
export type RippleLayer=VideoLayer|ImageLayer|TextLayer|EffectLayer|AudioLayer
export type RippleRef={kind:RippleKind;index:number}
export interface RippleDraft {videoLayers:VideoLayer[];imageLayers:ImageLayer[];textLayers:TextLayer[];effectLayers:EffectLayer[];audioLayers:AudioLayer[]}
const item=(state:RippleDraft,ref:RippleRef):RippleLayer|undefined=>ref.kind==='video'?state.videoLayers[ref.index]:ref.kind==='image'?state.imageLayers[ref.index]:ref.kind==='text'?state.textLayers[ref.index]:ref.kind==='effect'?state.effectLayers[ref.index]:state.audioLayers[ref.index]
function members(state:RippleDraft,ref:RippleRef):RippleRef[] {
 if(ref.kind==='audio')return audioTracks(state.audioLayers).find(track=>track.indices.includes(ref.index))?.indices.map(index=>({kind:'audio',index}))??[]
 return visualTracks(state.videoLayers,state.imageLayers,state.textLayers,state.effectLayers).find(track=>track.refs.some(value=>value.kind===ref.kind&&value.index===ref.index))?.refs.map(({kind,index}:VisualRef)=>({kind,index}))??[]
}
export function shiftTimelineLayer(layer:RippleLayer,kind:RippleKind,delta:number):RippleLayer|undefined {
 if(layer.start+delta < -1e-7 || layer.end+delta>600+1e-7)return undefined
 const moved=moveTimelineLayer(layer,'move',delta,undefined,false)
 if(Math.abs(moved.start-(layer.start+delta))<1e-7)return moved
 // Boundary keys outside the visible clip cannot be shifted past the timeline;
 // preserve the interpolated visible values instead of moving the clip partly.
 if(kind==='text')return sliceTextLayer(layer as TextLayer,layer.start,layer.end,-delta)
 if(kind==='image')return sliceImageLayer(layer as ImageLayer,layer.start,layer.end,-delta)
 return undefined
}
function clone(state:RippleDraft):RippleDraft {return {...state,videoLayers:state.videoLayers.slice(),imageLayers:state.imageLayers.slice(),textLayers:state.textLayers.slice(),effectLayers:state.effectLayers.slice(),audioLayers:state.audioLayers.slice()}}
function set(state:RippleDraft,ref:RippleRef,value:RippleLayer){if(ref.kind==='video')state.videoLayers[ref.index]=value as VideoLayer;else if(ref.kind==='image')state.imageLayers[ref.index]=value as ImageLayer;else if(ref.kind==='text')state.textLayers[ref.index]=value as TextLayer;else if(ref.kind==='effect')state.effectLayers[ref.index]=value as EffectLayer;else state.audioLayers[ref.index]=value as AudioLayer}
function shiftAfter(original:RippleDraft,next:RippleDraft,refs:RippleRef[],skip:RippleRef,after:number,delta:number):boolean {
 for(const ref of refs){if(ref.kind===skip.kind&&ref.index===skip.index)continue;const value=item(original,ref);if(!value||value.start<after-1e-7)continue;const moved=shiftTimelineLayer(value,ref.kind,delta);if(!moved)return false;set(next,ref,moved)}
 return true
}
/** Ripple edits move only later members of the selected track and are atomic. */
export function rippleDelete(state:RippleDraft,ref:RippleRef):RippleDraft|undefined {
 const current=item(state,ref),refs=members(state,ref);if(!current||!refs.length)return
 const next=clone(state);if(!shiftAfter(state,next,refs,ref,current.end,current.start-current.end))return
 if(ref.kind==='video')next.videoLayers.splice(ref.index,1);else if(ref.kind==='image')next.imageLayers.splice(ref.index,1);else if(ref.kind==='text')next.textLayers.splice(ref.index,1);else if(ref.kind==='effect')next.effectLayers.splice(ref.index,1);else next.audioLayers.splice(ref.index,1)
 return next
}
export function rippleTrim(state:RippleDraft,ref:RippleRef,updated:RippleLayer):RippleDraft|undefined {
 const current=item(state,ref),refs=members(state,ref);if(!current||!refs.length||![updated.start,updated.end].every(Number.isFinite)||updated.start<0||updated.end>600||updated.end-updated.start<.05-1e-7)return
 const previousEnd=Math.max(0,...refs.filter(value=>value.kind!==ref.kind||value.index!==ref.index).map(value=>item(state,value)!).filter(value=>value.end<=current.start+1e-7).map(value=>value.end))
 if(updated.start<previousEnd-1e-7)return
 const next=clone(state);if(!shiftAfter(state,next,refs,ref,current.end,updated.end-current.end))return;set(next,ref,updated);return next
}
export function rippleKeepRight(state:RippleDraft,ref:RippleRef,time:number):RippleDraft|undefined {
 const current=item(state,ref),refs=members(state,ref);if(!current||!refs.length||time<=current.start+.05||time>=current.end-.05)return
 const right=splitTimelineLayer(current,time,'right')[0],delta=current.start-time,moved=shiftTimelineLayer(right,ref.kind,delta),next=clone(state)
 if(!moved||!shiftAfter(state,next,refs,ref,current.end,delta))return
 set(next,ref,moved);return next
}
