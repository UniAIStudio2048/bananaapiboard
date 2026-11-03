import type { ImageLayer, Keyframe, VideoAnimatedField, VideoClip, VideoLayer, VideoTransform, VisualEffect } from './api'
import type { ClipboardDraft, ClipboardSelection } from './clipboard'
import { valueAt } from './keyframe-values'
import { mainImage } from './main-layer'
import { rippleDelete } from './ripple'
import { insertVisual, type TrackPosition } from './tracks'
import { validVideoTransform } from './video-keyframes'
import { validVisualEffects } from './visual-effects'
import { visualTracks } from './visual-order'

/** Move absolute-time image animation to the main image's source-time coordinate. */
function sourceKeys(points:Keyframe[],base:number,start:number,end:number,offset=0):Keyframe[] {
 const values=[{time:start,value:valueAt(base,points,start)},...points.filter(point=>point.time>start+.001&&point.time<end-.001),{time:end,value:valueAt(base,points,end)}],out:Keyframe[]=[]
 for(const point of values){const time=Math.round((point.time-start)*1000)/1000,value=point.value+offset,last=out.at(-1);if(last&&time-last.time<.001)out[out.length-1]={time,value};else out.push({time,value})}
 // Clipping may add two endpoints to an already sliced track. Remove only
 // redundant flat endpoints when necessary to stay within the 34-key limit.
 if(out.length>34&&out[0].value===out[1].value)out.shift()
 if(out.length>34&&out.at(-1)!.value===out.at(-2)!.value)out.pop()
 return out
}
function imageToClip(layer:ImageLayer):VideoClip|undefined {
 if(layer.is_sticker)return
 const keys:NonNullable<VideoTransform['keyframes']>={}
 for(const field of ['x','y','scale','rotation','opacity'] as VideoAnimatedField[]){const points=layer.keyframes?.[field];if(points?.length)keys[field]=sourceKeys(points,layer[field]??0,layer.start,layer.end,field==='x'||field==='y'?-.5:0)}
 const transform:VideoTransform={x:layer.x-.5,y:layer.y-.5,scale:layer.scale,rotation:layer.rotation??0,opacity:layer.opacity,...(Object.keys(keys).length?{keyframes:keys}:{})}
 const effects:VisualEffect[]|undefined=layer.effects?.map(effect=>({...effect,keyframes:effect.keyframes?.length?sourceKeys(effect.keyframes,effect.intensity,layer.start,layer.end):effect.keyframes}))
 if(!validVideoTransform(transform)||!validVisualEffects(effects))return
 return {resource_uuid:layer.resource_uuid,media_type:'image',start:0,end:layer.end-layer.start,rate:1,volume_db:0,hidden:layer.hidden,blend_mode:layer.blend_mode,transform,effects}
}
/** Move an overlay video or image to the end of the continuous main track. */
export function moveVisualToMain(state:ClipboardDraft,kind:'video'|'image',index:number,ripple:boolean,mainTrackHidden=Boolean(state.clips[0]?.track_hidden)):{draft:ClipboardDraft;selection:ClipboardSelection}|undefined {
 if(state.clips.length>=32)return
 const source=kind==='video'?state.videoLayers[index]:state.imageLayers[index];if(!source||![source.start,source.end].every(Number.isFinite)||source.start<0||source.end<=source.start||source.end>600)return
 if(kind==='video'){const video=source as VideoLayer;if(![video.source_start,video.rate,video.volume_db].every(Number.isFinite)||video.source_start<0||video.rate<.25||video.rate>4||video.volume_db< -60||video.volume_db>12||(video.transform&&!validVideoTransform(video.transform))||!validVisualEffects(video.effects))return}
 let clip:VideoClip|undefined
 if(kind==='video'){const video=source as VideoLayer;clip={resource_uuid:video.resource_uuid,start:video.source_start,end:video.source_start+(video.end-video.start)*video.rate,rate:video.rate,volume_db:video.volume_db,muted:video.muted,hidden:video.hidden,blend_mode:video.blend_mode,transform:video.transform,effects:video.effects}}
 else clip=imageToClip(source as ImageLayer)
 if(!clip||(clip.media_type==='image'&&clip.end>600)||state.clips.reduce((sum,item)=>sum+(item.end-item.start)/item.rate,0)+(clip.end-clip.start)/clip.rate>600)return
 let next:ClipboardDraft
 if(ripple){const changed=rippleDelete(state,{kind,index});if(!changed)return;next={...state,...changed}}
 else next=kind==='video'?{...state,videoLayers:state.videoLayers.filter((_,i)=>i!==index)}:{...state,imageLayers:state.imageLayers.filter((_,i)=>i!==index)}
 next={...next,clips:[...next.clips,{...clip,track_hidden:mainTrackHidden}]}
 return {draft:next,selection:{kind:'main',index:next.clips.length-1}}
}
/** Move a main clip to a visual track at the requested timeline position. */
export function moveMainToVisual(state:ClipboardDraft,index:number,start:number,id:string,targetKey?:string,position?:TrackPosition):{draft:ClipboardDraft;selection:ClipboardSelection}|undefined {
 const clip=state.clips[index];if(!clip||![start,clip.start,clip.end,clip.rate,clip.volume_db].every(Number.isFinite)||start<0||clip.start<0||clip.end<=clip.start||clip.rate<.25||clip.rate>4||clip.volume_db< -60||clip.volume_db>12||(clip.transform&&!validVideoTransform(clip.transform))||!validVisualEffects(clip.effects))return
 const end=start+(clip.end-clip.start)/clip.rate;if(end>600)return
 const kind=clip.media_type==='image'?'image':'video'
 if((kind==='image'?state.imageLayers.length:state.videoLayers.length)>=16)return
 const layer=kind==='image'?mainImage(clip,start):{resource_uuid:clip.resource_uuid,start,end,source_start:clip.start,rate:clip.rate,volume_db:clip.volume_db,muted:clip.muted,hidden:clip.hidden,blend_mode:clip.blend_mode,transform:clip.transform,effects:clip.effects} satisfies VideoLayer
 if(!layer)return
 const target=visualTracks(state.videoLayers,state.imageLayers,state.textLayers,state.effectLayers).find(track=>track.key===targetKey)
 const placed=insertVisual({videos:state.videoLayers,images:state.imageLayers,text:state.textLayers,effects:state.effectLayers},kind,layer,id,target?.refs[0],undefined,'target',position)
 const next={...state,clips:state.clips.filter((_,i)=>i!==index),videoLayers:placed.videos,imageLayers:placed.images,textLayers:placed.text,effectLayers:placed.effects??[]}
 return {draft:next,selection:{kind,index:(kind==='image'?next.imageLayers:next.videoLayers).length-1}}
}
