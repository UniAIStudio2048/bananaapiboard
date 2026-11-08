import { MAX_TEXT_LAYERS, type VideoClip, type VideoLayer } from './api'
import { copyTimelineItems, type ClipboardDraft, type ClipboardSelection } from './clipboard'
import { mainImage } from './main-layer'
import { audioTracks, insertAudio, insertVisual, type VisualLayer } from './tracks'
import { visualTracks, type VisualKind, type VisualRef } from './visual-order'

/** Duplicate to new tracks at the same times, keeping each source track together. */
export function duplicateTimelineItems(state:ClipboardDraft,selection:ClipboardSelection[],newId:()=>string):{draft:ClipboardDraft;selection:ClipboardSelection[]}|undefined {
 const unique=[...new Map(selection.map(ref=>[`${ref.kind}:${ref.index}`,ref])).values()],items=copyTimelineItems(state,unique)
 if(!items.length||items.length!==unique.length)return
 const counts={video:state.videoLayers.length,image:state.imageLayers.length,text:state.textLayers.length,effect:state.effectLayers.length,audio:state.audioLayers.length}
 for(const entry of items){const kind=entry.kind==='main'?((entry.layer as VideoClip).media_type==='image'?'image':'video'):entry.kind;if(++counts[kind]>(kind==='text'?MAX_TEXT_LAYERS:16))return}
 let next:ClipboardDraft={...state,clips:state.clips.slice(),videoLayers:state.videoLayers.slice(),imageLayers:state.imageLayers.slice(),textLayers:state.textLayers.slice(),effectLayers:state.effectLayers.slice(),audioLayers:state.audioLayers.slice()}
 const mapped=new Map<string,string>(),selected:ClipboardSelection[]=[]
 for(const entry of items.sort((a,b)=>a.start-b.start)){
  let kind:VisualKind|'audio',layer:VisualLayer|import('./api').AudioLayer
  if(entry.kind==='main'){
   const clip=entry.layer as VideoClip,end=entry.start+(clip.end-clip.start)/clip.rate
   if(clip.media_type==='image'){kind='image';const image=mainImage(clip,entry.start);if(!image)return;layer=image}
   else {kind='video';layer={resource_uuid:clip.resource_uuid,start:entry.start,end,source_start:clip.start,rate:clip.rate,volume_db:clip.volume_db,muted:clip.muted,blend_mode:clip.blend_mode,transform:clip.transform,effects:clip.effects,hidden:clip.hidden} satisfies VideoLayer}
  }else {kind=entry.kind;layer=entry.layer as VisualLayer|import('./api').AudioLayer}
  const id=mapped.get(entry.group),newTrack=id??newId()
  if(kind==='audio'){
   const groups=audioTracks(next.audioLayers),source=groups.find(track=>track.key===entry.group),destination=groups.find(track=>track.id===id)
   next.audioLayers=insertAudio(next.audioLayers,layer as import('./api').AudioLayer,newTrack,destination?.indices[0],undefined,'target',source?{anchorKey:source.key,side:'above',edge:'top'}:undefined)
   const index=next.audioLayers.length-1;mapped.set(entry.group,next.audioLayers[index].track_id!);selected.push({kind,index});continue
  }
  const groups=visualTracks(next.videoLayers,next.imageLayers,next.textLayers,next.effectLayers),source=groups.find(track=>track.key===entry.group),destination=groups.find(track=>track.id===id),preferred:Pick<VisualRef,'kind'|'index'>|undefined=destination?.refs[0]
  const placed=insertVisual({videos:next.videoLayers,images:next.imageLayers,text:next.textLayers,effects:next.effectLayers},kind,layer as VisualLayer,newTrack,preferred,undefined,'target',source?{anchorKey:source.key,side:'above',edge:'top'}:undefined)
  next={...next,videoLayers:placed.videos,imageLayers:placed.images,textLayers:placed.text,effectLayers:placed.effects??[]}
  const list=kind==='video'?next.videoLayers:kind==='image'?next.imageLayers:kind==='text'?next.textLayers:next.effectLayers,index=list.length-1
  mapped.set(entry.group,list[index].track_id!);selected.push({kind,index})
 }
 return {draft:next,selection:selected}
}
