import { MAX_TEXT_LAYERS, type AudioLayer, type EffectLayer, type ImageLayer, type TextLayer, type VideoClip, type VideoLayer } from './api'
import { shiftTimelineLayer, type RippleKind, type RippleLayer } from './ripple'
import { audioTracks, insertAudio, insertVisual, type VisualLayer } from './tracks'
import { visualTracks, type VisualRef } from './visual-order'
import { mainImage } from './main-layer'

export type ClipboardKind='main'|RippleKind
export type ClipboardLayer=VideoClip|RippleLayer
export type ClipboardItem={kind:ClipboardKind;layer:ClipboardLayer;start:number;group:string;sourceIndex:number}
export type ClipboardDraft={clips:VideoClip[];videoLayers:VideoLayer[];imageLayers:ImageLayer[];textLayers:TextLayer[];effectLayers:EffectLayer[];audioLayers:AudioLayer[]}
export type ClipboardSelection={kind:ClipboardKind;index:number}
export function copyTimelineItems(state:ClipboardDraft,selection:ClipboardSelection[]):ClipboardItem[] {
 const visuals=visualTracks(state.videoLayers,state.imageLayers,state.textLayers,state.effectLayers),sounds=audioTracks(state.audioLayers)
 const boundaries=state.clips.reduce<number[]>((result,clip)=>[...result,(result.at(-1)??0)+(clip.end-clip.start)/clip.rate],[0])
 return selection.flatMap(({kind,index})=>{
  const layer=kind==='main'?state.clips[index]:kind==='video'?state.videoLayers[index]:kind==='image'?state.imageLayers[index]:kind==='text'?state.textLayers[index]:kind==='effect'?state.effectLayers[index]:state.audioLayers[index]
  if(!layer)return []
  const group=kind==='main'?'main':kind==='audio'?sounds.find(track=>track.indices.includes(index))?.key:visuals.find(track=>track.refs.some(ref=>ref.kind===kind&&ref.index===index))?.key
  if(!group)return []
  return [{kind,layer:structuredClone(layer),start:kind==='main'?boundaries[index]:layer.start,group,sourceIndex:index}]
 })
}
/** Paste each copied track atomically at the playhead, preserving relative time. */
export function pasteTimelineItems(state:ClipboardDraft,items:ClipboardItem[],at:number,newId:()=>string):{draft:ClipboardDraft;selection:ClipboardSelection[]}|undefined {
 if(!items.length||!Number.isFinite(at)||at<0||at>600)return
 if(items.some(item=>!Number.isFinite(item.start)||!Number.isFinite(item.layer.start)||!Number.isFinite(item.layer.end)||item.layer.end<=item.layer.start||(item.kind==='main'&&(!Number.isFinite((item.layer as VideoClip).rate)||(item.layer as VideoClip).rate<=0))))return
 const minStart=Math.min(...items.map(item=>item.start))
 type Prepared={kind:RippleKind;layer:RippleLayer;group:string;main:boolean;sourceKind:ClipboardKind;sourceIndex:number}
 const prepared:Prepared[]=[]
 for(const item of items){
  const start=at+(item.start-minStart)
  if(item.kind==='main'){
   const clip=item.layer as VideoClip,end=start+(clip.end-clip.start)/clip.rate;if(start<0||end>600)return
   if(clip.media_type==='image'){const layer=mainImage(clip,start);if(!layer)return;prepared.push({kind:'image',layer,group:item.group,main:true,sourceKind:item.kind,sourceIndex:item.sourceIndex})}
   else prepared.push({kind:'video',layer:{resource_uuid:clip.resource_uuid,start,end,source_start:clip.start,rate:clip.rate,volume_db:clip.volume_db,muted:clip.muted,blend_mode:clip.blend_mode,transform:clip.transform,effects:clip.effects,hidden:clip.hidden},group:item.group,main:true,sourceKind:item.kind,sourceIndex:item.sourceIndex})
  }else {const moved=shiftTimelineLayer(item.layer as RippleLayer,item.kind,start-item.layer.start);if(!moved)return;prepared.push({kind:item.kind,layer:moved,group:item.group,main:false,sourceKind:item.kind,sourceIndex:item.sourceIndex})}
 }
 const counts={video:state.videoLayers.length,image:state.imageLayers.length,text:state.textLayers.length,effect:state.effectLayers.length,audio:state.audioLayers.length}
 for(const item of prepared)if(++counts[item.kind]>(item.kind==='text'?MAX_TEXT_LAYERS:16))return
 const grouped=new Map<string,Prepared[]>()
 for(const item of prepared){const group=grouped.get(item.group)??[];group.push(item);grouped.set(item.group,group)}
 let next:ClipboardDraft={...state,clips:state.clips.slice(),videoLayers:state.videoLayers.slice(),imageLayers:state.imageLayers.slice(),textLayers:state.textLayers.slice(),effectLayers:state.effectLayers.slice(),audioLayers:state.audioLayers.slice()}
 const selected:ClipboardSelection[]=[]
 for(const [key,group] of grouped){
  const ordered=group.slice().sort((a,b)=>a.layer.start-b.layer.start),audio=ordered[0].kind==='audio'
  if(ordered.some(item=>(item.kind==='audio')!==audio))return
  if(ordered.some((item,index)=>index>0&&item.layer.start<ordered[index-1].layer.end-1e-5))return
  const fits=(layers:{start:number;end:number}[])=>ordered.every(item=>layers.every(other=>item.layer.start>=other.end-1e-5||item.layer.end<=other.start+1e-5))
  const id=newId()
  if(audio){
   const tracks=audioTracks(next.audioLayers),source=tracks.findIndex(track=>track.key===key||track.indices.includes(ordered[0].sourceIndex)),candidate=source>=0?tracks[source-1]:tracks[0],target=candidate&&fits(candidate.indices.map(i=>next.audioLayers[i]))?candidate:undefined
   const position=source>=0?{anchorKey:tracks[source].key,side:'above' as const,edge:'top' as const}:undefined
   let preferred=target?.indices[0]
   for(const item of ordered){next.audioLayers=insertAudio(next.audioLayers,item.layer as AudioLayer,id,preferred,undefined,'target',position);const index=next.audioLayers.length-1;preferred=index;selected.push({kind:'audio',index})}
   continue
  }
  const tracks=visualTracks(next.videoLayers,next.imageLayers,next.textLayers,next.effectLayers),source=tracks.findIndex(track=>track.key===key||(!ordered[0].main&&track.refs.some(ref=>ref.kind===ordered[0].sourceKind&&ref.index===ordered[0].sourceIndex))),main=ordered[0].main
  const category=ordered[0].kind==='text'?'text':ordered[0].kind==='effect'?'effect':ordered[0].kind==='image'&&(ordered[0].layer as ImageLayer).is_sticker?'sticker':'video'
  if(ordered.some(item=>(item.kind==='text'?'text':item.kind==='effect'?'effect':item.kind==='image'&&(item.layer as ImageLayer).is_sticker?'sticker':'video')!==category))return
  const candidate=main?tracks[0]:source>=0?tracks[source+1]:tracks.slice().reverse().find(track=>track.category===category)
  const layers=(candidate?.refs??[]).map(ref=>ref.kind==='video'?next.videoLayers[ref.index]:ref.kind==='image'?next.imageLayers[ref.index]:ref.kind==='text'?next.textLayers[ref.index]:next.effectLayers[ref.index])
  const target=candidate?.category===category&&fits(layers)?candidate:undefined
  const position=main&&tracks[0]?{anchorKey:tracks[0].key,side:'below' as const,edge:'bottom' as const}:source>=0?{anchorKey:tracks[source].key,side:'above' as const,edge:'top' as const}:undefined
  let preferred:Pick<VisualRef,'kind'|'index'>|undefined=target?.refs[0]
  for(const item of ordered){
   const placed=insertVisual({videos:next.videoLayers,images:next.imageLayers,text:next.textLayers,effects:next.effectLayers},item.kind as Exclude<RippleKind,'audio'>,item.layer as VisualLayer,id,preferred,undefined,'target',position)
   next={...next,videoLayers:placed.videos,imageLayers:placed.images,textLayers:placed.text,effectLayers:placed.effects??[]}
   const list=item.kind==='video'?next.videoLayers:item.kind==='image'?next.imageLayers:item.kind==='text'?next.textLayers:next.effectLayers,index=list.length-1
   preferred={kind:item.kind as Exclude<RippleKind,'audio'>,index};selected.push({kind:item.kind,index})
  }
 }
 return {draft:next,selection:selected}
}
