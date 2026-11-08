import type { EffectLayer, ImageLayer, TextLayer, VideoLayer } from './api'
export type VisualKind = 'video' | 'image' | 'text' | 'effect'
export interface VisualRef {kind:VisualKind;index:number;z:number;fallback:number}
export function validVisualZ(layer:{z_index?:number}):boolean {return layer.z_index===undefined || (Number.isSafeInteger(layer.z_index)&&layer.z_index>=0&&layer.z_index<=1000000000)}
/** Order from bottom to top, preserving the historical order of old drafts. */
export function orderedVisuals(videos:VideoLayer[],images:ImageLayer[],text:TextLayer[],effects:EffectLayer[]=[]):VisualRef[] {
 const refs:VisualRef[]=[]
 const add=(kind:VisualKind,index:number,group:number,z?:number)=>{const fallback=group*32+index;refs.push({kind,index,z:z??fallback,fallback})}
 videos.forEach((layer,i)=>add('video',i,0,layer.z_index));images.forEach((layer,i)=>add('image',i,1,layer.z_index));text.forEach((layer,i)=>add('text',i,2,layer.z_index));effects.forEach((layer,i)=>add('effect',i,3,layer.z_index))
 return refs.sort((a,b)=>a.z-b.z||a.fallback-b.fallback)
}
export interface VisualTrack {key:string;category:'video'|'text'|'effect'|'sticker';id?:string;z:number;refs:VisualRef[]}
/** Distinct legacy elements remain distinct tracks until grouped by an edit. */
export function visualTracks(videos:VideoLayer[],images:ImageLayer[],text:TextLayer[],effects:EffectLayer[]=[]):VisualTrack[] {
 const groups=new Map<string,VisualTrack>()
 for(const ref of orderedVisuals(videos,images,text,effects)){const item=ref.kind==='video'?videos[ref.index]:ref.kind==='image'?images[ref.index]:ref.kind==='text'?text[ref.index]:effects[ref.index],category=ref.kind==='text'?'text':ref.kind==='effect'?'effect':ref.kind==='image'&&(item as ImageLayer).is_sticker?'sticker':'video',key=item.track_id?`${category}:${item.track_id}`:`single:${ref.kind}:${ref.index}`;let track=groups.get(key);if(!track){track={key,category,id:item.track_id,z:ref.z,refs:[]};groups.set(key,track)}track.refs.push(ref)}
 return [...groups.values()]
}
export function nextVisualZ(videos:VideoLayer[],images:ImageLayer[],text:TextLayer[],effects:EffectLayer[]=[]):number {return Math.min(1000000000,Math.max(-1,...orderedVisuals(videos,images,text,effects).map(ref=>ref.z))+1)}
type VisualArrays = {videos:VideoLayer[];images:ImageLayer[];text:TextLayer[];effects:EffectLayer[]}
function placeVisual(videos:VideoLayer[],images:ImageLayer[],text:TextLayer[],effects:EffectLayer[],order:VisualTrack[],at:number,to:number):VisualArrays|undefined {
 if(at<0||to<0||at>=order.length||to>=order.length||at===to)return undefined
 const [item]=order.splice(at,1);order.splice(to,0,item)
 const next={videos:videos.slice(),images:images.slice(),text:text.slice(),effects:effects.slice()}
 order.forEach((track,z)=>track.refs.forEach(ref=>{if(ref.kind==='video')next.videos[ref.index]={...next.videos[ref.index],z_index:z};else if(ref.kind==='image')next.images[ref.index]={...next.images[ref.index],z_index:z};else if(ref.kind==='text')next.text[ref.index]={...next.text[ref.index],z_index:z};else next.effects[ref.index]={...next.effects[ref.index],z_index:z}}))
 return next
}
export function reorderVisuals(videos:VideoLayer[],images:ImageLayer[],text:TextLayer[],kind:VisualKind,index:number,direction:-1|1,effects:EffectLayer[]=[]):VisualArrays|undefined {
 const order=visualTracks(videos,images,text,effects),at=order.findIndex(track=>track.refs.some(item=>item.kind===kind&&item.index===index))
 return placeVisual(videos,images,text,effects,order,at,at+direction)
}
export function reorderVisualsTo(videos:VideoLayer[],images:ImageLayer[],text:TextLayer[],source:Pick<VisualRef,'kind'|'index'>,target:Pick<VisualRef,'kind'|'index'>,effects:EffectLayer[]=[]):VisualArrays|undefined {
 const order=visualTracks(videos,images,text,effects),at=order.findIndex(track=>track.refs.some(item=>item.kind===source.kind&&item.index===source.index)),to=order.findIndex(track=>track.refs.some(item=>item.kind===target.kind&&item.index===target.index))
 return placeVisual(videos,images,text,effects,order,at,to)
}
