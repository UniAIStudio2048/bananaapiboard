import { MAX_TEXT_LAYERS, splitClip } from './api'
import type { ClipboardDraft, ClipboardSelection } from './clipboard'
import { splitTimelineLayer } from './TimelineLayer'
import { visualTracks } from './visual-order'
import { rippleDelete, rippleKeepRight } from './ripple'

/** Apply bulk deletion as one transaction, or reject it without changing the draft. */
export function deleteTimelineItems(state:ClipboardDraft,selection:ClipboardSelection[],ripple:boolean):ClipboardDraft|undefined {
 const unique=[...new Map(selection.map(ref=>[`${ref.kind}:${ref.index}`,ref])).values()]
 if(!unique.length)return
 const main=new Set(unique.filter(ref=>ref.kind==='main').map(ref=>ref.index))
 if([...main].some(index=>!Number.isInteger(index)||index<0||index>=state.clips.length))return
 const nonMain=unique.filter(ref=>ref.kind!=='main').sort((a,b)=>a.kind.localeCompare(b.kind)||b.index-a.index)
 let next:ClipboardDraft={...state,clips:state.clips.filter((_,index)=>!main.has(index))}
 for(const ref of nonMain){
  const kind=ref.kind;if(kind==='main')continue
  if(ripple){const updated=rippleDelete(next,{kind,index:ref.index});if(!updated)return;next={...next,...updated};continue}
  const key=kind==='video'?'videoLayers':kind==='image'?'imageLayers':kind==='text'?'textLayers':kind==='effect'?'effectLayers':'audioLayers',list=next[key]
  if(!Number.isInteger(ref.index)||ref.index<0||ref.index>=list.length)return
  next={...next,[key]:list.filter((_,index)=>index!==ref.index)}
 }
 return next
}

export function splitTimelineItems(state:ClipboardDraft,selection:ClipboardSelection[],time:number,keep:'both'|'left'|'right',ripple:boolean,newId:()=>string):{draft:ClipboardDraft;selection:ClipboardSelection[]}|undefined {
 if(!Number.isFinite(time))return
 const unique=[...new Map(selection.map(ref=>[`${ref.kind}:${ref.index}`,ref])).values()]
 const boundaries=state.clips.reduce<number[]>((values,clip)=>[...values,(values.at(-1)??0)+(clip.end-clip.start)/clip.rate],[0])
 const eligible=unique.filter(ref=>{
  if(ref.kind==='main'){const clip=state.clips[ref.index];if(!clip)return false;const source=clip.start+(time-boundaries[ref.index])*clip.rate;return source>clip.start+.05&&source<clip.end-.05}
  const layer=ref.kind==='video'?state.videoLayers[ref.index]:ref.kind==='image'?state.imageLayers[ref.index]:ref.kind==='text'?state.textLayers[ref.index]:ref.kind==='effect'?state.effectLayers[ref.index]:state.audioLayers[ref.index]
  return Boolean(layer&&time>layer.start+.05&&time<layer.end-.05)
 }).sort((a,b)=>a.kind.localeCompare(b.kind)||b.index-a.index)
 if(!eligible.length)return
 let next:ClipboardDraft={...state,clips:state.clips.slice(),videoLayers:state.videoLayers.slice(),imageLayers:state.imageLayers.slice(),textLayers:state.textLayers.slice(),effectLayers:state.effectLayers.slice(),audioLayers:state.audioLayers.slice()}
 const selected:ClipboardSelection[]=[]
 for(const ref of eligible){
  if(ref.kind==='main'){
   if(keep==='both'&&next.clips.length>=32)return
   const clip=next.clips[ref.index],source=clip.start+(time-boundaries[ref.index])*clip.rate
   next.clips.splice(ref.index,1,...splitClip([clip],0,source,keep));if(keep==='both')for(const prior of selected)if(prior.kind==='main'&&prior.index>ref.index)prior.index++
   selected.push({kind:'main',index:keep==='both'?ref.index+1:ref.index});continue
  }
  const kind=ref.kind,key=kind==='video'?'videoLayers':kind==='image'?'imageLayers':kind==='text'?'textLayers':kind==='effect'?'effectLayers':'audioLayers',list=next[key]
  if(keep==='both'&&list.length>=(kind==='text'?MAX_TEXT_LAYERS:16))return
  if(keep==='right'&&ripple){const changed=rippleKeepRight(next,{kind,index:ref.index},time);if(!changed)return;next={...next,...changed};selected.push(ref);continue}
  const layer=list[ref.index],track=kind==='audio'?undefined:visualTracks(next.videoLayers,next.imageLayers,next.textLayers,next.effectLayers).find(group=>group.refs.some(item=>item.kind===kind&&item.index===ref.index))
  const prepared=keep==='both'?{...layer,track_id:layer.track_id??newId(),...(track?{z_index:track.z}:{})}:layer
  const pieces=splitTimelineLayer(prepared,time,keep)
  next={...next,[key]:[...list.slice(0,ref.index),...pieces,...list.slice(ref.index+1)]}
  if(keep==='both')for(const prior of selected)if(prior.kind===kind&&prior.index>ref.index)prior.index++
  selected.push({kind,index:keep==='both'?ref.index+1:ref.index})
 }
 return {draft:next,selection:selected}
}

/** Toggle all selected visual clips together without changing track visibility. */
export function toggleTimelineVisibility(state:ClipboardDraft,selection:ClipboardSelection[]):ClipboardDraft|undefined {
 const refs=[...new Map(selection.filter(ref=>ref.kind!=='audio').map(ref=>[`${ref.kind}:${ref.index}`,ref])).values()]
 if(!refs.length)return
 const keyFor=(kind:ClipboardSelection['kind'])=>kind==='main'?'clips':kind==='video'?'videoLayers':kind==='image'?'imageLayers':kind==='text'?'textLayers':'effectLayers'
 const entries=refs.map(ref=>state[keyFor(ref.kind)][ref.index])
 if(entries.some(item=>!item))return
 const hidden=entries.some(item=>!item.hidden)
 let next={...state}
 for(const key of ['clips','videoLayers','imageLayers','textLayers','effectLayers'] as const){
  const indices=new Set(refs.filter(ref=>keyFor(ref.kind)===key).map(ref=>ref.index))
  if(indices.size)next={...next,[key]:next[key].map((item,index)=>indices.has(index)?{...item,hidden}:item)}
 }
 return next
}

/** Reference toggles all selected audio/video elements to a shared mute state. */
export function toggleTimelineMute(state:ClipboardDraft,selection:ClipboardSelection[]):ClipboardDraft|undefined {
 const refs=[...new Map(selection.filter(ref=>ref.kind==='main'||ref.kind==='video'||ref.kind==='audio').map(ref=>[`${ref.kind}:${ref.index}`,ref])).values()].filter(ref=>ref.kind!=='main'||state.clips[ref.index]?.media_type!=='image')
 if(!refs.length)return
 const entries=refs.map(ref=>ref.kind==='main'?state.clips[ref.index]:ref.kind==='video'?state.videoLayers[ref.index]:state.audioLayers[ref.index])
 if(entries.some(item=>!item))return
 const muted=entries.some(item=>!item.muted)
 const indices=(kind:ClipboardSelection['kind'])=>new Set(refs.filter(ref=>ref.kind===kind).map(ref=>ref.index))
 const main=indices('main'),video=indices('video'),audio=indices('audio')
 return {...state,clips:state.clips.map((item,i)=>main.has(i)?{...item,muted}:item),videoLayers:state.videoLayers.map((item,i)=>video.has(i)?{...item,muted}:item),audioLayers:state.audioLayers.map((item,i)=>audio.has(i)?{...item,muted}:item)}
}
