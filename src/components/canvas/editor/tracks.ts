import type { AudioLayer, EffectLayer, ImageLayer, TextLayer, VideoLayer } from './api'
import { nextVisualZ, visualTracks, type VisualKind, type VisualRef, type VisualTrack } from './visual-order'

export type VisualLayer=VideoLayer|ImageLayer|TextLayer|EffectLayer
export interface AudioTrack { key:string; id?:string; indices:number[] }
export interface TrackPosition { anchorKey?:string; side:'above'|'below'; edge:'top'|'bottom' }
export type VisualArrays={videos:VideoLayer[];images:ImageLayer[];text:TextLayer[];effects?:EffectLayer[]}
export const validTrackOrder=(value:AudioLayer)=>value.track_order===undefined || (Number.isSafeInteger(value.track_order)&&value.track_order>=0&&value.track_order<=1000000000)
export const validTrackId=(value:{track_id?:string})=>value.track_id===undefined || (typeof value.track_id==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value.track_id))
export function newTrackId():string {return globalThis.crypto?.randomUUID?.() ?? `track-${Date.now()}-${Math.random().toString(36).slice(2)}`}
export function visualItem(state:VisualArrays,ref:Pick<VisualRef,'kind'|'index'>):VisualLayer {return ref.kind==='video'?state.videos[ref.index]:ref.kind==='image'?state.images[ref.index]:ref.kind==='text'?state.text[ref.index]:state.effects![ref.index]}
const visualTrackMuted=(item:VisualLayer)=>'track_muted' in item && item.track_muted===true
export function audioTracks(layers:AudioLayer[]):AudioTrack[] {
 const groups=new Map<string,AudioTrack>()
 layers.forEach((layer,index)=>{const key=layer.track_id?`audio:${layer.track_id}`:`single:audio:${index}`;let group=groups.get(key);if(!group){group={key,id:layer.track_id,indices:[]};groups.set(key,group)}group.indices.push(index)})
 return [...groups.values()].sort((a,b)=>(layers[a.indices[0]].track_order??a.indices[0])-(layers[b.indices[0]].track_order??b.indices[0])||a.indices[0]-b.indices[0])
}
const fits=(start:number,end:number,items:{start:number;end:number}[])=>items.every(item=>start>=item.end-.00001 || end<=item.start+.00001)
function put(state:VisualArrays,ref:Pick<VisualRef,'kind'|'index'>,change:Partial<VisualLayer>) {if(ref.kind==='video')state.videos[ref.index]={...state.videos[ref.index],...change};else if(ref.kind==='image')state.images[ref.index]={...state.images[ref.index],...change};else if(ref.kind==='text')state.text[ref.index]={...state.text[ref.index],...change};else state.effects![ref.index]={...state.effects![ref.index],...change}}
/** Position new visual tracks using the same bottom-to-top z order as preview and export. */
function placeVisualTrack(state:VisualArrays,id:string,position?:TrackPosition):VisualArrays {
 if(!position)return state
 const groups=visualTracks(state.videos,state.images,state.text,state.effects),at=groups.findIndex(group=>group.id===id);if(at<0)return state
 const [inserted]=groups.splice(at,1),anchor=groups.findIndex(group=>group.key===position.anchorKey)
 const index=anchor<0?(position.edge==='top'?groups.length:0):anchor+(position.side==='above'?1:0)
 groups.splice(index,0,inserted)
 const next={videos:state.videos.slice(),images:state.images.slice(),text:state.text.slice(),effects:(state.effects??[]).slice()}
 groups.forEach((group,z)=>group.refs.forEach(ref=>put(next,ref,{z_index:z})))
 return next
}
/** Audio order is editor-only; export preserves each clip's original mix settings. */
function placeAudioTrack(layers:AudioLayer[],id:string,position?:TrackPosition):AudioLayer[] {
 const groups=audioTracks(layers),at=groups.findIndex(group=>group.id===id);if(at<0)return layers
 const [inserted]=groups.splice(at,1),anchor=groups.findIndex(group=>group.key===position?.anchorKey)
 const index=!position?at:anchor<0?(position.edge==='top'?0:groups.length):anchor+(position.side==='below'?1:0)
 groups.splice(index,0,inserted)
 const next=layers.slice();groups.forEach((group,order)=>group.indices.forEach(index=>{next[index]={...next[index],track_order:order}}));return next
}
/** Reference auto-placement reuses the first compatible track without a time overlap. */
export function insertVisual(state:VisualArrays,kind:VisualKind,item:VisualLayer,id:string,preferred?:Pick<VisualRef,'kind'|'index'>,insertAt?:number,placement:'auto'|'target'='auto',position?:TrackPosition):VisualArrays {
 const tracks=visualTracks(state.videos,state.images,state.text,state.effects),category=kind==='text'?'text':kind==='effect'?'effect':kind==='image'&&(item as ImageLayer).is_sticker?'sticker':'video',eligible=(track:VisualTrack)=>track.category===category && fits(item.start,item.end,track.refs.map(ref=>visualItem(state,ref)))
 const preferredTrack=preferred?tracks.find(track=>track.refs.some(ref=>ref.kind===preferred.kind&&ref.index===preferred.index)):undefined
 const target=preferredTrack&&eligible(preferredTrack)?preferredTrack:placement==='target'?undefined:tracks.slice().reverse().find(eligible)
 const next={videos:state.videos.slice(),images:state.images.slice(),text:state.text.slice(),effects:(state.effects??[]).slice()}
 let placed:VisualLayer
 if(target){const trackId=target.id??id,first=visualItem(state,target.refs[0]),mute=target.category==='video'?{track_muted:visualTrackMuted(first)}:{};for(const ref of target.refs)put(next,ref,{track_id:trackId,z_index:target.z,track_hidden:Boolean(first.track_hidden),...mute});placed={...item,track_id:trackId,z_index:target.z,track_hidden:Boolean(first.track_hidden),...mute}}
 else placed={...item,track_id:id,z_index:nextVisualZ(state.videos,state.images,state.text,state.effects),track_hidden:false,...(category==='video'?{track_muted:false}:{})}
 if(kind==='video')next.videos.splice(insertAt??next.videos.length,0,placed as VideoLayer)
 else if(kind==='image')next.images.splice(insertAt??next.images.length,0,placed as ImageLayer)
 else if(kind==='text')next.text.splice(insertAt??next.text.length,0,placed as TextLayer)
 else next.effects.splice(insertAt??next.effects.length,0,placed as EffectLayer)
 return target?next:placeVisualTrack(next,id,position)
}
export function insertAudio(layers:AudioLayer[],item:AudioLayer,id:string,preferredIndex?:number,insertAt?:number,placement:'auto'|'target'='auto',position?:TrackPosition):AudioLayer[] {
 const groups=audioTracks(layers),eligible=(track:AudioTrack)=>fits(item.start,item.end,track.indices.map(index=>layers[index]))
 const preferred=preferredIndex===undefined?undefined:groups.find(track=>track.indices.includes(preferredIndex)),target=preferred&&eligible(preferred)?preferred:placement==='target'?undefined:groups.find(eligible),next=layers.slice()
 let placed:AudioLayer
 if(target){const trackId=target.id??id,muted=Boolean(layers[target.indices[0]].track_muted),order=layers[target.indices[0]].track_order;for(const index of target.indices)next[index]={...next[index],track_id:trackId,track_order:order,track_muted:muted};placed={...item,track_id:trackId,track_order:order,track_muted:muted}}
 else placed={...item,track_id:id,track_order:undefined,track_muted:false}
 next.splice(insertAt??next.length,0,placed);return target?next:placeAudioTrack(next,id,position)
}

/** Move one clip atomically; an occupied or incompatible destination gets a new track. */
export function moveVisualItem(state:VisualArrays,ref:Pick<VisualRef,'kind'|'index'>,updated:VisualLayer,id:string,targetKey?:string,position?:TrackPosition):VisualArrays|undefined {
 const current=visualItem(state,ref);if(!current)return undefined
 const groups=visualTracks(state.videos,state.images,state.text,state.effects),source=groups.find(group=>group.refs.some(item=>item.kind===ref.kind&&item.index===ref.index));if(!source)return undefined
 const category=source.category,requested=targetKey===undefined?source:groups.find(group=>group.key===targetKey),target=requested?.category===category?requested:undefined
 const available=target&&fits(updated.start,updated.end,target.refs.filter(member=>member.kind!==ref.kind||member.index!==ref.index).map(member=>visualItem(state,member)))
 const next={videos:state.videos.slice(),images:state.images.slice(),text:state.text.slice(),effects:(state.effects??[]).slice()}
 if(available&&target){
  if(target.key===source.key)put(next,ref,updated)
  else {const trackId=target.id??id,first=visualItem(state,target.refs[0]),mute=target.category==='video'?{track_muted:visualTrackMuted(first)}:{};for(const member of target.refs)put(next,member,{track_id:trackId,z_index:target.z,track_hidden:Boolean(first.track_hidden),...mute});put(next,ref,{...updated,track_id:trackId,z_index:target.z,track_hidden:Boolean(first.track_hidden),...mute})}
 }else {put(next,ref,{...updated,track_id:id,z_index:nextVisualZ(state.videos,state.images,state.text,state.effects),track_hidden:false,...(category==='video'?{track_muted:false}:{})});return placeVisualTrack(next,id,position)}
 return next
}
export function moveAudioItem(layers:AudioLayer[],index:number,updated:AudioLayer,id:string,targetKey?:string,position?:TrackPosition):AudioLayer[]|undefined {
 if(!layers[index])return undefined
 const groups=audioTracks(layers),source=groups.find(group=>group.indices.includes(index));if(!source)return undefined
 const target=targetKey===undefined?source:groups.find(group=>group.key===targetKey),available=target&&fits(updated.start,updated.end,target.indices.filter(i=>i!==index).map(i=>layers[i])),next=layers.slice()
 if(available&&target){
  if(target.key===source.key)next[index]=updated
  else {const trackId=target.id??id,muted=Boolean(layers[target.indices[0]].track_muted),order=layers[target.indices[0]].track_order;for(const member of target.indices)next[member]={...next[member],track_id:trackId,track_order:order,track_muted:muted};next[index]={...updated,track_id:trackId,track_order:order,track_muted:muted}}
 }else {next[index]={...updated,track_id:id,track_order:undefined,track_muted:false};return placeAudioTrack(next,id,position)}
 return next
}
