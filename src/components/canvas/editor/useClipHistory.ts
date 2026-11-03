
import { useCallback, useState, type SetStateAction } from 'react'
import type { AudioLayer, EffectLayer, ImageLayer, TextLayer, VideoClip, VideoLayer } from './api'
import { reorderVisuals, reorderVisualsTo, visualTracks, type VisualKind, type VisualRef } from './visual-order'
import { insertAudio, insertVisual, moveVisualItem, type TrackPosition, type VisualLayer } from './tracks'
import type { TimelineBookmark } from './bookmarks'
import { deleteTimelineItems } from './selection'
import { pasteTimelineItems, type ClipboardDraft, type ClipboardItem, type ClipboardSelection } from './clipboard'
import { rippleDelete, rippleKeepRight, rippleTrim, type RippleLayer, type RippleRef } from './ripple'

interface Draft { mainTrackHidden:boolean; mainTrackMuted:boolean; effectLayers: EffectLayer[]; bookmarks: TimelineBookmark[]; clips: VideoClip[]; videoLayers: VideoLayer[]; audioLayers: AudioLayer[]; imageLayers: ImageLayer[]; textLayers: TextLayer[] }
export interface DroppedMedia { kind:'video'|'audio'|'image'; resource:string; duration:number; start:number; id:string; main:boolean; visualTarget?:Pick<VisualRef,'kind'|'index'>; audioTarget?:number; visualPosition?:TrackPosition; audioPosition?:TrackPosition }
interface History {
  past: Draft[]
  draft: Draft
  future: Draft[]
}

/** Keeps timeline edits reversible without storing media or server task state. */
export function useClipHistory() {
  const [history, setHistory] = useState<History>({ past: [], draft: { mainTrackHidden:false, mainTrackMuted:false, effectLayers: [], bookmarks: [], clips: [], videoLayers: [], audioLayers: [], imageLayers: [], textLayers: [] }, future: [] })
  const setClips = useCallback((change: SetStateAction<VideoClip[]>) => {
    setHistory(current => {
      const next = typeof change === 'function' ? change(current.draft.clips) : change
      if (next === current.draft.clips) return current
      return {
        past: [...current.past.slice(-49), current.draft],
        draft: { ...current.draft, clips: next },
        future: [],
      }
    })
  }, [])
  const initializeClips = useCallback((clips:VideoClip[]) => {
    setHistory(current=>current.draft.clips.length ? current : {...current,draft:{...current.draft,clips:clips.map(item=>current.draft.mainTrackHidden?{...item,track_hidden:true}:item)}})
  }, [])
  const setVideoLayers = useCallback((change: SetStateAction<VideoLayer[]>) => {
    setHistory(current => {
      const next = typeof change === 'function' ? change(current.draft.videoLayers) : change
      if (next === current.draft.videoLayers) return current
      return { past: [...current.past.slice(-49), current.draft], draft: { ...current.draft, videoLayers: next }, future: [] }
    })
  }, [])
  const setAudioLayers = useCallback((change: SetStateAction<AudioLayer[]>) => {
    setHistory(current => {
      const next = typeof change === 'function' ? change(current.draft.audioLayers) : change
      if (next === current.draft.audioLayers) return current
      return { past: [...current.past.slice(-49), current.draft], draft: { ...current.draft, audioLayers: next }, future: [] }
    })
  }, [])
  const setImageLayers = useCallback((change: SetStateAction<ImageLayer[]>) => {
    setHistory(current => {
      const next = typeof change === 'function' ? change(current.draft.imageLayers) : change
      if (next === current.draft.imageLayers) return current
      return { past: [...current.past.slice(-49), current.draft], draft: { ...current.draft, imageLayers: next }, future: [] }
    })
  }, [])
  const setTextLayers = useCallback((change: SetStateAction<TextLayer[]>) => {
    setHistory(current => {
      const next = typeof change === 'function' ? change(current.draft.textLayers) : change
      if (next === current.draft.textLayers) return current
      return { past: [...current.past.slice(-49), current.draft], draft: { ...current.draft, textLayers: next }, future: [] }
    })
  }, [])
  const setEffectLayers = useCallback((change:SetStateAction<EffectLayer[]>) => {
    setHistory(current=>{const next=typeof change==='function'?change(current.draft.effectLayers):change;if(next===current.draft.effectLayers)return current;return {past:[...current.past.slice(-49),current.draft],draft:{...current.draft,effectLayers:next},future:[]}})
  }, [])
  const toggleMainTrack = useCallback(() => {
    setHistory(current=>{const hidden=!current.draft.mainTrackHidden;return {past:[...current.past.slice(-49),current.draft],draft:{...current.draft,mainTrackHidden:hidden,clips:current.draft.clips.map(item=>({...item,track_hidden:hidden}))},future:[]}})
  }, [])
  const toggleMainTrackMute = useCallback(() => {
    setHistory(current=>({past:[...current.past.slice(-49),current.draft],draft:{...current.draft,mainTrackMuted:!current.draft.mainTrackMuted},future:[]}))
  }, [])
  const toggleVisualTrackMute = useCallback((kind:VisualKind,index:number) => {
    setHistory(current=>{
      const draft=current.draft,track=visualTracks(draft.videoLayers,draft.imageLayers,draft.textLayers,draft.effectLayers).find(group=>group.category==='video'&&group.refs.some(ref=>ref.kind===kind&&ref.index===index));if(!track)return current
      const first=track.refs[0],item=first.kind==='video'?draft.videoLayers[first.index]:draft.imageLayers[first.index],muted=!item.track_muted
      const videos=new Set(track.refs.filter(ref=>ref.kind==='video').map(ref=>ref.index)),images=new Set(track.refs.filter(ref=>ref.kind==='image').map(ref=>ref.index))
      return {past:[...current.past.slice(-49),draft],draft:{...draft,videoLayers:draft.videoLayers.map((entry,i)=>videos.has(i)?{...entry,track_muted:muted}:entry),imageLayers:draft.imageLayers.map((entry,i)=>images.has(i)?{...entry,track_muted:muted}:entry)},future:[]}
    })
  }, [])
  const setBookmarks = useCallback((change:SetStateAction<TimelineBookmark[]>) => {
    setHistory(current=>{const next=typeof change==='function'?change(current.draft.bookmarks):change;if(next===current.draft.bookmarks)return current;return {past:[...current.past.slice(-49),current.draft],draft:{...current.draft,bookmarks:next},future:[]}})
  }, [])
  const insertVisualLayer = useCallback((kind:VisualKind,item:VisualLayer,id:string,preferred?:Pick<VisualRef,'kind'|'index'>,insertAt?:number,placement:'auto'|'target'='auto',position?:TrackPosition) => {
    setHistory(current => {
      const result=insertVisual({videos:current.draft.videoLayers,images:current.draft.imageLayers,text:current.draft.textLayers,effects:current.draft.effectLayers},kind,item,id,preferred,insertAt,placement,position)
      return {past:[...current.past.slice(-49),current.draft],draft:{...current.draft,videoLayers:result.videos,imageLayers:result.images,textLayers:result.text,effectLayers:result.effects??[]},future:[]}
    })
  }, [])
  const moveVisualTrackItem = useCallback((ref:Pick<VisualRef,'kind'|'index'>,original:VisualLayer,updated:VisualLayer,id:string,targetKey?:string,position?:TrackPosition) => {
    setHistory(current => {
      const draft=current.draft,source=ref.kind==='video'?draft.videoLayers[ref.index]:ref.kind==='image'?draft.imageLayers[ref.index]:ref.kind==='text'?draft.textLayers[ref.index]:draft.effectLayers[ref.index]
      if(source!==original)return current
      const result=moveVisualItem({videos:draft.videoLayers,images:draft.imageLayers,text:draft.textLayers,effects:draft.effectLayers},ref,updated,id,targetKey,position);if(!result)return current
      return {past:[...current.past.slice(-49),draft],draft:{...draft,videoLayers:result.videos,imageLayers:result.images,textLayers:result.text,effectLayers:result.effects??[]},future:[]}
    })
  }, [])
  const toggleVisualTrack = useCallback((kind:VisualKind,index:number) => {
    setHistory(current => {
      const draft=current.draft,track=visualTracks(draft.videoLayers,draft.imageLayers,draft.textLayers,draft.effectLayers).find(group=>group.refs.some(ref=>ref.kind===kind&&ref.index===index));if(!track)return current
      const get=(ref:VisualRef)=>ref.kind==='video'?draft.videoLayers[ref.index]:ref.kind==='image'?draft.imageLayers[ref.index]:ref.kind==='text'?draft.textLayers[ref.index]:draft.effectLayers[ref.index]
      const hide=!Boolean(get(track.refs[0]).track_hidden),ids=(kind:VisualKind)=>new Set(track.refs.filter(ref=>ref.kind===kind).map(ref=>ref.index))
      const videos=ids('video'),images=ids('image'),text=ids('text'),effects=ids('effect')
      return {past:[...current.past.slice(-49),draft],draft:{...draft,videoLayers:draft.videoLayers.map((item,i)=>videos.has(i)?{...item,track_hidden:hide}:item),imageLayers:draft.imageLayers.map((item,i)=>images.has(i)?{...item,track_hidden:hide}:item),textLayers:draft.textLayers.map((item,i)=>text.has(i)?{...item,track_hidden:hide}:item),effectLayers:draft.effectLayers.map((item,i)=>effects.has(i)?{...item,track_hidden:hide}:item)},future:[]}
    })
  }, [])
  const moveVisualLayer = useCallback((kind:VisualKind,index:number,direction:-1|1) => {
    setHistory(current => {
      const result=reorderVisuals(current.draft.videoLayers,current.draft.imageLayers,current.draft.textLayers,kind,index,direction,current.draft.effectLayers)
      if(!result)return current
      return {past:[...current.past.slice(-49),current.draft],draft:{...current.draft,videoLayers:result.videos,imageLayers:result.images,textLayers:result.text,effectLayers:result.effects},future:[]}
    })
  }, [])
  const moveVisualLayerTo = useCallback((source:Pick<VisualRef,'kind'|'index'>,target:Pick<VisualRef,'kind'|'index'>,sourceLayer:VisualLayer,targetLayer:VisualLayer) => {
    setHistory(current => {
      const get=(ref:Pick<VisualRef,'kind'|'index'>)=>ref.kind==='video'?current.draft.videoLayers[ref.index]:ref.kind==='image'?current.draft.imageLayers[ref.index]:ref.kind==='text'?current.draft.textLayers[ref.index]:current.draft.effectLayers[ref.index]
      if(get(source)!==sourceLayer || get(target)!==targetLayer)return current
      const result=reorderVisualsTo(current.draft.videoLayers,current.draft.imageLayers,current.draft.textLayers,source,target,current.draft.effectLayers)
      if(!result)return current
      return {past:[...current.past.slice(-49),current.draft],draft:{...current.draft,videoLayers:result.videos,imageLayers:result.images,textLayers:result.text,effectLayers:result.effects},future:[]}
    })
  }, [])
  const insertDroppedMedia = useCallback((items:DroppedMedia[]) => {
    setHistory(current=>{
      let draft=current.draft;const past=[...current.past]
      for(const item of items){
        let next:Draft|undefined
        if((item.kind==='video'||item.kind==='image')&&item.main&&draft.clips.length<32)next={...draft,clips:[...draft.clips,{resource_uuid:item.resource,...(item.kind==='image'?{media_type:'image' as const}:{}),start:0,end:item.duration,rate:1,volume_db:0,...(draft.mainTrackHidden?{track_hidden:true}:{})}]}
        else if(item.kind==='video'&&!item.main&&draft.videoLayers.length<16){const placed=insertVisual({videos:draft.videoLayers,images:draft.imageLayers,text:draft.textLayers,effects:draft.effectLayers},'video',{resource_uuid:item.resource,start:item.start,end:Math.min(600,item.start+item.duration),source_start:0,rate:1,volume_db:0},item.id,item.visualTarget,undefined,'target',item.visualPosition);next={...draft,videoLayers:placed.videos,imageLayers:placed.images,textLayers:placed.text,effectLayers:placed.effects??[]}}
        else if(item.kind==='image'&&!item.main&&draft.imageLayers.length<16){const placed=insertVisual({videos:draft.videoLayers,images:draft.imageLayers,text:draft.textLayers,effects:draft.effectLayers},'image',{resource_uuid:item.resource,start:item.start,end:Math.min(600,item.start+5),x:.5,y:.5,scale:1,opacity:1},item.id,item.visualTarget,undefined,'target',item.visualPosition);next={...draft,videoLayers:placed.videos,imageLayers:placed.images,textLayers:placed.text,effectLayers:placed.effects??[]}}
        else if(item.kind==='audio'&&draft.audioLayers.length<16)next={...draft,audioLayers:insertAudio(draft.audioLayers,{resource_uuid:item.resource,start:item.start,end:Math.min(600,item.start+item.duration),source_start:0,volume_db:0},item.id,item.audioTarget,undefined,'target',item.audioPosition)}
        if(next){past.push(draft);draft=next}
      }
      return draft===current.draft?current:{past:past.slice(-50),draft,future:[]}
    })
  }, [])
  const applyRipple = useCallback((ref:RippleRef,original:RippleLayer,action:{type:'delete'}|{type:'trim';updated:RippleLayer}|{type:'right';time:number})=>{
    setHistory(current=>{const draft=current.draft,existing=ref.kind==='video'?draft.videoLayers[ref.index]:ref.kind==='image'?draft.imageLayers[ref.index]:ref.kind==='text'?draft.textLayers[ref.index]:ref.kind==='effect'?draft.effectLayers[ref.index]:draft.audioLayers[ref.index];if(existing!==original)return current
      const changed=action.type==='delete'?rippleDelete(draft,ref):action.type==='trim'?rippleTrim(draft,ref,action.updated):rippleKeepRight(draft,ref,action.time);if(!changed)return current
      return {past:[...current.past.slice(-49),draft],draft:{...draft,...changed},future:[]}
    })
  },[])
  const applyPaste = useCallback((items:ClipboardItem[],at:number,ids:string[],expected:ClipboardDraft)=>{
    setHistory(current=>{const draft=current.draft;if(draft.clips!==expected.clips||draft.videoLayers!==expected.videoLayers||draft.imageLayers!==expected.imageLayers||draft.textLayers!==expected.textLayers||draft.effectLayers!==expected.effectLayers||draft.audioLayers!==expected.audioLayers)return current
      let index=0;const result=pasteTimelineItems(draft,items,at,()=>ids[index++]);if(!result)return current
      return {past:[...current.past.slice(-49),draft],draft:{...draft,...result.draft},future:[]}
    })
  },[])
  const applyBatchDelete = useCallback((selection:ClipboardSelection[],ripple:boolean,expected:ClipboardDraft)=>{
    setHistory(current=>{const draft=current.draft;if(draft.clips!==expected.clips||draft.videoLayers!==expected.videoLayers||draft.imageLayers!==expected.imageLayers||draft.textLayers!==expected.textLayers||draft.effectLayers!==expected.effectLayers||draft.audioLayers!==expected.audioLayers)return current
      const result=deleteTimelineItems(draft,selection,ripple);if(!result)return current
      return {past:[...current.past.slice(-49),draft],draft:{...draft,...result},future:[]}
    })
  },[])
  const applyTransaction = useCallback((next:ClipboardDraft,expected:ClipboardDraft)=>{
    setHistory(current=>{const draft=current.draft;if(draft.clips!==expected.clips||draft.videoLayers!==expected.videoLayers||draft.imageLayers!==expected.imageLayers||draft.textLayers!==expected.textLayers||draft.effectLayers!==expected.effectLayers||draft.audioLayers!==expected.audioLayers)return current
      return {past:[...current.past.slice(-49),draft],draft:{...draft,...next},future:[]}
    })
  },[])
  const resetClips = useCallback((clips: VideoClip[], audioLayers: AudioLayer[] = [], textLayers: TextLayer[] = [], imageLayers: ImageLayer[] = [], videoLayers: VideoLayer[] = [], bookmarks:TimelineBookmark[] = [], effectLayers:EffectLayer[] = [], mainTrackHidden=Boolean(clips[0]?.track_hidden), mainTrackMuted=false) => setHistory({ past: [], draft: { mainTrackHidden, mainTrackMuted, clips, audioLayers, textLayers, imageLayers, videoLayers, bookmarks, effectLayers }, future: [] }), [])
  const undo = useCallback(() => setHistory(current => {
    if (!current.past.length) return current
    return { past: current.past.slice(0, -1), draft: current.past[current.past.length - 1], future: [current.draft, ...current.future] }
  }), [])
  const redo = useCallback(() => setHistory(current => {
    if (!current.future.length) return current
    return { past: [...current.past, current.draft], draft: current.future[0], future: current.future.slice(1) }
  }), [])
  return { mainTrackHidden:history.draft.mainTrackHidden, mainTrackMuted:history.draft.mainTrackMuted, toggleMainTrack, toggleMainTrackMute, toggleVisualTrackMute, effectLayers: history.draft.effectLayers, setEffectLayers, bookmarks: history.draft.bookmarks, clips: history.draft.clips, initializeClips, videoLayers: history.draft.videoLayers, audioLayers: history.draft.audioLayers, imageLayers: history.draft.imageLayers, textLayers: history.draft.textLayers, setClips, setVideoLayers, setAudioLayers, setImageLayers, setTextLayers, setBookmarks, insertVisualLayer, moveVisualTrackItem, toggleVisualTrack, moveVisualLayer, moveVisualLayerTo, insertDroppedMedia, applyRipple, applyPaste, applyBatchDelete, applyTransaction, resetClips, undo, redo, canUndo: history.past.length > 0, canRedo: history.future.length > 0 }
}
