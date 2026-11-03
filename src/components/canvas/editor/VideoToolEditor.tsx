import { editorStorage } from './storage'
import * as React from 'react'
/* eslint-disable @next/next/no-img-element -- Authorized original images are decoded directly for timeline preview. */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Bookmark, BookmarkX, Camera, ClipboardPaste, Copy, CopyPlus, Eye, EyeOff, FolderOpen, Headphones, Image as ImageIcon, Link2, Magnet, Maximize2, MessageSquare, Minimize2, MoreHorizontal, Pause, Play, Redo2, Scissors, Settings, Sparkles, Split, Sticker as StickerIcon, Trash2, Type, Undo2, Volume2, VolumeX, X, ZoomIn, ZoomOut } from 'lucide-react'
import { TimelineToolButton } from './TimelineToolButton'
import { ShortcutTooltip } from './ShortcutTooltip'
import { adjacentEditPoint, editorShortcuts as keys, formatShortcut } from './shortcuts'
import { EditorEmptyState, EditorPanelHeader, editorPanelClass } from './EditorPanel'
import { rulerStep, rulerTicks } from './timeline-ruler'
import { MediaButton, MediaModal, MediaPopover } from './ui'
import { validateMediaUploadFile } from './media-upload'
import { mediaNodeActionSucceeded, type MediaNodeEditedAssetHandler } from './media-node-port'
import { setImageKeyframe, sliceImageLayer, validImageKeyframes } from './image-keyframes'
import { CoverSelector } from './CoverSelector'
import { CoverThumbnail } from './CoverThumbnail'
import { ExportSection } from './ExportSection'
import { EditableTimecode } from './EditableTimecode'
import { captureCoverFrame } from './cover-output'
import { captureTimelineSnapshot } from './snapshot'
import { MAX_TEXT_LAYERS, clipDuration, splitClip, timelineSeek, validCover, type AudioLayer, type EffectLayer, type VideoLayer, type ImageLayer, type TextLayer, type EraseMode, type VideoClip, type VideoAspect, type VideoRect, type VideoToolInput, type VideoToolJob, type VideoCover } from './api'
import { useVideoTools } from './context'
import { useClipHistory, type DroppedMedia } from './useClipHistory'
import { ClipTrimHandle } from './ClipTrimHandle'
import { TimelineFilmstrip } from './TimelineFilmstrip'
import { useTimelineFilmstrips } from './useTimelineFilmstrips'
import { useTimelineWaveforms } from './useTimelineWaveforms'
import { AudioTrackPanel } from './AudioTrackPanel'
import { TextTrackPanel } from './TextTrackPanel'
import { TextPresets } from './TextPresets'
import { useTextPresets, type TextPresetStyle } from './useTextPresets'
import { SourcePicker, type SourceKind } from './SourcePicker'
import { VideoLayerPanel } from './VideoLayerTrack'
import { ImageTrackPanel } from './ImageTrack'
import { EffectComposition } from './EffectComposition'
import { useStillImage } from './useStillImage'
import { VideoTransformControls } from './VideoTransformControls'
import { validBlendMode } from './blend-mode'
import { VisualEffectsPanel } from './VisualEffectsPanel'
import { StickerLibrary } from './StickerLibrary'
import { deleteTimelineItems, splitTimelineItems, toggleTimelineVisibility, toggleTimelineMute } from './selection'
import { duplicateTimelineItems } from './duplicate'
import { moveMainToVisual, moveVisualToMain } from './track-transfer'
import { copyTimelineItems, pasteTimelineItems, type ClipboardDraft, type ClipboardSelection } from './clipboard'
import { useTimelineClipboard } from './useTimelineClipboard'
import { useTimelinePreferences } from './useTimelinePreferences'
import { rippleKeepRight, rippleTrim, type RippleKind, type RippleLayer, type RippleRef } from './ripple'
import { recordSticker, stickerFile, type Sticker } from './stickers'
import { validVisualEffects } from './visual-effects'
import type { VisualEffect } from './api'
import { PreviewSelection } from './PreviewSelection'
import { hitPreview, previewTargets, type PreviewTarget } from './preview-hit'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { VisualTrackRow, trackHeaderClass, trackIconButtonClass } from './VisualTrackRow'
import { TrackContextMenu } from './TrackContextMenu'
import { SmartSubtitleBar } from './SmartSubtitleBar'
import { subtitleTarget, subtitleTextLayers, useSmartSubtitles } from './smart-subtitles'
import { VisibilityIcon } from './VisibilityIcon'
import { isHidden, validVisibility, visibleAudio, visibleClip, visibleImage, visibleText, visibleVideo, visibleEffect } from './visibility'
import { audioTracks, insertAudio, moveAudioItem, moveVisualItem, newTrackId, validTrackId, validTrackOrder, type TrackPosition, type VisualLayer } from './tracks'
import { visualTracks, validVisualZ, type VisualRef } from './visual-order'
import { constrainTrackTrim, sliceVideoLayer, splitTimelineLayer, TimelineLayer } from './TimelineLayer'
import { frameTime, snapTime, timelineSnapTargets } from './timeline-snap'
import { changeBookmark, moveBookmark, toggleBookmark, validBookmark, visibleBookmarkNotes, type TimelineBookmark } from './bookmarks'
import { BookmarkMarker } from './BookmarkMarker'
import { keyframeTime, setTextKeyframe, sliceTextLayer, validTextBackground, validTextKeyframes, valueAt } from './text-keyframes'
import { setVideoKeyframe, validVideoTransform } from './video-keyframes'
const labels: Record<string, string> = { quoted: '报价已就绪', queued: '排队中', reserving: '冻结积分中', submitting: '提交中', rendering: '视频合成中', running: '字幕擦除中', settling: '结算中', releasing: '退回积分中', succeeded: '处理完成', failed: '处理失败', unknown: '提交结果待确认，请联系管理员，勿重复提交' }
const modes: Record<EraseMode, string> = { subtitle_all_area: '全域智能字幕擦除', subtitle_sel_area: '选区字幕擦除', watermark_all_area: '全域水印 / 字幕擦除', watermark_sel_area: '选区水印 / 字幕擦除' }
const aspects: Record<VideoAspect, number> = { '': 0, '16:9': 16/9, '4:3': 4/3, '2.35:1': 2.35, '2:1': 2, '1.85:1': 1.85, '9:16': 9/16, '3:4': 3/4, '5.8': 6/13, '1:1': 1 }
const snapshotSizes:Record<Exclude<VideoAspect,''>,{width:number;height:number}> = {'16:9':{width:1920,height:1080},'4:3':{width:1440,height:1080},'2.35:1':{width:2538,height:1080},'2:1':{width:2160,height:1080},'1.85:1':{width:1998,height:1080},'9:16':{width:1080,height:1920},'3:4':{width:1080,height:1440},'5.8':{width:1080,height:2340},'1:1':{width:1080,height:1080}}
type PreviewDrag = {target:PreviewTarget;x:number;y:number;at:number;original:VideoClip|VideoLayer|ImageLayer|TextLayer;mode:'move'|'scale'|'rotate';value:number}
type PreviewDragStart = PreviewDrag & {clientX:number;clientY:number;width:number;height:number;lastAngle:number;angleDelta:number}
function timecode(seconds:number,fps:number) {
 const frames=Math.max(0,Math.floor(seconds*fps+0.000001)), values=[Math.floor(frames/(fps*3600)),Math.floor(frames/(fps*60))%60,Math.floor(frames/fps)%60,frames%fps]
 return values.map(value=>String(value).padStart(2,'0')).join(':')
}
const field = 'w-full rounded-md border border-[#2e2e2e] bg-[#1a1a1a] px-2.5 py-1.5 text-xs text-[#dedede]'
// The edit workspace fills the viewport like a standalone editor; antd applies its modal box styles inline, so overrides need !important.
const editShell = '!top-0 !m-0 !max-w-none !p-0 [&_.flowx-media-ant-modal-container]:!h-dvh [&_.flowx-media-ant-modal-container]:!rounded-none [&_.flowx-media-ant-modal-container]:!border-0 [&_.flowx-media-ant-modal-container]:!bg-[#0d0d0d] [&_.flowx-media-ant-modal-container]:!p-0 [&_.flowx-media-ant-modal-body]:!h-full [&_.flowx-media-ant-modal-body]:!p-0'
const TRACK_HEADER = 180
const libraryTabs = [['video', '媒体', FolderOpen], ['audio', '音效', Headphones], ['text', '文本', Type], ['sticker', '贴纸', StickerIcon], ['effect', '特效', Sparkles], ['settings', '设置', Settings]] as const
export function VideoToolEditor({ resource, sourceUrl, initialMode, onClose, onCreate }: { resource: string; sourceUrl: string; initialMode: 'edit' | 'erase'; onClose(): void; onCreate?: MediaNodeEditedAssetHandler }) {
 const ctx = useVideoTools()!
 const textPresets = useTextPresets(ctx.preferenceNamespace)
 const [operation, setOperation] = useState(initialMode)
 const [mode, setMode] = useState<EraseMode>('subtitle_all_area')
 const { mainTrackHidden, mainTrackMuted, toggleMainTrack, toggleMainTrackMute, toggleVisualTrackMute, effectLayers, setEffectLayers, bookmarks, clips, initializeClips, videoLayers, audioLayers, imageLayers, textLayers, setClips, setVideoLayers, setAudioLayers, setImageLayers, setTextLayers, setBookmarks, insertVisualLayer, moveVisualTrackItem, toggleVisualTrack, moveVisualLayer, moveVisualLayerTo, insertDroppedMedia, applyRipple, applyTransaction, resetClips, undo, redo, canUndo, canRedo } = useClipHistory()
 const initialClipNeeded=useRef(true)
 const [selected, setSelected] = useState(0)
 const [activeTrack, setActiveTrack] = useState<{kind:'video'|'overlay'|'audio'|'image'|'text'|'effect';index:number}>({kind:'video',index:0})
 const [selectionState,setSelectionState]=useState<{items:ClipboardSelection[];draft:ClipboardDraft}>()
 const [exportOpen, setExportOpen] = useState(false)
 const [coverOpen, setCoverOpen] = useState(false)
 const [shortcutsOpen, setShortcutsOpen] = useState(false)
 const shortcutHelp:[string,string][] = shortcutsOpen ? [
  ['播放 / 暂停',formatShortcut(keys.playPause)],['上一帧 / 下一帧','← / →'],['后退 / 前进 5 秒','⇧← / ⇧→'],['上一分割点 / 下一分割点','↑ / ↓'],
  ['选择 / 剪刀工具',`${formatShortcut(keys.select)} / ${formatShortcut(keys.blade)}`],['分割',formatShortcut(keys.split)],['向左裁剪 / 向右裁剪',`${formatShortcut(keys.trimLeft)} / ${formatShortcut(keys.trimRight)}`],
  ['删除',`${formatShortcut(keys.delete)} / Backspace`],['撤销 / 重做',`${formatShortcut(keys.undo)} / ${formatShortcut(keys.redo)}`],
  ['复制 / 剪切 / 粘贴',[keys.copy,keys.cut,keys.paste].map(value=>formatShortcut(value)).join(' / ')],['复制片段',formatShortcut(keys.duplicate)],['全选',formatShortcut(keys.selectAll)],
  ['启用 / 停用片段',formatShortcut(keys.toggleEnabled)],['添加标记',formatShortcut(keys.marker)],['自动吸附',formatShortcut(keys.snap)],['磁吸（波纹编辑）',formatShortcut(keys.ripple)],
  ['时间线放大 / 缩小',`${formatShortcut(keys.zoomIn)} / ${formatShortcut(keys.zoomOut)}`],['时间线适应',formatShortcut(keys.zoomFit)],['全屏预览',formatShortcut(keys.fullscreen)],['导出',formatShortcut(keys.export)],
 ] : []
 const [cover, setCover] = useState<VideoCover>()
 const [prependCover, setPrependCover] = useState(false)
 const coverPreviousTime = useRef(0)
 const spacePlayback = useRef(false)
 const deliveredRef = useRef<Record<string,string[]>>({})
 const [exportScope, setExportScope] = useState<'selected' | 'timeline'>('timeline')
 const [outputAspect, setOutputAspect] = useState<VideoAspect>('')
 const [outputKind, setOutputKind] = useState<'video'|'audio'|'both'|'none'>('video')
 const [exportTitle, setExportTitle] = useState('视频处理')
 const [audioFormat, setAudioFormat] = useState<'mp3'|'wav'>('wav')
 const [outputFPS, setOutputFPS] = useState<24 | 25 | 30 | 60 | 120>(30)
 const [projectFPS, setProjectFPS] = useState<24 | 25 | 30 | 60 | 120>(30)
 const [backgroundColor, setBackgroundColor] = useState('000000')
 const [outputResolution, setOutputResolution] = useState<360 | 480 | 720 | 1080>(720)
 const [includeAudio, setIncludeAudio] = useState(true)
 const [outputFormat, setOutputFormat] = useState<'mp4' | 'webm'>('mp4')
 const [addedAudioSources, setAddedAudioSources] = useState<{resource:string;name:string}[]>([])
 const [videoAddMode, setVideoAddMode] = useState<'main'|'overlay'>('main')
 const [libraryTab, setLibraryTab] = useState<'video' | 'audio' | 'image' | 'text' | 'sticker' | 'effect' | 'settings'>('video')
 const [urls, setUrls] = useState<Record<string, string>>({ [resource]: sourceUrl })
 const sourceUrlCache = useRef(new Map<string, Promise<string>>())
 const resolveSource = useCallback((id: string) => { const hit = sourceUrlCache.current.get(id); if (hit) return hit; const pending = ctx.api.source(ctx.project, id); sourceUrlCache.current.set(id, pending); pending.catch(() => sourceUrlCache.current.delete(id)); return pending }, [ctx.api, ctx.project])
 const filmstrips = useTimelineFilmstrips(clips, videoLayers, urls)
 const [durations, setDurations] = useState<Record<string, number>>({})
 const [audioDurations, setAudioDurations] = useState<Record<string, number>>({})
 const waveforms = useTimelineWaveforms(audioLayers, urls, audioDurations)
 const [rect, setRect] = useState<VideoRect>()
 const [loadedResource, setLoadedResource] = useState<string>()
 const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
 const [sourceDimensions, setSourceDimensions] = useState<Record<string, { width: number; height: number }>>({})
 const [time, setTime] = useState(0)
 const [previewPlaying, setPreviewPlaying] = useState(false)
 const [playerFullscreen, setPlayerFullscreen] = useState(false)
 const [tailTime, setTailTime] = useState<number>()
 const [tailPlaying, setTailPlaying] = useState(false)
 const [zoom, setZoom] = useState(1)
 const [bladeMode,setBladeMode]=useState(false)
 const [bladePreview,setBladePreview]=useState<number>()
 const {snap,setSnap,rippleEditing,setRippleEditing}=useTimelinePreferences(ctx.preferenceNamespace)
 const timelineClipboard=useTimelineClipboard(ctx.clipboardNamespace,ctx.project)
 const clipboardPastePending=useRef(false)
 const [clipboardStatus,setClipboardStatus]=useState('')
 const [showBookmarkNotes,setShowBookmarkNotes] = useState(true)
 const [busy, setBusy] = useState(false)
 const [recovering, setRecovering] = useState(true)
 const [error, setError] = useState('')
 const [quote, setQuote] = useState<VideoToolJob>()
 const [job, setJob] = useState<VideoToolJob>()
 const [jobs, setJobs] = useState<VideoToolJob[]>([])
 const visualDrag = useRef<{ref:Pick<VisualRef,'kind'|'index'>;layer:VisualLayer} | undefined>(undefined)
 const [visualDrop, setVisualDrop] = useState<string>()
 const textPresetDrag = useRef<TextPresetStyle | undefined>(undefined)
 const effectDrag = useRef(false)
 const stickerDrag = useRef<Sticker | undefined>(undefined)
 const stickerAdding = useRef(false)
 const sourceDrag = useRef<{kind:SourceKind;id:string;name:string} | undefined>(undefined)
 const droppingFiles = useRef(false)
 const editorMounted = useRef(true)
 const [textPresetDrop, setTextPresetDrop] = useState<number>()
 const [previewDrag, setPreviewDrag] = useState<PreviewDrag>()
 const dragRef = useRef<PreviewDragStart|undefined>(undefined)
 const previewCanvas = useRef<HTMLDivElement>(null)
 const video = useRef<HTMLVideoElement>(null)
 const player = useRef<HTMLDivElement>(null)
 const audioElements = useRef(new Map<number, HTMLAudioElement>())
 const pendingAudioPlay = useRef(new Set<number>())
 const wantedAudioPlay = useRef(new Map<number, boolean>())
 const tailMode = useRef(false)
 const tailPosition = useRef(0)
 const tailFrame = useRef<number | undefined>(undefined)
 const imageFrame = useRef<number | undefined>(undefined)
 const pendingSeek = useRef<number | undefined>(undefined)
 const resumePreview = useRef(false)
 const selecting = useRef<{ x: number; y: number } | undefined>(undefined)
 const skipDraftSave = useRef(false)
 const draftKey = ctx.clipboardNamespace && /^[a-f0-9]{64}$/.test(ctx.clipboardNamespace) ? `media-video-draft:${ctx.project}:${resource}:identity:${ctx.clipboardNamespace}` : undefined
 const clip = clips[selected]
 const exportVideoEnabled = outputKind==='video' || outputKind==='both'
 const exportAudioEnabled = outputKind==='audio' || outputKind==='both'
 const activeIsVideo = activeTrack.kind==='video' || (activeTrack.kind==='overlay' && !videoLayers[activeTrack.index]) || (activeTrack.kind==='audio' && !audioLayers[activeTrack.index]) || (activeTrack.kind==='image' && !imageLayers[activeTrack.index]) || (activeTrack.kind==='text' && !textLayers[activeTrack.index]) || (activeTrack.kind==='effect' && !effectLayers[activeTrack.index])
 const aspectSource = sourceDimensions[resource] ?? {width:0,height:0}
 const previewAspect = aspects[outputAspect] || (aspectSource.width && aspectSource.height ? aspectSource.width / aspectSource.height : 16/9)
 const transform = clip?.transform ?? { scale: 1, x: 0, y: 0, rotation: 0, opacity: 1 }
 const animatedTransform = { scale:valueAt(transform.scale,transform.keyframes?.scale,time), x:valueAt(transform.x,transform.keyframes?.x,time), y:valueAt(transform.y,transform.keyframes?.y,time), rotation:valueAt(transform.rotation,transform.keyframes?.rotation,time), opacity:isHidden(clip)?0:valueAt(transform.opacity,transform.keyframes?.opacity,time) }
 const totalDuration = clips.reduce((n, c) => n + clipDuration(c), 0)
 const visualOrder = visualTracks(videoLayers,imageLayers,textLayers,effectLayers)
 const audioOrder = audioTracks(audioLayers)
 const selectedVisual = activeTrack.kind==='overlay'?'video':activeTrack.kind==='image'?'image':activeTrack.kind==='text'?'text':activeTrack.kind==='effect'?'effect':undefined
 const selectedVisualPosition = selectedVisual ? visualOrder.findIndex(track=>track.refs.some(ref=>ref.kind===selectedVisual && ref.index===activeTrack.index)) : -1
 const pixelsPerSecond = 120*zoom
 const timelineDuration = Math.max(totalDuration, ...videoLayers.map(layer => layer.end), ...audioLayers.map(layer => layer.end), ...imageLayers.map(layer => layer.end), ...textLayers.map(layer => layer.end), ...effectLayers.map(layer=>layer.end), 0)
 const displayDuration = (c:VideoClip) => Number.isFinite(clipDuration(c)) ? Math.max(0,Math.min(600,clipDuration(c))) : 0
 const timelineExtent = Number.isFinite(timelineDuration) ? Math.max(0,Math.min(600,timelineDuration)) : 0
 const videoBoundaries = clips.reduce<number[]>((points,c)=>[...points,(points.at(-1) ?? 0)+displayDuration(c)],[0])
 const timelineTargets = (kind:'video'|'overlay'|'audio'|'image'|'text'|'effect', index:number) => timelineSnapTargets(clips,videoBoundaries,videoLayers,audioLayers,imageLayers,textLayers,playhead,kind,index,bookmarks,true,effectLayers)
 const playhead = tailTime ?? clips.slice(0,selected).reduce((n,c)=>n+clipDuration(c),0)+(clip?Math.max(0,Math.min(clipDuration(clip),(time-clip.start)/clip.rate)):0)
 const clipboardContext=useRef({project:ctx.project,namespace:ctx.clipboardNamespace,readOnly:ctx.readOnly,fps:projectFPS,items:timelineClipboard.items,clips,videoLayers,imageLayers,textLayers,effectLayers,audioLayers})
 clipboardContext.current={project:ctx.project,namespace:ctx.clipboardNamespace,readOnly:ctx.readOnly,fps:projectFPS,items:timelineClipboard.items,clips,videoLayers,imageLayers,textLayers,effectLayers,audioLayers}
 const activeSelection:ClipboardSelection={kind:activeIsVideo?'main':activeTrack.kind==='overlay'?'video':activeTrack.kind,index:activeIsVideo?selected:activeTrack.index}
 const selectionValid=Boolean(selectionState&&selectionState.draft.clips===clips&&selectionState.draft.videoLayers===videoLayers&&selectionState.draft.imageLayers===imageLayers&&selectionState.draft.textLayers===textLayers&&selectionState.draft.effectLayers===effectLayers&&selectionState.draft.audioLayers===audioLayers)
 const timelineSelection=selectionValid?selectionState!.items:(activeIsVideo?Boolean(clip):Boolean(selectedLayer()))?[activeSelection]:[]
 const selectedOnTimeline=(kind:ClipboardSelection['kind'],index:number)=>timelineSelection.some(item=>item.kind===kind&&item.index===index)
 const selectedVisualItems=timelineSelection.filter(item=>item.kind!=='audio').map(item=>item.kind==='main'?clips[item.index]:item.kind==='video'?videoLayers[item.index]:item.kind==='image'?imageLayers[item.index]:item.kind==='text'?textLayers[item.index]:effectLayers[item.index]).filter(Boolean)
 const selectedElementHidden=selectedVisualItems.length>0&&selectedVisualItems.every(item=>item.hidden===true)
 const selectedAudibleItems=timelineSelection.flatMap(item=>{const value=item.kind==='main'?clips[item.index]:item.kind==='video'?videoLayers[item.index]:item.kind==='audio'?audioLayers[item.index]:undefined;return value&&!(item.kind==='main'&&(value as VideoClip).media_type==='image')?[value]:[]})
 const selectedElementsMuted=selectedAudibleItems.length>0&&selectedAudibleItems.every(item=>item.muted===true)
 const latestDraft=useRef<ClipboardDraft>({clips,videoLayers,imageLayers,textLayers,effectLayers,audioLayers})
 latestDraft.current={clips,videoLayers,imageLayers,textLayers,effectLayers,audioLayers}
 const smartSubtitles=useSmartSubtitles({api:ctx.api,project:ctx.project,storageKey:draftKey&&`${draftKey}:subtitle`,onSegments:(target,segments,jobId)=>{
  // The job outlives edits made while it ran; place lines against the latest draft as one undoable step.
  if(initialClipNeeded.current)throw new Error('剪辑草稿尚未加载')
  const state=latestDraft.current,trackId=`subtitle-${jobId}`
  if(state.textLayers.some(layer=>layer.track_id===trackId))return '字幕已添加'
  const layers=subtitleTextLayers(state,target,segments,trackId,projectFPS)
  if(!segments.length)return '未识别到语音，未添加字幕'
  if(!layers.length)return `文字元素已达 ${MAX_TEXT_LAYERS} 个上限，未添加字幕`
  const next={...state,textLayers:[...state.textLayers,...layers]}
  if(draftKey)editorStorage.setItem(draftKey,JSON.stringify({mainTrackHidden,mainTrackMuted,...next,bookmarks,showBookmarkNotes,projectFPS,backgroundColor,outputAspect,cover,prependCover,exportTitle}))
  setQuote(undefined);applyTransaction(next,state)
  return layers.length<segments.length?`已添加 ${layers.length} 条字幕，其余超出文字元素上限`:`已添加 ${layers.length} 条字幕`
 }})
 const selectedSubtitle=timelineSelection.length===1?subtitleTarget(latestDraft.current,timelineSelection[0]):undefined
 const subtitleActions=(owns:(ref:ClipboardSelection)=>boolean)=>ctx.config.subtitle_enabled?[{label:'智能字幕',disabled:!selectedSubtitle||!owns(timelineSelection[0])||smartSubtitles.busy||smartSubtitles.active||textLayers.length>=MAX_TEXT_LAYERS,onSelect:()=>{if(selectedSubtitle)void smartSubtitles.start(selectedSubtitle)}}]:[]
 function activateTimeline(ref:ClipboardSelection){if(ref.kind==='main'){setSelected(ref.index);setActiveTrack({kind:'video',index:ref.index})}else setActiveTrack({kind:ref.kind==='video'?'overlay':ref.kind,index:ref.index})}
 function selectTimeline(ref:ClipboardSelection,multi:boolean){
  if(!multi){setSelectionState(undefined);activateTimeline(ref);return}
  const selected=timelineSelection.some(item=>item.kind===ref.kind&&item.index===ref.index),items=selected?timelineSelection.filter(item=>item.kind!==ref.kind||item.index!==ref.index):[...timelineSelection,ref]
  setSelectionState({items,draft:clipboardDraft()});const primary=selected?items.at(-1):ref;if(primary)activateTimeline(primary)
 }
 const displayTransform = previewDrag?.target.kind==='video' ? {...animatedTransform,x:previewDrag.x,y:previewDrag.y,...(previewDrag.mode==='scale'?{scale:previewDrag.value}:previewDrag.mode==='rotate'?{rotation:previewDrag.value}:{})} : animatedTransform
 const displayVideos = previewDrag?.target.kind==='overlay' ? videoLayers.map((layer,i)=>i===previewDrag.target.index?{...layer,transform:{...(layer.transform??{scale:1,x:0,y:0,rotation:0,opacity:1}),x:previewDrag.x,y:previewDrag.y,...(previewDrag.mode==='scale'?{scale:previewDrag.value}:previewDrag.mode==='rotate'?{rotation:previewDrag.value}:{}),keyframes:{...layer.transform?.keyframes,x:undefined,y:undefined,...(previewDrag.mode==='scale'?{scale:undefined}:previewDrag.mode==='rotate'?{rotation:undefined}:{})}}}:layer) : videoLayers
 const displayImages = previewDrag?.target.kind==='image' ? imageLayers.map((layer,i)=>i===previewDrag.target.index?{...layer,x:previewDrag.x,y:previewDrag.y,...(previewDrag.mode==='scale'?{scale:previewDrag.value}:previewDrag.mode==='rotate'?{rotation:previewDrag.value}:{}),keyframes:{...layer.keyframes,x:undefined,y:undefined,...(previewDrag.mode==='scale'?{scale:undefined}:previewDrag.mode==='rotate'?{rotation:undefined}:{})}}:layer) : imageLayers
 const displayText = previewDrag?.target.kind==='text' ? textLayers.map((layer,i)=>i===previewDrag.target.index?{...layer,x:previewDrag.x,y:previewDrag.y,...(previewDrag.mode==='scale'?{scale:previewDrag.value}:previewDrag.mode==='rotate'?{rotation:previewDrag.value}:{}),keyframes:{...layer.keyframes,x:undefined,y:undefined,...(previewDrag.mode==='scale'?{scale:undefined}:previewDrag.mode==='rotate'?{rotation:undefined}:{})}}:layer) : textLayers
 const previewClips=clips.map(visibleClip), previewVideos=displayVideos.map(visibleVideo), previewImages=displayImages.map(visibleImage), previewText=displayText.map(visibleText), previewEffects=effectLayers.map(visibleEffect)
 const layersRef = useRef(audioLayers); layersRef.current = audioLayers
 const timelineDurationRef = useRef(timelineDuration); timelineDurationRef.current = timelineDuration
 const currentResource = operation === 'erase' ? resource : clip?.resource_uuid ?? resource
 const currentUrl = urls[currentResource]
 const stillCurrentUrl = useStillImage(operation==='edit' && clip?.media_type==='image'?currentUrl:undefined)
 // Moving a visual track can reparent the preview element. Preserve the
 // current frame only when the selected clip identity did not change.
 const previewIdentity=useRef(''),latestTime=useRef(time),imageElement=useRef<HTMLImageElement|null>(null)
 previewIdentity.current=`${operation}:${selected}:${currentResource}`;latestTime.current=time
 const bindVideo=useCallback((element:HTMLVideoElement|null)=>{
  const old=video.current
  if(!element && old && old.dataset.previewIdentity===previewIdentity.current){if(pendingSeek.current===undefined)pendingSeek.current=old.currentTime;if(!old.paused)resumePreview.current=true}
  video.current=element
 },[])
 const bindImage=useCallback((element:HTMLImageElement|null)=>{
  const old=imageElement.current
  if(!element && old && old.dataset.previewIdentity===previewIdentity.current){if(pendingSeek.current===undefined)pendingSeek.current=latestTime.current;if(imageFrame.current!==undefined){cancelAnimationFrame(imageFrame.current);imageFrame.current=undefined;resumePreview.current=true}}
  imageElement.current=element
 },[])
 const terminal = job && ['quoted', 'succeeded', 'failed', 'unknown'].includes(job.state)
 const locked = busy || recovering || Boolean(job && !terminal)
 const needsRect = operation === 'erase' && mode.endsWith('_sel_area')
 useEffect(()=>{editorMounted.current=true;return()=>{editorMounted.current=false}},[])
 useEffect(() => {
  let hasClipDraft=false; let savedMainTrackHidden:boolean|undefined; let savedMainTrackMuted=false; let effectDraft:EffectLayer[] = []; let draft: VideoClip[] = []; let videoDraft: VideoLayer[] = []; let audioDraft: AudioLayer[] = []; let imageDraft: ImageLayer[] = []; let textDraft: TextLayer[] = []; let bookmarkDraft:TimelineBookmark[] = []
  try { const raw = JSON.parse(draftKey ? editorStorage.getItem(draftKey) ?? 'null' : 'null') as { clips?: VideoClip[]; videoLayers?: VideoLayer[]; audioLayers?: AudioLayer[]; imageLayers?: ImageLayer[]; textLayers?: TextLayer[]; outputAspect?: VideoAspect; cover?: VideoCover; prependCover?: boolean; exportTitle?: string; bookmarks?:unknown; showBookmarkNotes?:boolean; projectFPS?:number; backgroundColor?:string; effectLayers?:EffectLayer[]; mainTrackHidden?:boolean; mainTrackMuted?:boolean } | VideoClip[] | null; const savedBookmarks = Array.isArray(raw) ? [] : raw?.bookmarks; if(Array.isArray(savedBookmarks)){const ids=new Set<string>();bookmarkDraft=savedBookmarks.filter(validBookmark).filter(item=>{if(ids.has(item.id))return false;ids.add(item.id);return true}).sort((a,b)=>a.time-b.time)}savedMainTrackHidden=!Array.isArray(raw)&&typeof raw?.mainTrackHidden==='boolean'?raw.mainTrackHidden:undefined;savedMainTrackMuted=!Array.isArray(raw)&&raw?.mainTrackMuted===true;setShowBookmarkNotes(Array.isArray(raw)||raw?.showBookmarkNotes!==false);const savedFPS=Array.isArray(raw)?undefined:raw?.projectFPS;setProjectFPS([24,25,30,60,120].includes(savedFPS ?? 0)?savedFPS as 24|25|30|60|120:30);const savedBackground=Array.isArray(raw)?undefined:raw?.backgroundColor;setBackgroundColor(typeof savedBackground==='string' && /^[0-9a-f]{6}$/i.test(savedBackground)?savedBackground:'000000'); const savedClips = Array.isArray(raw) ? raw : raw?.clips; const savedVideos = Array.isArray(raw) ? [] : raw?.videoLayers; const savedAudio = Array.isArray(raw) ? [] : raw?.audioLayers; const savedText = Array.isArray(raw) ? [] : raw?.textLayers; const savedImages = Array.isArray(raw) ? [] : raw?.imageLayers; const savedEffects=Array.isArray(raw)?[]:raw?.effectLayers; const savedAspect = Array.isArray(raw) ? '' : raw?.outputAspect; const savedCover=Array.isArray(raw)?undefined:raw?.cover; setExportTitle(!Array.isArray(raw) && typeof raw?.exportTitle==='string' ? raw.exportTitle.slice(0,100) : '视频处理'); setCover(savedCover && validCover(savedCover)?savedCover:undefined);setPrependCover(!Array.isArray(raw) && raw?.prependCover===true); setOutputAspect(typeof savedAspect === 'string' && Object.hasOwn(aspects,savedAspect) ? savedAspect : ''); if (Array.isArray(savedClips) && savedClips.length <= 32 && savedClips.every(c => typeof c.resource_uuid === 'string' && (c.media_type === undefined || c.media_type === 'video' || c.media_type === 'image') && (c.media_type !== 'image' || (c.rate === 1 && c.volume_db === 0 && c.end <= 600)) && (c.muted === undefined || typeof c.muted === 'boolean') && [c.start,c.end,c.rate,c.volume_db].every(Number.isFinite) && (c.transform === undefined || validVideoTransform(c.transform)) && validVisibility(c) && validVisualEffects(c.effects) && validBlendMode(c.blend_mode))) {draft = savedClips;hasClipDraft=true}; if (Array.isArray(savedVideos) && savedVideos.length <= 16 && savedVideos.every(v => typeof v.resource_uuid === 'string' && [v.start,v.end,v.source_start,v.rate,v.volume_db].every(Number.isFinite) && (v.muted === undefined || typeof v.muted === 'boolean') && (v.transform === undefined || validVideoTransform(v.transform)) && validVisualZ(v) && validVisibility(v) && validTrackId(v) && validVisualEffects(v.effects) && validBlendMode(v.blend_mode))) videoDraft=savedVideos; if (Array.isArray(savedAudio) && savedAudio.length <= 16 && savedAudio.every(a => typeof a.resource_uuid === 'string' && [a.start,a.end,a.source_start,a.volume_db].every(Number.isFinite) && (a.muted === undefined || typeof a.muted === 'boolean') && (a.track_muted === undefined || typeof a.track_muted === 'boolean') && validTrackId(a) && validTrackOrder(a))) audioDraft = savedAudio; if (Array.isArray(savedImages) && savedImages.length <= 16 && savedImages.every(i => typeof i.resource_uuid === 'string' && [i.start,i.end,i.x,i.y,i.scale,i.opacity].every(Number.isFinite) && validImageKeyframes(i) && validVisualZ(i) && validVisibility(i) && validTrackId(i) && (i.is_sticker===undefined||typeof i.is_sticker==='boolean') && validVisualEffects(i.effects) && validBlendMode(i.blend_mode))) imageDraft=savedImages; if(Array.isArray(savedEffects)&&savedEffects.length<=16&&savedEffects.every(e=>[e.start,e.end,e.intensity].every(Number.isFinite)&&e.start>=0&&e.end>e.start&&e.end<=600&&e.intensity>=0&&e.intensity<=100&&validVisualZ(e)&&validVisibility(e)&&validTrackId(e)))effectDraft=savedEffects; if (Array.isArray(savedText) && savedText.length <= MAX_TEXT_LAYERS && savedText.every(t => typeof t.text === 'string' && /^[0-9a-f]{6}$/i.test(t.color) && (t.font === 'sans' || t.font === 'serif') && [t.start,t.end,t.x,t.y,t.size,t.opacity].every(Number.isFinite) && validTextBackground(t) && validTextKeyframes(t) && validVisualZ(t) && validVisibility(t) && validTrackId(t) && validVisualEffects(t.effects) && validBlendMode(t.blend_mode))) textDraft = savedText } catch { /* A malformed local draft is ignored. */ }
  if (tailFrame.current !== undefined) cancelAnimationFrame(tailFrame.current)
  tailFrame.current=undefined; tailMode.current=false; setTailTime(undefined); setTailPlaying(false)
  initialClipNeeded.current=!hasClipDraft
  skipDraftSave.current = true; resetClips(draft, audioDraft, textDraft, imageDraft, videoDraft, bookmarkDraft,effectDraft,savedMainTrackHidden,savedMainTrackMuted); setSelected(0)
  let live = true
  void ctx.api.list(ctx.project).then(rows => { if (!live) return; const exports=rows.filter(row=>row.operation!=='subtitle');setJobs(exports); const pending = exports.find(j => j.source_resource_uuid === resource && !['quoted','succeeded','failed'].includes(j.state)); if (pending) setJob(pending) }).catch(() => { if(live) setError('E7009 历史任务暂时不可用') }).finally(() => { if(live) setRecovering(false) })
  return () => { live = false }
 }, [ctx.api, ctx.project, draftKey, resource, resetClips])
 useEffect(() => { if (skipDraftSave.current) skipDraftSave.current = false; else if (draftKey && !initialClipNeeded.current) { try { editorStorage.setItem(draftKey, JSON.stringify({ mainTrackHidden, mainTrackMuted, clips, videoLayers, audioLayers, imageLayers, textLayers, effectLayers, bookmarks, showBookmarkNotes, projectFPS, backgroundColor, outputAspect, cover, prependCover, exportTitle })) } catch { /* Storage availability does not block editing. */ } } }, [mainTrackHidden, mainTrackMuted, clips, videoLayers, audioLayers, imageLayers, textLayers, effectLayers, bookmarks, showBookmarkNotes, projectFPS, backgroundColor, draftKey, mode, operation, rect, selected, exportScope, outputFPS, outputResolution, includeAudio, outputFormat, outputAspect, outputKind, audioFormat, cover, prependCover, exportTitle])
 useEffect(()=>{setQuote(undefined)}, [mainTrackMuted, clips, videoLayers, audioLayers, imageLayers, textLayers, effectLayers, draftKey, mode, operation, rect, selected, exportScope, outputFPS, outputResolution, includeAudio, outputFormat, outputAspect, backgroundColor, outputKind, audioFormat, cover, prependCover, exportTitle])
 useEffect(() => {
  if (currentUrl) return
  let live = true; void ctx.api.source(ctx.project, currentResource).then(url => { if (live) setUrls(p => ({ ...p, [currentResource]: url })) }).catch(() => { if (live) setError('E7009 素材暂时不可用') }); return () => { live = false }
 }, [currentResource, currentUrl, ctx.api, ctx.project])
 useEffect(() => {
  let live = true
  for (const id of new Set(videoLayers.map(layer => layer.resource_uuid))) if (!urls[id]) void ctx.api.source(ctx.project,id).then(url=>{if(live)setUrls(previous=>({...previous,[id]:url}))}).catch(()=>{if(live)setError('E7009 视频素材暂时不可用')})
  return ()=>{live=false}
 }, [videoLayers,urls,ctx.api,ctx.project])
 useEffect(() => {
  let live = true
  for (const id of new Set(audioLayers.map(layer => layer.resource_uuid))) if (!urls[id]) void ctx.api.source(ctx.project, id).then(url => { if (live) setUrls(previous => ({ ...previous, [id]: url })) }).catch(() => { if (live) setError('E7009 音频素材暂时不可用') })
  return () => { live = false }
 }, [audioLayers, urls, ctx.api, ctx.project])
 useEffect(() => {
  let live=true
  for (const id of new Set(imageLayers.map(layer=>layer.resource_uuid))) if (!urls[id]) void ctx.api.source(ctx.project,id).then(url=>{if(live)setUrls(previous=>({...previous,[id]:url}))}).catch(()=>{if(live)setError('E7009 图片素材暂时不可用')})
  return ()=>{live=false}
 }, [imageLayers,urls,ctx.api,ctx.project])
 useEffect(() => {
  if (!job || terminal) return
  let live = true
  const timer = setInterval(() => { void ctx.api.get(ctx.project, job.uuid).then(next => { if (live) setJob(next) }).catch(() => { if (live) setError('E7009 状态查询暂时失败，任务仍可在处理记录中查看') }) }, 3000)
  return () => { live = false; clearInterval(timer) }
 }, [ctx.api, ctx.project, job?.uuid, terminal])
 useEffect(() => {
  const changed=()=>setPlayerFullscreen(document.fullscreenElement===player.current)
  document.addEventListener('fullscreenchange',changed)
  return ()=>{document.removeEventListener('fullscreenchange',changed);if(document.fullscreenElement===player.current)void document.exitFullscreen().catch(()=>{})}
 }, [])
 useEffect(() => () => { if (tailFrame.current !== undefined) cancelAnimationFrame(tailFrame.current); if (imageFrame.current !== undefined) cancelAnimationFrame(imageFrame.current) }, [])
 useEffect(() => {
  if (!previewPlaying || operation !== 'edit') return
  let frame: number
  const tick=() => { if (video.current && !video.current.paused) setTime(video.current.currentTime); frame=requestAnimationFrame(tick) }
  frame=requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
 }, [previewPlaying, operation])
 useEffect(() => { if(imageFrame.current!==undefined){cancelAnimationFrame(imageFrame.current);imageFrame.current=undefined;setPreviewPlaying(false)} }, [selected, currentResource, operation])
 useEffect(() => { if (operation !== 'edit' && tailMode.current) { if (tailFrame.current !== undefined) cancelAnimationFrame(tailFrame.current); tailFrame.current=undefined; tailMode.current=false; setTailTime(undefined); setTailPlaying(false) } }, [operation])
 useEffect(() => {
  if (!tailMode.current) return
  if (timelineDuration <= totalDuration + .001) {
   if (tailFrame.current !== undefined) cancelAnimationFrame(tailFrame.current)
   tailFrame.current=undefined; tailMode.current=false; setTailTime(undefined); setTailPlaying(false); audioElements.current.forEach(element => element.pause())
   const last = clips.length - 1
   if (last >= 0) { pendingSeek.current=clips[last].end; setTime(clips[last].end); if (last===selected && video.current) { video.current.currentTime=clips[last].end; pendingSeek.current=undefined } else setSelected(last) }
  } else if (tailPosition.current < totalDuration) seekTimeline(tailPosition.current)
  else if (tailPosition.current > timelineDuration) pauseTail(timelineDuration)
 }, [timelineDuration, totalDuration])
 useEffect(() => {
  const v = video.current; if (!v) return
  v.playbackRate = operation === 'edit' ? clip?.rate ?? 1 : 1
  v.volume = Math.min(1, Math.pow(10, (operation === 'edit' ? clip?.volume_db ?? 0 : 0) / 20))
  v.muted = operation === 'edit' && (mainTrackMuted || clip?.muted === true)
 }, [clip?.rate, clip?.volume_db, clip?.muted, mainTrackMuted, selected, currentUrl, operation])
 useEffect(()=>{if(operation==='edit'&&!clips.length&&!initialClipNeeded.current&&!tailMode.current){video.current?.pause();if(imageFrame.current!==undefined){cancelAnimationFrame(imageFrame.current);imageFrame.current=undefined}setPreviewPlaying(false);tailMode.current=true;tailPosition.current=0;setTailTime(0);setTailPlaying(false);syncAudio(0,false)}},[operation,clips.length])
 useEffect(() => { if (operation === 'edit' && clip && video.current && video.current.readyState >= 1) restorePreviewPosition() }, [selected, clip?.start, operation, currentUrl])
 useEffect(() => {
  const v = video.current
  if (operation === 'edit' && clip && v && v.currentTime > clip.end) { v.pause(); v.currentTime = clip.end; setTime(clip.end) }
 }, [clip?.end, operation])
 function beginPreviewDrag(canvas:HTMLDivElement,e:ReactPointerEvent<HTMLElement>,target:PreviewTarget,mode:'move'|'scale'|'rotate') {
  if(operation!=='edit'||locked||e.button!==0)return
  const original=target.kind==='video'?clip:target.kind==='overlay'?videoLayers[target.index]:target.kind==='image'?imageLayers[target.index]:textLayers[target.index]
  if(!original)return
  setSelectionState(undefined);setActiveTrack({kind:target.kind,index:target.index})
  const at=target.kind==='video'?time:target.kind==='overlay'?(original as VideoLayer).source_start+(playhead-(original as VideoLayer).start)*(original as VideoLayer).rate:playhead
  const keys=target.kind==='video'||target.kind==='overlay'?(original as VideoClip|VideoLayer).transform?.keyframes:(original as ImageLayer|TextLayer).keyframes
  const fields=mode==='move'?['x','y']:mode==='scale'?['scale']:['rotation']
  if(fields.some(key=>{const points=(keys as Record<string,{time:number}[]>|undefined)?.[key]??[];return points.length>=32&&!points.some(point=>Math.abs(point.time-keyframeTime(at))<.001)})){setError('E7009 当前位置无法添加更多关键帧');return}
  video.current?.pause();if(imageFrame.current!==undefined)pauseImage();if(tailPlaying)pauseTail()
  const box=canvas.getBoundingClientRect(), x=target.kind==='video'||target.kind==='overlay'?target.x-.5:target.x, y=target.kind==='video'||target.kind==='overlay'?target.y-.5:target.y
  let value=0
  if(mode==='scale')value=target.kind==='text'?valueAt((original as TextLayer).scale ?? 1,(original as TextLayer).keyframes?.scale,at):target.kind==='image'?valueAt((original as ImageLayer).scale,(original as ImageLayer).keyframes?.scale,at):valueAt(((original as VideoClip|VideoLayer).transform?.scale??1),(original as VideoClip|VideoLayer).transform?.keyframes?.scale,at)
  else if(mode==='rotate')value=target.rotation
  dragRef.current={target,x,y,at,original,mode,value,clientX:e.clientX,clientY:e.clientY,width:box.width,height:box.height,lastAngle:Math.atan2(e.clientY-(target.pivotY??target.cy),e.clientX-(target.pivotX??target.cx)),angleDelta:0}
  canvas.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation()
 }
 function previewPointerDown(e:ReactPointerEvent<HTMLDivElement>) {
  if(operation!=='edit'||locked||e.button!==0 || (e.target instanceof Element && e.target.closest('button')))return
  const target=hitPreview(previewTargets(e.currentTarget,clip?.transform,selected,tailTime===undefined&&!isHidden(clip),previewVideos,previewImages,previewText,urls,playhead,time),e.clientX,e.clientY)
  if(target)beginPreviewDrag(e.currentTarget,e,target,'move')
 }
 function previewHandle(e:ReactPointerEvent<HTMLButtonElement>,mode:'scale'|'rotate') {
  const canvas=previewCanvas.current;if(!canvas)return
  const target=previewTargets(canvas,clip?.transform,selected,tailTime===undefined&&!isHidden(clip),previewVideos,previewImages,previewText,urls,playhead,time).find(item=>item.kind===activeTrack.kind&&item.index===activeTrack.index)
  if(target)beginPreviewDrag(canvas,e,target,mode)
 }
 function previewDragValue(drag:PreviewDragStart,clientX:number,clientY:number):PreviewDrag {
  if(drag.mode==='move') {const min=drag.target.kind==='text'?0:-2,max=drag.target.kind==='text'?1:2,clamp=(v:number)=>Math.max(min,Math.min(max,v));return {...drag,x:clamp(drag.x+(clientX-drag.clientX)/drag.width),y:clamp(drag.y+(clientY-drag.clientY)/drag.height)}}
  if(drag.mode==='scale') {const start=Math.hypot(drag.clientX-(drag.target.pivotX??drag.target.cx),drag.clientY-(drag.target.pivotY??drag.target.cy)),end=Math.hypot(clientX-(drag.target.pivotX??drag.target.cx),clientY-(drag.target.pivotY??drag.target.cy)),min=.1,max=4;return {...drag,value:Math.max(min,Math.min(max,drag.value*end/Math.max(1,start)))}}
  const angle=Math.atan2(clientY-(drag.target.pivotY??drag.target.cy),clientX-(drag.target.pivotX??drag.target.cx)),delta=Math.atan2(Math.sin(angle-drag.lastAngle),Math.cos(angle-drag.lastAngle));drag.lastAngle=angle;drag.angleDelta+=delta
  return {...drag,value:Math.max(-360,Math.min(360,drag.value+drag.angleDelta*180/Math.PI))}
 }
 function previewPointerMove(e:ReactPointerEvent<HTMLDivElement>) {const drag=dragRef.current;if(drag)setPreviewDrag(previewDragValue(drag,e.clientX,e.clientY))}
 function previewPointerEnd(e:ReactPointerEvent<HTMLDivElement>,cancel=false) {
  const drag=dragRef.current;if(!drag)return;dragRef.current=undefined
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)
  setPreviewDrag(undefined);if(cancel)return
  const result=previewDragValue(drag,e.clientX,e.clientY),{x,y,value}=result
  if(drag.mode==='move'?Math.abs(x-drag.x)<.0001&&Math.abs(y-drag.y)<.0001:Math.abs(value-drag.value)<.0001)return
  setQuote(undefined)
  if(drag.target.kind==='video'||drag.target.kind==='overlay') {
   const apply=(item:VideoClip|VideoLayer)=>{let t=item.transform??{scale:1,x:0,y:0,rotation:0,opacity:1};if(drag.mode==='move'){t=t.keyframes?.x?.length?setVideoKeyframe(t,'x',drag.at,x):{...t,x};t=t.keyframes?.y?.length?setVideoKeyframe(t,'y',drag.at,y):{...t,y}}else {const key=drag.mode==='scale'?'scale':'rotation';t=t.keyframes?.[key]?.length?setVideoKeyframe(t,key,drag.at,value):{...t,[key]:value}}return {...item,transform:t}}
   if(drag.target.kind==='video')setClips(previous=>previous.map((item,i)=>i===drag.target.index&&item===drag.original?apply(item) as VideoClip:item))
   else setVideoLayers(previous=>previous.map((item,i)=>i===drag.target.index&&item===drag.original?apply(item) as VideoLayer:item))
  } else if(drag.target.kind==='image')setImageLayers(previous=>previous.map((item,i)=>{if(i!==drag.target.index||item!==drag.original)return item;if(drag.mode==='move'){let next=item.keyframes?.x?.length?setImageKeyframe(item,'x',drag.at,x):{...item,x};next=next.keyframes?.y?.length?setImageKeyframe(next,'y',drag.at,y):{...next,y};return next}const key=drag.mode==='scale'?'scale':'rotation';return item.keyframes?.[key]?.length?setImageKeyframe(item,key,drag.at,value):{...item,[key]:value}}))
  else setTextLayers(previous=>previous.map((item,i)=>{if(i!==drag.target.index||item!==drag.original)return item;if(drag.mode==='scale')return item.keyframes?.scale?.length?setTextKeyframe(item,'scale',drag.at,value):{...item,scale:value};if(drag.mode==='rotate')return item.keyframes?.rotation?.length?setTextKeyframe(item,'rotation',drag.at,value):{...item,rotation:value};let next=item.keyframes?.x?.length?setTextKeyframe(item,'x',drag.at,x):{...item,x};next=next.keyframes?.y?.length?setTextKeyframe(next,'y',drag.at,y):{...next,y};return next}))
 }
 function addText(style:TextPresetStyle,requestedStart:number,preferred?:Pick<VisualRef,'kind'|'index'>,placement:'auto'|'target'='auto',position?:TrackPosition) {
  if(locked || textLayers.length>=MAX_TEXT_LAYERS)return
  const start=Math.max(0,Math.min(599.95,requestedStart)),end=Math.min(600,start+5)
  setQuote(undefined);insertVisualLayer('text',{...style,...(style.background?{background:{...style.background}}:{}),start,end},newTrackId(),preferred,undefined,placement,position);setActiveTrack({kind:'text',index:textLayers.length})
 }
 function dropFrameTime(event:React.DragEvent<HTMLDivElement>) {
  const box=event.currentTarget.getBoundingClientRect(),raw=Math.max(0,Math.min(599.95,(event.clientX-box.left-TRACK_HEADER)/pixelsPerSecond))
  return Math.max(0,Math.min(599.95,frameTime(raw,projectFPS)))
 }
 function positionFor(key:string|undefined,above:boolean|undefined,kind:'visual'|'audio'):TrackPosition|undefined {
  if(key===undefined)return undefined
  const visual=visualOrder.find(track=>track.key===key),audio=audioOrder.find(track=>track.key===key),main=key==='main'
  return {anchorKey:kind==='visual'?visual?.key:audio?.key,side:above?'above':'below',edge:kind==='visual'?(main||audio||(key==='outside'&&above===false)?'bottom':'top'):(main||visual||(key==='outside'&&above===true)?'top':'bottom')}
 }
 function dropLocation(event:React.DragEvent<HTMLDivElement>) {
  const target=event.target as Element,row=target.closest('[data-video-tool-track]'),main=target.closest('[data-main-video-track]'),box=(row??main)?.getBoundingClientRect(),mainBox=event.currentTarget.querySelector('[data-main-video-track]')?.getBoundingClientRect(),key=row?.getAttribute('data-video-tool-track')??(main?'main':'outside'),above=box?event.clientY<box.top+box.height/2:mainBox?event.clientY<mainBox.top:undefined
  const visual=visualOrder.find(track=>track.key===key),audio=audioOrder.find(track=>track.key===key)
  return {key,main:Boolean(main),visual,audio,visualPosition:positionFor(key,above,'visual')!,audioPosition:positionFor(key,above,'audio')!}
 }
 function timelineDrop(event:React.DragEvent<HTMLDivElement>) {
  if(locked){if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.stopPropagation()}return}
  const source=sourceDrag.current,style=textPresetDrag.current,where=dropLocation(event)
  if(event.dataTransfer.types.includes('application/x-flowx-video-clip-index')&&!where.main){
   event.preventDefault();event.stopPropagation();const raw=event.dataTransfer.getData('application/x-flowx-video-clip-index'),offset=Number(event.dataTransfer.getData('application/x-flowx-video-clip-offset'))||0,index=/^\d+$/.test(raw)?Number(raw):-1,state=clipboardDraft(),start=Math.max(0,frameTime(dropFrameTime(event)-offset,projectFPS)),clip=state.clips[index],known=clip?durations[clip.resource_uuid]:undefined,result=clip&&clip.media_type!=='image'&&known!==undefined&&clip.end>known+.05?undefined:moveMainToVisual(state,index,start,newTrackId(),where.key,where.visualPosition)
   if(!result){setError('E7009 无法移动到叠加轨，请检查主轨、时长及轨道容量');return}
   setError('');setQuote(undefined);applyTransaction(result.draft,state);setSelectionState({items:[result.selection],draft:result.draft});setSelected(Math.max(0,Math.min(selected,result.draft.clips.length-1)));if(!result.draft.clips.length)setExportScope('timeline');activateTimeline(result.selection);return
  }
  if(stickerDrag.current && event.dataTransfer.types.includes('application/x-flowx-sticker')) {
   event.preventDefault();event.stopPropagation();const sticker=stickerDrag.current,at=dropFrameTime(event),preferred=where.visual?.category==='sticker'?where.visual.refs[0]:undefined;stickerDrag.current=undefined;setTextPresetDrop(undefined);void addSticker(sticker,at,preferred,where.visualPosition)
  } else if(effectDrag.current && event.dataTransfer.types.includes('application/x-flowx-effect')) {
   event.preventDefault();event.stopPropagation();effectDrag.current=false;setTextPresetDrop(undefined)
   const target=(event.target as Element).closest('[data-effect-kind]'),kind=target?.getAttribute('data-effect-kind'),raw=target?.getAttribute('data-effect-index'),index=raw && /^\d+$/.test(raw)?Number(raw):-1
   if(kind==='video'||kind==='overlay'||kind==='image'||kind==='text')attachEffect(kind,index);else addEffect(dropFrameTime(event))
  } else if(!source&&!style&&event.dataTransfer.types.includes('Files')) {
   event.preventDefault();event.stopPropagation();if(!ctx.library){setError('E7009 素材上传暂不可用');return}if(!event.dataTransfer.files.length){setError('E7009 请选择可读取的媒体文件');return}
   const files=Array.from(event.dataTransfer.files);setTextPresetDrop(undefined);void dropFiles(files,{main:where.main,visual:where.visual?.category==='video'?where.visual.refs[0]:undefined,audio:where.audio?.indices[0],visualPosition:where.visualPosition,audioPosition:where.audioPosition})
  }else if(source&&event.dataTransfer.types.includes('application/x-flowx-source')) {
   event.preventDefault();event.stopPropagation();const at=dropFrameTime(event),preferred=where.visual?.category==='video'?where.visual.refs[0]:undefined;sourceDrag.current=undefined;setTextPresetDrop(undefined)
   if(source.kind==='video'){if(where.main||(where.key==='outside'&&videoAddMode==='main'))void addSource(source.id);else void addOverlay(source.id,at,preferred,where.visualPosition)}
   else if(source.kind==='image'){if(where.main)void addMainImage(source.id);else void addImageSource(source.id,at,preferred,where.visualPosition)}
   else {setAddedAudioSources(previous=>[...previous.filter(item=>item.resource!==source.id),{resource:source.id,name:source.name}]);void addAudioSource(source.id,at,where.audio?.indices[0],where.audioPosition)}
  }else if(style&&event.dataTransfer.types.includes('application/x-flowx-text-preset')) {
   event.preventDefault();event.stopPropagation();const at=dropFrameTime(event),preferred=where.visual?.category==='text'?where.visual.refs[0]:undefined;textPresetDrag.current=undefined;setTextPresetDrop(undefined);addText(style,at,preferred,'target',where.visualPosition)
  }
 }
 async function fileDuration(file:File,kind:'video'|'audio'):Promise<number> {
  const element=document.createElement(kind),url=URL.createObjectURL(file)
  return new Promise((resolve,reject)=>{
   const finish=(duration?:number)=>{clearTimeout(timer);element.onloadedmetadata=null;element.onerror=null;element.removeAttribute('src');element.load();URL.revokeObjectURL(url);if(duration!==undefined&&Number.isFinite(duration)&&duration>0)resolve(duration);else reject(new Error('E7009'))}
   const timer=setTimeout(()=>finish(),15000);element.preload='metadata';element.onloadedmetadata=()=>finish(element.duration);element.onerror=()=>finish();element.src=url
  })
 }
 async function verifyImageFile(file:File):Promise<void> {
  const image=new Image(),url=URL.createObjectURL(file)
  return new Promise((resolve,reject)=>{
   const finish=(valid:boolean)=>{clearTimeout(timer);image.onload=null;image.onerror=null;URL.revokeObjectURL(url);if(valid)resolve();else reject(new Error('E7009'))}
   const timer=setTimeout(()=>finish(false),15000);image.onload=()=>finish(image.naturalWidth>0&&image.naturalHeight>0);image.onerror=()=>finish(false);image.src=url
  })
 }
 async function dropFiles(files:File[],target:{main:boolean;visual?:Pick<VisualRef,'kind'|'index'>;audio?:number;visualPosition:TrackPosition;audioPosition:TrackPosition}) {
  const library=ctx.library;if(!library||droppingFiles.current||locked)return
  droppingFiles.current=true;setBusy(true);setError('')
  const counts={main:clips.length,video:videoLayers.length,image:imageLayers.length,audio:audioLayers.length};let failed=0
  const start=playhead>=599.95?0:playhead
  try {
   for(const file of files){
    if(!editorMounted.current)break
    let kind:SourceKind
    try{const value=validateMediaUploadFile(file);if(value.modality!=='video'&&value.modality!=='audio'&&value.modality!=='image')throw new Error();if(value.modality==='image'&&!/\.(png|jpe?g|webp|gif)$/i.test(value.file_name))throw new Error();kind=value.modality}catch{failed++;continue}
    const main=(kind==='video'||kind==='image')&&target.main,slot=main?'main':kind,limit=main?32:16
    if(counts[slot]>=limit){failed++;continue}
    try{
     const duration=kind==='image'?(await verifyImageFile(file),5):await fileDuration(file,kind);if(!editorMounted.current)break
     const ok=await library.uploadAsset(file),resource=library.getSnapshot().upload.resource_uuid;if(!editorMounted.current)break;if(!ok||!resource)throw new Error()
     const item:DroppedMedia={kind,resource,duration,start,id:newTrackId(),main,visualTarget:target.visual,audioTarget:target.audio,visualPosition:target.visualPosition,audioPosition:target.audioPosition};counts[slot]++
     setQuote(undefined);insertDroppedMedia([item])
     const selection=main?'video':kind==='video'?'overlay':kind,index=main?counts.main-1:kind==='video'?counts.video-1:kind==='image'?counts.image-1:counts.audio-1
     if(main)setSelected(index);setActiveTrack({kind:selection,index})
     if(kind==='video')setDurations(previous=>({...previous,[resource]:duration}))
     else if(kind==='audio'){setAudioDurations(previous=>({...previous,[resource]:duration}));setAddedAudioSources(previous=>[...previous.filter(item=>item.resource!==resource),{resource,name:file.name}])}
    }catch{failed++}
   }
   if(failed&&editorMounted.current)setError(`E7009 ${failed} 个文件未能添加，请检查格式、大小或上传权限`)
  }finally{droppingFiles.current=false;if(editorMounted.current)setBusy(false)}
 }
 async function addMainImage(id:string) {
  if (!id || clips.length>=32) return
  setBusy(true);setError('')
  try {
   const url=urls[id] ?? await ctx.api.source(ctx.project,id)
   setUrls(previous=>({...previous,[id]:url}));setQuote(undefined)
   setClips(previous=>[...previous,{resource_uuid:id,media_type:'image',start:0,end:5,rate:1,volume_db:0,...(mainTrackHidden?{track_hidden:true}:{})}])
   setSelected(clips.length);setActiveTrack({kind:'video',index:clips.length})
  } catch {setError('E7009 图片素材暂时不可用')} finally {setBusy(false)}
 }
 function imageMetadata(element:HTMLImageElement) {
  if (!clip || clip.media_type!=='image' || !element.naturalWidth || !element.naturalHeight) return
  setLoadedResource(currentResource);setDimensions({width:element.naturalWidth,height:element.naturalHeight});setSourceDimensions(previous=>({...previous,[currentResource]:{width:element.naturalWidth,height:element.naturalHeight}}))
  const position=pendingSeek.current ?? clip.start;pendingSeek.current=undefined;setTime(position)
  if(resumePreview.current){resumePreview.current=false;startImage(position)}
 }
 function pauseImage() {
  if(imageFrame.current!==undefined)cancelAnimationFrame(imageFrame.current)
  imageFrame.current=undefined;setPreviewPlaying(false)
  syncAudio(playhead,false)
 }
 function startImage(position:number) {
  if(!clip || clip.media_type!=='image')return
  if(imageFrame.current!==undefined)cancelAnimationFrame(imageFrame.current)
  const start=Math.max(clip.start,Math.min(position>=clip.end?clip.start:position,clip.end)),started=performance.now(),offset=clips.slice(0,selected).reduce((sum,item)=>sum+clipDuration(item),0)
  setTime(start);setPreviewPlaying(true);syncAudio(offset+start-clip.start,true)
  const tick=(now:number)=>{
   const next=Math.min(clip.end,start+(now-started)/1000),at=offset+next-clip.start
   setTime(next);syncAudio(at,next<clip.end)
   if(next<clip.end){imageFrame.current=requestAnimationFrame(tick);return}
   imageFrame.current=undefined;setPreviewPlaying(false)
   if(selected<clips.length-1){pendingSeek.current=clips[selected+1].start;resumePreview.current=true;setSelected(selected+1)}
   else if(timelineDurationRef.current>totalDuration+.001)startTail(totalDuration)
  }
  imageFrame.current=requestAnimationFrame(tick)
 }
 function togglePlayback() {
  if(tailTime!==undefined){if(tailPlaying)pauseTail();else startTail(tailTime>=timelineDuration?totalDuration:tailTime)}
  else if(clip?.media_type==='image' && operation==='edit'){if(imageFrame.current!==undefined)pauseImage();else startImage(time)}
  else if(video.current){if(video.current.paused)void video.current.play().catch(()=>setError('E7009 视频预览暂时不可用'));else video.current.pause()}
 }
 function metadata() {
  const v = video.current; if (!v || !Number.isFinite(v.duration)) return
  setLoadedResource(currentResource); setDimensions({ width: v.videoWidth, height: v.videoHeight }); setSourceDimensions(p => ({ ...p, [currentResource]: { width:v.videoWidth, height:v.videoHeight } })); setDurations(p => ({ ...p, [currentResource]: v.duration }))
  if(initialClipNeeded.current){initialClipNeeded.current=false;initializeClips([{ resource_uuid: resource, start: 0, end: v.duration, rate: 1, volume_db: 0 }])}
  if (operation === 'edit' && clip) restorePreviewPosition()
 }
 function restorePreviewPosition() {
  const v=video.current;if(!v||!clip)return
  v.currentTime=pendingSeek.current ?? clip.start;setTime(v.currentTime);pendingSeek.current=undefined;v.playbackRate=clip.rate
  if(resumePreview.current){resumePreview.current=false;void v.play().catch(()=>{})}
 }
 function previewTimeUpdate(ended=false) {
  if (tailMode.current) return
  const v=video.current;if(!v)return;setTime(v.currentTime)
  syncAudio(clips.slice(0,selected).reduce((n,c)=>n+clipDuration(c),0)+(clip?Math.max(0,(v.currentTime-clip.start)/clip.rate):0), !v.paused)
  if(operation!=='edit'||!clip||v.currentTime<clip.end-0.01)return
  if((!v.paused||ended)&&selected<clips.length-1){resumePreview.current=true;setSelected(selected+1)}else if((!v.paused||ended) && timelineDuration>totalDuration+.001){tailMode.current=true;v.pause();startTail(totalDuration)}else if(v.currentTime>clip.end){v.pause();v.currentTime=clip.end}
 }
 function seekTimeline(seconds:number) {
  const wasPlaying = tailPlaying || imageFrame.current!==undefined || Boolean(video.current&&!video.current.paused)
  if(imageFrame.current!==undefined){cancelAnimationFrame(imageFrame.current);imageFrame.current=undefined;setPreviewPlaying(false)}
  if (!clips.length || (seconds >= totalDuration && timelineDuration > totalDuration + .001)) {
   tailMode.current = true; video.current?.pause(); tailPosition.current = seconds; setTailTime(seconds)
   if (wasPlaying && seconds < timelineDuration) startTail(seconds); else pauseTail(seconds)
   return
  }
  if (tailFrame.current !== undefined) cancelAnimationFrame(tailFrame.current)
  tailFrame.current = undefined; tailMode.current = false; setTailTime(undefined); setTailPlaying(false)
  const target=timelineSeek(clips,seconds);pendingSeek.current=target.sourceTime;setTime(target.sourceTime);resumePreview.current=Boolean(video.current&&!video.current.paused)
  resumePreview.current=wasPlaying; syncAudio(seconds, wasPlaying)
  if(target.index===selected&&clips[target.index]?.media_type==='image'){pendingSeek.current=undefined;resumePreview.current=false;if(wasPlaying)startImage(target.sourceTime)}else if(target.index===selected&&video.current){video.current.currentTime=target.sourceTime;pendingSeek.current=undefined;resumePreview.current=false;if(wasPlaying&&video.current.paused)void video.current.play().catch(()=>{})}else setSelected(target.index)
 }
 function rulerSeekTime(event:React.PointerEvent<HTMLDivElement>):number {
  const box=event.currentTarget.getBoundingClientRect(),raw=Math.max(0,Math.min(timelineDuration,frameTime((event.clientX-box.left)/pixelsPerSecond,projectFPS)))
  if(!snap||event.shiftKey)return raw
  const targets=timelineSnapTargets(clips,videoBoundaries,videoLayers,audioLayers,imageLayers,textLayers,playhead,'video',-1,bookmarks,false,effectLayers)
  return Math.max(0,Math.min(timelineDuration,snapTime(raw,targets,10/pixelsPerSecond)))
 }
 function toggleAtPlayhead() {
  const at=Math.max(0,Math.min(timelineDuration,frameTime(playhead,projectFPS))),id=newTrackId()
  setBookmarks(previous=>toggleBookmark(previous,at,id))
 }
 function moveBookmarkAt(id:string,original:number,time:number) {
  setBookmarks(previous=>previous.some(item=>item.id===id&&Math.abs(item.time-original)<.001)?moveBookmark(previous,id,time):previous)
 }
 function update(change: Partial<VideoClip>) { setClips(p => p.map((c, i) => i === selected ? { ...c, ...change } : c)) }
 function syncAudio(seconds: number, playing: boolean) {
  layersRef.current.forEach((layer, index) => {
   const element = audioElements.current.get(index); if (!element) return
   const active = seconds >= layer.start && seconds < layer.end
   const desired = Math.max(0, layer.source_start + Math.max(0, seconds - layer.start))
   element.muted = Boolean(layer.muted || layer.track_muted)
   element.volume = Number.isFinite(layer.volume_db) ? Math.min(1, Math.pow(10, layer.volume_db / 20)) : 0
   if (active && Number.isFinite(desired) && Number.isFinite(element.duration) && Math.abs(element.currentTime - desired) > .2) element.currentTime = Math.min(element.duration, desired)
   wantedAudioPlay.current.set(index, active && playing)
   if (active && playing) { if (element.paused && !pendingAudioPlay.current.has(index)) { pendingAudioPlay.current.add(index); void element.play().then(() => { if (!wantedAudioPlay.current.get(index) || audioElements.current.get(index) !== element) element.pause() }).catch(() => setError('E7009 音频预览暂时不可用')).finally(() => pendingAudioPlay.current.delete(index)) } } else if (!element.paused) element.pause()
  })
 }
 useEffect(() => { if(operation==='edit') syncAudio(playhead,previewPlaying || tailPlaying) }, [audioLayers])
 function pauseTail(position = tailPosition.current) {
  if (tailFrame.current !== undefined) cancelAnimationFrame(tailFrame.current)
  tailFrame.current=undefined; tailPosition.current=position; setTailTime(position); setTailPlaying(false); syncAudio(position,false)
 }
 function startTail(position: number) {
  if (tailFrame.current !== undefined) cancelAnimationFrame(tailFrame.current)
  tailMode.current=true; tailPosition.current=position; setTailTime(position); setTailPlaying(true); syncAudio(position,true)
  const started=performance.now()
  const tick=(now:number) => { const next=Math.min(timelineDurationRef.current,position+(now-started)/1000); tailPosition.current=next; setTailTime(next); syncAudio(next,next<timelineDurationRef.current); if(next<timelineDurationRef.current) tailFrame.current=requestAnimationFrame(tick); else { tailFrame.current=undefined; setTailPlaying(false) } }
  tailFrame.current=requestAnimationFrame(tick)
 }
 function selectedLayer() { return activeTrack.kind==='overlay'?videoLayers[activeTrack.index]:activeTrack.kind==='audio'?audioLayers[activeTrack.index]:activeTrack.kind==='image'?imageLayers[activeTrack.index]:activeTrack.kind==='text'?textLayers[activeTrack.index]:activeTrack.kind==='effect'?effectLayers[activeTrack.index]:undefined }
 function toggleSelectedVisibility() {
  if(timelineSelection.length!==1){const state=clipboardDraft(),next=toggleTimelineVisibility(state,timelineSelection);if(!next)return;setQuote(undefined);applyTransaction(next,state);setSelectionState({items:timelineSelection,draft:next});return}
  setQuote(undefined);const index=activeIsVideo?selected:activeTrack.index
  if(activeIsVideo)setClips(previous=>previous.map((item,i)=>i===index?{...item,hidden:!item.hidden}:item))
  else if(activeTrack.kind==='overlay')setVideoLayers(previous=>previous.map((item,i)=>i===index?{...item,hidden:!item.hidden}:item))
  else if(activeTrack.kind==='image')setImageLayers(previous=>previous.map((item,i)=>i===index?{...item,hidden:!item.hidden}:item))
  else if(activeTrack.kind==='text')setTextLayers(previous=>previous.map((item,i)=>i===index?{...item,hidden:!item.hidden}:item))
  else if(activeTrack.kind==='effect')setEffectLayers(previous=>previous.map((item,i)=>i===index?{...item,hidden:!item.hidden}:item))
 }
 function moveSelectedItem(ref:ClipboardSelection,original:RippleLayer,updated:RippleLayer,target:string|undefined,source:string,mode:'move'|'start'|'end',above?:boolean) {
  if(ref.kind==='main')return
  const state=clipboardDraft();let next:ClipboardDraft|undefined
  if(rippleEditing&&mode!=='move'&&(!target||target===source)){
   const changed=rippleTrim(state,{kind:ref.kind,index:ref.index},updated);if(changed)next={...state,...changed}
  }else if(ref.kind==='audio'){
   const track=audioTracks(audioLayers).find(group=>group.key===source),siblings=(track?.indices??[]).filter(index=>index!==ref.index).map(index=>audioLayers[index])
   const safe=constrainTrackTrim(original as AudioLayer,updated as AudioLayer,mode,siblings,audioDurations[(original as AudioLayer).resource_uuid])
   if(safe.start===original.start&&safe.end===original.end&&(!target||target===source))return
   const layers=moveAudioItem(audioLayers,ref.index,safe,newTrackId(),target,positionFor(target,above,'audio'));if(layers)next={...state,audioLayers:layers}
  }else{
   const track=visualOrder.find(group=>group.key===source),siblings=(track?.refs??[]).filter(item=>item.kind!==ref.kind||item.index!==ref.index).map(item=>item.kind==='video'?videoLayers[item.index]:item.kind==='image'?imageLayers[item.index]:item.kind==='text'?textLayers[item.index]:effectLayers[item.index])
   const safe=constrainTrackTrim(original as VisualLayer,updated as VisualLayer,mode,siblings,ref.kind==='video'?durations[(original as VideoLayer).resource_uuid]:undefined)
   if(safe.start===original.start&&safe.end===original.end&&(!target||target===source))return
   const layers=moveVisualItem({videos:videoLayers,images:imageLayers,text:textLayers,effects:effectLayers},{kind:ref.kind,index:ref.index},safe,newTrackId(),target,positionFor(target,above,'visual'))
   if(layers)next={...state,videoLayers:layers.videos,imageLayers:layers.images,textLayers:layers.text,effectLayers:layers.effects??[]}
  }
  if(!next){setError('E7009 无法移动片段，请检查时间范围及轨道');return}
  const destination=ref.kind==='audio'?audioTracks(next.audioLayers).find(group=>group.indices.includes(ref.index))?.key:visualTracks(next.videoLayers,next.imageLayers,next.textLayers,next.effectLayers).find(group=>group.refs.some(item=>item.kind===ref.kind&&item.index===ref.index))?.key
  const items=destination===source?timelineSelection:[ref];setError('');setQuote(undefined);applyTransaction(next,state);setSelectionState({items,draft:next});if(destination!==source)activateTimeline(ref)
 }
 function transferVisualToMain(kind:'video'|'image',index:number) {
  const state=clipboardDraft(),video=kind==='video'?state.videoLayers[index]:undefined,known=video?durations[video.resource_uuid]:undefined,result=video&&known!==undefined&&video.source_start+(video.end-video.start)*video.rate>known+.05?undefined:moveVisualToMain(state,kind,index,rippleEditing,mainTrackHidden)
  if(!result){setError('E7009 无法移动到主轨，请检查时长、位置及关键帧');return}
  const clip=result.draft.clips[result.selection.index];pendingSeek.current=clip.start;setTailTime(undefined);setTailPlaying(false);setError('');setQuote(undefined);applyTransaction(result.draft,state);setSelectionState({items:[result.selection],draft:result.draft});setSelected(result.selection.index);setActiveTrack({kind:'video',index:result.selection.index})
 }
 function toggleSelectedMute() {
  const state=clipboardDraft(),next=toggleTimelineMute(state,timelineSelection);if(!next)return
  setError('');setQuote(undefined);applyTransaction(next,state);setSelectionState({items:timelineSelection,draft:next})
 }
 function toggleVisualTrackVisibility(kind:'video'|'image'|'text'|'effect',index:number) {setQuote(undefined);toggleVisualTrack(kind,index)}
 function toggleAudioTrackMute(index:number) {setQuote(undefined);setAudioLayers(previous=>{const track=audioTracks(previous).find(group=>group.indices.includes(index));if(!track)return previous;const muted=!Boolean(previous[track.indices[0]].track_muted),members=new Set(track.indices);return previous.map((item,i)=>members.has(i)?{...item,track_muted:muted}:item)})}
 function toggleMainTrackVisibility() {setQuote(undefined);toggleMainTrack()}
 function rippleRef(kind:'overlay'|'audio'|'image'|'text'|'effect',index:number):RippleRef {return {kind:kind==='overlay'?'video':kind,index}}
 function rippleState(){return {videoLayers,imageLayers,textLayers,effectLayers,audioLayers}}
 function commitRippleTrim(kind:RippleKind,index:number,original:RippleLayer,updated:RippleLayer) {
  const ref={kind,index};if(!rippleTrim(rippleState(),ref,updated)){setError('E7009 波纹编辑超出时间线或与前一片段重叠');return}
  setError('');setQuote(undefined);applyRipple(ref,original,{type:'trim',updated})
 }
 function splitAt(kind:'video'|'overlay'|'audio'|'image'|'text'|'effect',index:number,at:number,keep:'both'|'left'|'right') {
  if(locked||!Number.isFinite(at))return
  if(kind==='video') {const current=clips[index];if(!current)return;const source=current.start+(at-videoBoundaries[index])*current.rate;if(source<=current.start+.05||source>=current.end-.05||(keep==='both'&&clips.length>=32))return;setQuote(undefined);setClips(previous=>splitClip(previous,index,source,keep));const selectedIndex=keep==='both'?index+1:index;setSelected(selectedIndex);setActiveTrack({kind:'video',index:selectedIndex});return}
  const current=kind==='overlay'?videoLayers[index]:kind==='audio'?audioLayers[index]:kind==='image'?imageLayers[index]:kind==='text'?textLayers[index]:effectLayers[index]
  const count=kind==='overlay'?videoLayers.length:kind==='audio'?audioLayers.length:kind==='image'?imageLayers.length:kind==='text'?textLayers.length:effectLayers.length
  if(!current||at<=current.start+.05||at>=current.end-.05||(keep==='both'&&count>=16))return
  const id=newTrackId(),visualKind=kind==='overlay'?'video':kind,z=visualKind==='video'||visualKind==='image'||visualKind==='text'||visualKind==='effect'?visualOrder.find(track=>track.refs.some(ref=>ref.kind===visualKind&&ref.index===index))?.z:undefined
  if(rippleEditing&&keep==='right'){const ref=rippleRef(kind,index);if(rippleKeepRight(rippleState(),ref,at)){setQuote(undefined);applyRipple(ref,current,{type:'right',time:at});setActiveTrack({kind,index})}else setError('E7009 无法在此位置执行波纹编辑');return}
  const prepare=<T extends VideoLayer|ImageLayer|TextLayer|AudioLayer|EffectLayer>(item:T):T=>keep==='both'?{...item,track_id:item.track_id??id,...(z!==undefined?{z_index:z}:{})}:item
  setQuote(undefined)
  if(kind==='overlay')setVideoLayers(previous=>{const item=previous[index];return item?[...previous.slice(0,index),...splitTimelineLayer(prepare(item),at,keep),...previous.slice(index+1)]:previous})
  else if(kind==='audio')setAudioLayers(previous=>{const item=previous[index];return item?[...previous.slice(0,index),...splitTimelineLayer(prepare(item),at,keep),...previous.slice(index+1)]:previous})
  else if(kind==='image')setImageLayers(previous=>{const item=previous[index];return item?[...previous.slice(0,index),...splitTimelineLayer(prepare(item),at,keep),...previous.slice(index+1)]:previous})
  else if(kind==='text')setTextLayers(previous=>{const item=previous[index];return item?[...previous.slice(0,index),...splitTimelineLayer(prepare(item),at,keep),...previous.slice(index+1)]:previous})
  else setEffectLayers(previous=>{const item=previous[index];return item?[...previous.slice(0,index),...splitTimelineLayer(prepare(item),at,keep),...previous.slice(index+1)]:previous})
  setActiveTrack({kind,index:keep==='both'?index+1:index})
 }
 function splitActive(keep:'both'|'left'|'right') {splitAt(activeIsVideo?'video':activeTrack.kind,activeIsVideo?selected:activeTrack.index,playhead,keep)}
 function splitTargets():ClipboardSelection[] {
  if(timelineSelection.length)return timelineSelection
  return [...clips.map((_,index)=>({kind:'main' as const,index})),...videoLayers.map((_,index)=>({kind:'video' as const,index})),...imageLayers.map((_,index)=>({kind:'image' as const,index})),...textLayers.map((_,index)=>({kind:'text' as const,index})),...effectLayers.map((_,index)=>({kind:'effect' as const,index})),...audioLayers.map((_,index)=>({kind:'audio' as const,index}))]
 }
 function canSplitSelection(keep:'both'|'left'|'right') {
  let found=false;const counts={main:clips.length,video:videoLayers.length,image:imageLayers.length,text:textLayers.length,effect:effectLayers.length,audio:audioLayers.length}
  for(const ref of splitTargets()){const layer=ref.kind==='main'?clips[ref.index]:ref.kind==='video'?videoLayers[ref.index]:ref.kind==='image'?imageLayers[ref.index]:ref.kind==='text'?textLayers[ref.index]:ref.kind==='effect'?effectLayers[ref.index]:audioLayers[ref.index];if(!layer)continue;const at=ref.kind==='main'?(layer as VideoClip).start+(playhead-videoBoundaries[ref.index])*(layer as VideoClip).rate:playhead;if(at<=layer.start+.05||at>=layer.end-.05)continue;found=true;if(keep==='both'&&++counts[ref.kind]>(ref.kind==='main'?32:ref.kind==='text'?MAX_TEXT_LAYERS:16))return false}
  return found
 }
 function splitSelection(keep:'both'|'left'|'right') {
  if(timelineSelection.length===1){splitActive(keep);return}
  const state=clipboardDraft(),result=splitTimelineItems(state,splitTargets(),playhead,keep,rippleEditing,newTrackId);if(!result){setError('E7009 无法在此位置分割所选片段');return}
  setError('');setQuote(undefined);applyTransaction(result.draft,state);setSelectionState({items:result.selection,draft:result.draft});const last=result.selection.at(-1);if(last)activateTimeline(last)
 }

 function clipboardDraft():ClipboardDraft {return {clips,videoLayers,imageLayers,textLayers,effectLayers,audioLayers}}
 function selectedClipboardItems():ClipboardSelection[] {return timelineSelection}
 function copySelection() {const items=copyTimelineItems(clipboardDraft(),selectedClipboardItems());if(!items.length)return;timelineClipboard.copy(items);setClipboardStatus(`已复制 ${items.length} 个片段`)}
 async function pasteSelection() {
  const items=timelineClipboard.items;if(!items?.length||locked||clipboardPastePending.current)return
  const state=clipboardDraft(),at=frameTime(playhead,projectFPS),captured=clipboardContext.current
  const sourceProject=timelineClipboard.sourceProject;if(!sourceProject)return
  const foreign=sourceProject!==ctx.project
  const resources=foreign?[...new Set(items.flatMap(item=>'resource_uuid' in item.layer?[item.layer.resource_uuid]:[]))]:[]
  const resolved:Record<string,string>={}
  let cancelled=false
  clipboardPastePending.current=true
  if(foreign){setBusy(true);setError('')}
  let timer:ReturnType<typeof setTimeout>|undefined
  try {
   if(foreign){
    const verify=async()=>{
     await ctx.api.checkProjectAccess(sourceProject)
     if(cancelled)return
     let next=0
     const workers=Array.from({length:Math.min(4,resources.length)},async()=>{for(;;){if(cancelled)return;const id=resources[next++];if(!id)return;resolved[id]=await ctx.api.source(ctx.project,id)}})
     await Promise.all(workers)
    }
    await Promise.race([verify(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),15000)})])
   }
   const current=clipboardContext.current
   if(!editorMounted.current||current.project!==captured.project||current.namespace!==captured.namespace||current.readOnly||current.fps!==captured.fps||current.items!==captured.items||current.clips!==state.clips||current.videoLayers!==state.videoLayers||current.imageLayers!==state.imageLayers||current.textLayers!==state.textLayers||current.effectLayers!==state.effectLayers||current.audioLayers!==state.audioLayers)return
   const ids=items.map(()=>newTrackId());let i=0
   const result=pasteTimelineItems(state,items,at,()=>ids[i++]);if(!result){setError('E7009 无法粘贴，请检查时长和轨道数量');return}
   if(resources.length)setUrls(previous=>({...previous,...resolved}))
   setError('');setQuote(undefined);applyTransaction(result.draft,state);setSelectionState({items:result.selection,draft:result.draft});const last=result.selection.at(-1)
   if(last){if(last.kind==='main'){setSelected(last.index);setActiveTrack({kind:'video',index:last.index})}else setActiveTrack({kind:last.kind==='video'?'overlay':last.kind,index:last.index})}
   setClipboardStatus('已粘贴片段')
  } catch {
   const current=clipboardContext.current
   if(editorMounted.current&&current.project===captured.project&&current.namespace===captured.namespace)setError('E7009 素材暂时不可用，无法粘贴')
  } finally {cancelled=true;if(timer)clearTimeout(timer);clipboardPastePending.current=false;if(foreign&&editorMounted.current)setBusy(false)}
 }
 function copyActive() {
  const state=clipboardDraft(),result=duplicateTimelineItems(state,timelineSelection,newTrackId)
  if(!result){setError('E7009 无法复制，请检查轨道数量和素材范围');return}
  setError('');setQuote(undefined);applyTransaction(result.draft,state);setSelectionState({items:result.selection,draft:result.draft});const last=result.selection.at(-1);if(last)activateTimeline(last)
 }
 function deleteItems(items:ClipboardSelection[],ripple=rippleEditing) {
  if(!items.length)return
  const state=clipboardDraft(),next=deleteTimelineItems(state,items,ripple)
  if(!next){setError('E7009 无法删除所选片段');return}
  setError('');setQuote(undefined);applyTransaction(next,state);setSelectionState({items:[],draft:next});setSelected(0);setActiveTrack({kind:'video',index:0});if(!next.clips.length)setExportScope('timeline')
 }
 function deleteActive() {deleteItems(timelineSelection)}
 function attachEffect(kind:'video'|'overlay'|'image'|'text',index:number) {
  if(locked)return
  const item=kind==='video'?clips[index]:kind==='overlay'?videoLayers[index]:kind==='image'?imageLayers[index]:textLayers[index]
  if(!item)return
  if((item.effects?.length??0)>=8){setError('E7009 每个素材最多添加 8 个特效');return}
  const apply=<T extends {effects?:VisualEffect[]}>(previous:T[])=>previous.map((entry,i)=>i===index?{...entry,effects:[...(entry.effects??[]),{type:'blur' as const,enabled:true,intensity:15}]}:entry)
  if(kind==='video'){setClips(apply);setSelected(index)}else if(kind==='overlay')setVideoLayers(apply);else if(kind==='image')setImageLayers(apply);else setTextLayers(apply)
  setQuote(undefined);setActiveTrack({kind,index})
 }
 function addEffect(at:number) {
  if(locked || effectLayers.length>=16)return
  const start=Math.max(0,Math.min(599.95,at)),end=Math.min(600,start+5)
  setQuote(undefined);insertVisualLayer('effect',{start,end,intensity:15},newTrackId());setActiveTrack({kind:'effect',index:effectLayers.length})
 }
 async function addSticker(sticker:Sticker,requestedStart?:number,preferred?:Pick<VisualRef,'kind'|'index'>,position?:TrackPosition):Promise<boolean> {
  const library=ctx.library;if(!library||locked||stickerAdding.current||imageLayers.length>=16)return false
  stickerAdding.current=true;setBusy(true);setError('')
  try {const file=await stickerFile(sticker);if(!editorMounted.current)return false;const ok=await library.uploadAsset(file),id=library.getSnapshot().upload.resource_uuid;if(!editorMounted.current)return false;if(!ok||!id)throw new Error();const url=await ctx.api.source(ctx.project,id);if(!editorMounted.current)return false;const start=requestedStart??(playhead>=599.95?0:playhead);setUrls(previous=>({...previous,[id]:url}));setQuote(undefined);insertVisualLayer('image',{is_sticker:true,resource_uuid:id,start,end:Math.min(600,start+5),x:.5,y:.5,scale:.2,opacity:1},newTrackId(),preferred,undefined,requestedStart===undefined?'auto':'target',position);setActiveTrack({kind:'image',index:imageLayers.length});recordSticker(ctx.preferenceNamespace,sticker);return true}
  catch {if(editorMounted.current)setError('E7009 贴纸添加失败，请检查网络和素材权限');return false} finally {stickerAdding.current=false;if(editorMounted.current)setBusy(false)}
 }
 async function addImageSource(id:string,requestedStart?:number,preferred?:Pick<VisualRef,'kind'|'index'>,position?:TrackPosition) {
  if (!id || imageLayers.length>=16) return
  setBusy(true);setError('')
  try { const url=urls[id] ?? await ctx.api.source(ctx.project,id);const start=requestedStart??(playhead>=599.95?0:playhead);setUrls(previous=>({...previous,[id]:url}));insertVisualLayer('image',{resource_uuid:id,start,end:Math.min(600,start+5),x:.5,y:.5,scale:1,opacity:1},newTrackId(),preferred,undefined,requestedStart===undefined?'auto':'target',position);setActiveTrack({kind:'image',index:imageLayers.length}) }
  catch {setError('E7009 图片素材暂时不可用')} finally {setBusy(false)}
 }
 async function addAudioSource(id:string,requestedStart?:number,preferredIndex?:number,position?:TrackPosition) {
  if (!id || audioLayers.length >= 16) return
  setBusy(true); setError('')
  try {
   const url = urls[id] ?? await ctx.api.source(ctx.project, id)
   const duration = audioDurations[id] ?? await new Promise<number>((resolve, reject) => { const element = document.createElement('audio'); const timer = setTimeout(() => { element.removeAttribute('src'); element.load(); reject(new Error('E7009')) }, 15000); element.preload = 'metadata'; element.onloadedmetadata = () => { clearTimeout(timer); const d = element.duration; element.removeAttribute('src'); element.load(); Number.isFinite(d) && d > 0 ? resolve(d) : reject(new Error('E7009')) }; element.onerror = () => { clearTimeout(timer); reject(new Error('E7009')) }; element.src = url })
   const cursor = tailTime ?? clips.slice(0,selected).reduce((n,c)=>n+clipDuration(c),0)+(clip?Math.max(0,(time-clip.start)/clip.rate):0)
   const start = requestedStart ?? (cursor >= 600 - .05 ? 0 : cursor)
   const trackId=newTrackId();setQuote(undefined); setUrls(p => ({ ...p, [id]: url })); setAudioDurations(p => ({ ...p, [id]: duration })); setAudioLayers(p => insertAudio(p,{ resource_uuid:id, start, end:Math.min(600,start+duration), source_start:0, volume_db:0 },trackId,preferredIndex,undefined,requestedStart===undefined?'auto':'target',position)); setActiveTrack({kind:'audio',index:audioLayers.length})
  } catch { setError('E7009 无法添加此音频素材') } finally { setBusy(false) }
 }
 async function addOverlay(id:string,requestedStart?:number,preferred?:Pick<VisualRef,'kind'|'index'>,position?:TrackPosition) {
  if (!id || videoLayers.length>=16) return
  setBusy(true);setError('')
  try {
   const url=urls[id] ?? await ctx.api.source(ctx.project,id)
   const duration=durations[id] ?? await new Promise<number>((resolve,reject)=>{const element=document.createElement('video');const timer=setTimeout(()=>{element.removeAttribute('src');element.load();reject(new Error('E7009'))},15000);element.preload='metadata';element.onloadedmetadata=()=>{clearTimeout(timer);const d=element.duration;element.removeAttribute('src');element.load();Number.isFinite(d)&&d>0?resolve(d):reject(new Error('E7009'))};element.onerror=()=>{clearTimeout(timer);reject(new Error('E7009'))};element.src=url})
   const start=requestedStart??(playhead>=599.95?0:playhead);setUrls(p=>({...p,[id]:url}));setDurations(p=>({...p,[id]:duration}));insertVisualLayer('video',{resource_uuid:id,start,end:Math.min(600,start+duration),source_start:0,rate:1,volume_db:0},newTrackId(),preferred,undefined,requestedStart===undefined?'auto':'target',position);setActiveTrack({kind:'overlay',index:videoLayers.length})
  } catch {setError('E7009 无法添加此视频素材')} finally {setBusy(false)}
 }
 async function addSource(id: string) {
  if (!id || clips.length >= 32) return
  setBusy(true); setError('')
  try {
   const url = urls[id] ?? await ctx.api.source(ctx.project, id)
   const duration = durations[id] ?? await new Promise<number>((resolve, reject) => { const element = document.createElement('video'); const timer = setTimeout(() => { element.removeAttribute('src'); element.load(); reject(new Error('E7009')) }, 15000); element.preload = 'metadata'; element.onloadedmetadata = () => { clearTimeout(timer); const d = element.duration; element.removeAttribute('src'); element.load(); Number.isFinite(d) ? resolve(d) : reject(new Error('E7009')) }; element.onerror = () => { clearTimeout(timer); reject(new Error('E7009')) }; element.src = url })
   setUrls(p => ({ ...p, [id]: url })); setDurations(p => ({ ...p, [id]: duration })); setClips(p => [...p, { resource_uuid: id, start: 0, end: duration, rate: 1, volume_db: 0, ...(mainTrackHidden?{track_hidden:true}:{}) }]); setSelected(clips.length);setActiveTrack({kind:'video',index:clips.length})
  } catch { setError('E7009 无法添加此素材') } finally { setBusy(false) }
 }
 async function estimate() {
  setBusy(true); setError(''); setJob(undefined)
  try {
   const duration = durations[resource]
   if(operation==='edit' && (timelineDuration<=0 || (exportScope==='selected'&&!clip))) {setError('E7009 请先添加可导出的素材');return}
   if(operation==='edit' && outputKind==='none') {setError('E7009 请选择视频或音频导出');return}
   if (operation === 'edit' && [...clips,...videoLayers,...imageLayers,...textLayers].some(item=>!validVisualEffects(item.effects))) {setError('E7009 请检查素材特效参数');return}
   if (operation === 'edit' && clips.some(c => c.transform && !validVideoTransform(c.transform))) { setError('E7009 请检查画面变换参数'); return }
   if (operation === 'edit' && videoLayers.some(layer => ![layer.start,layer.end,layer.source_start,layer.rate,layer.volume_db].every(Number.isFinite) || layer.start<0 || layer.end<=layer.start || layer.end>600 || layer.source_start<0 || layer.rate<.25 || layer.rate>4 || layer.volume_db< -60 || layer.volume_db>12 || !validVisualZ(layer) || (layer.transform !== undefined && !validVideoTransform(layer.transform)) || (durations[layer.resource_uuid] !== undefined && layer.source_start+(layer.end-layer.start)*layer.rate>durations[layer.resource_uuid]+.05))) { setError('E7009 请检查叠加视频轨道参数'); return }
   if (operation === 'edit' && effectLayers.some(layer=>![layer.start,layer.end,layer.intensity].every(Number.isFinite)||layer.start<0||layer.end<=layer.start||layer.end>600||layer.intensity<0||layer.intensity>100||!validVisualZ(layer))) {setError('E7009 请检查特效范围和强度');return}
   if (operation === 'edit' && imageLayers.some(layer => ![layer.start,layer.end,layer.x,layer.y,layer.scale,layer.opacity].every(Number.isFinite) || layer.start<0 || layer.end<=layer.start || layer.end>600 || layer.x < -2 || layer.x>2 || layer.y < -2 || layer.y>2 || layer.scale<.1 || layer.scale>4 || layer.opacity<0 || layer.opacity>1 || !validImageKeyframes(layer) || !validVisualZ(layer))) { setError('E7009 请检查图片轨道参数'); return }
   if (operation === 'edit' && audioLayers.some(layer => ![layer.start,layer.end,layer.source_start,layer.volume_db].every(Number.isFinite) || layer.start < 0 || layer.end <= layer.start || layer.end > 600 || layer.source_start < 0 || layer.volume_db < -60 || layer.volume_db > 12 || (audioDurations[layer.resource_uuid] !== undefined && layer.source_start + layer.end - layer.start > audioDurations[layer.resource_uuid] + .05))) { setError('E7009 请检查音频范围、源起点和音量'); return }
   if (operation === 'edit' && textLayers.some(layer => !layer.text || new TextEncoder().encode(layer.text).length > 4096 || ![layer.start,layer.end,layer.x,layer.y,layer.size,layer.opacity].every(Number.isFinite) || layer.start < 0 || layer.end <= layer.start || layer.end > 600 || layer.x < 0 || layer.x > 1 || layer.y < 0 || layer.y > 1 || layer.size < 4 || layer.size > 300 || layer.opacity < 0 || layer.opacity > 1 || !/^[0-9a-f]{6}$/i.test(layer.color) || !validTextBackground(layer) || !validTextKeyframes(layer) || !validVisualZ(layer))) { setError('E7009 请检查文字内容和参数'); return }
   const selectedOffset = clips.slice(0, selected).reduce((n,c)=>n+clipDuration(c),0)
   const exportedVideos = (exportScope === 'selected' && clip ? videoLayers.flatMap(layer => {const result=sliceVideoLayer(layer,selectedOffset,selectedOffset+clipDuration(clip),selectedOffset);return result?[result]:[]}) : videoLayers).map(visibleVideo)
   const exportedAudio = (exportScope === 'selected' && clip ? audioLayers.flatMap(layer => { const start=Math.max(layer.start,selectedOffset); const end=Math.min(layer.end,selectedOffset+clipDuration(clip)); return end>start ? [{ ...layer, start:start-selectedOffset, end:end-selectedOffset, source_start:layer.source_start+start-layer.start }] : [] }) : audioLayers).map(visibleAudio)
   const exportedImages = (exportScope === 'selected' && clip ? imageLayers.flatMap(layer => {const result=sliceImageLayer(layer,selectedOffset,selectedOffset+clipDuration(clip),selectedOffset);return result?[result]:[]}) : imageLayers).map(visibleImage)
   const exportedEffects=(exportScope==='selected' && clip ? effectLayers.flatMap(layer=>{const start=Math.max(layer.start,selectedOffset),end=Math.min(layer.end,selectedOffset+clipDuration(clip));return end>start?[{...layer,start:start-selectedOffset,end:end-selectedOffset}]:[]}) : effectLayers).map(visibleEffect)
   const exportedText = (exportScope === 'selected' && clip ? textLayers.flatMap(layer => { const result=sliceTextLayer(layer,selectedOffset,selectedOffset+clipDuration(clip),selectedOffset); return result ? [result] : [] }) : textLayers).map(visibleText)
   let exportCover: VideoCover | undefined
   if (operation==='edit' && exportVideoEnabled && cover) {
    if (cover.frame_time !== undefined && exportScope==='selected') {
     if (!clip || cover.frame_time < selectedOffset || cover.frame_time >= selectedOffset+clipDuration(clip)) {setError('E7009 封面帧不在所选片段中，请重新选择');return}
     exportCover={frame_time:cover.frame_time-selectedOffset,prepend:prependCover}
    } else exportCover={...cover,prepend:prependCover}
   }
   const input: VideoToolInput = { operation, mode, ...(operation==='edit'?{origin_resource_uuid:resource}:{}), ...(operation==='edit' && outputKind!=='audio' && backgroundColor!=='000000'?{background_color:backgroundColor}:{}), ...(exportCover?{cover:exportCover}:{}), clips: operation === 'erase' ? [{ resource_uuid: resource, start: 0, end: duration ?? 0, rate: 1, volume_db: 0 }] : (exportScope === 'selected' && clip ? [clip] : clips).map(item=>visibleClip(mainTrackMuted&&item.media_type!=='image'?{...item,muted:true}:item)), ...(needsRect && rect ? { rect } : {}), ...(operation === 'edit' ? { ...(outputKind==='audio' ? {output_kind:'audio' as const,audio_format:audioFormat} : {output_kind:outputKind==='both'?'both' as const:'video' as const, ...(outputKind==='both'?{audio_format:audioFormat}:{}),output_fps:outputFPS,output_aspect:outputAspect,output_resolution:outputResolution,output_resolution_mode:'height' as const,...(!outputAspect?{canvas_source:'origin' as const}:{}),output_mute:!includeAudio,output_format:outputFormat}), video_layers:exportedVideos,audio_layers:exportedAudio,image_layers:exportedImages,text_layers:exportedText,effect_layers:exportedEffects } : {}) }
   if ((input.output_kind === 'audio' || input.output_kind === 'both') && input.audio_format === 'wav') {
    const exportDuration = Math.max(input.clips.reduce((sum, item) => sum + clipDuration(item), 0), ...exportedVideos.map(item => item.end), ...exportedAudio.map(item => item.end), ...exportedImages.map(item => item.end), ...exportedText.map(item => item.end), ...exportedEffects.map(item=>item.end), 0)
    if (Math.ceil(exportDuration * 44100) * 4 + 4096 > 100 * 1024 * 1024) { setError('E7009 WAV 文件预计超过 100 MB，请缩短时长或选择 MP3'); return }
   }
   setQuote(await ctx.api.quote(ctx.project, input))
  } catch { setError('E7009 无法报价，请检查片段范围、选区和组件配置') } finally { setBusy(false) }
 }
 async function submit() {
  if (!quote) return
  setBusy(true); setError(''); setJob({ ...quote, state: 'queued' })
  try { const next = await ctx.api.submit(ctx.project, quote.uuid); setJob(next); setJobs(p => [next, ...p.filter(j => j.uuid !== next.uuid)]); setQuote(undefined) }
  catch { setError('E7099 提交状态待确认，正在查询原任务，请勿重复提交') }
  finally { setBusy(false) }
 }
 async function exportResult(target: 'local' | 'canvas') {
  if (!job || job.state !== 'succeeded') return
  setBusy(true); setError('')
  const deliveredKey=`media-video-delivered:${job.uuid}`
  try {
   const kinds: ('video'|'audio')[]=job.output_kind==='both'?['video','audio']:[job.output_kind==='audio'?'audio':'video']
   let delivered: string[]=deliveredRef.current[job.uuid] ?? []
   if (target==='canvas' && job.output_kind==='both') {try {const saved=JSON.parse(editorStorage.getItem(deliveredKey)??'[]');if(Array.isArray(saved))delivered=[...new Set([...delivered,...saved.filter(value=>value==='video'||value==='audio')])]} catch {/* Keep the in-memory recovery state. */}}
   const files=await Promise.all(kinds.filter(kind=>target!=='canvas'||!delivered.includes(kind)).map(async kind=>{
    const url=await ctx.api.result(ctx.project,job.uuid,job.output_kind==='both'&&kind==='audio'?'audio':undefined)
    const response=await fetch(url,{credentials:'omit'});if(!response.ok)throw new Error('E7009')
    const blob=await response.blob(),format=kind==='audio'?(job.audio_format==='wav'?'wav':'mp3'):(job.output_format==='webm'?'webm':'mp4')
    const mime=kind==='audio'?(format==='wav'?'audio/wav':'audio/mpeg'):`video/${format}`,title=Array.from(exportTitle.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'-')).slice(0,50).join('')||'视频处理',name=`${title}${job.output_kind==='both' && kind==='audio'?'-音频':''}.${format}`
    return {kind,blob,mime,name}
   }))
   if(target==='local') {
    for(const file of files) {const objectUrl=URL.createObjectURL(file.blob),anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=file.name;anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000)}
   } else {
    if(!onCreate)throw new Error('E7009')
    for(const file of files) {
     if(!mediaNodeActionSucceeded(await onCreate({file:new File([file.blob],file.name,{type:file.mime}),modality:file.kind,name:file.name,offset:{x:380,y:file.kind==='audio'?200:0},connect_to_source:false})))throw new Error('E7009')
     delivered=[...delivered,file.kind];deliveredRef.current[job.uuid]=delivered
     if(job.output_kind==='both')try{editorStorage.setItem(deliveredKey,JSON.stringify(delivered))}catch{/* Existing nodes remain in the canvas. */}
    }
    delete deliveredRef.current[job.uuid]
    try{editorStorage.removeItem(deliveredKey)}catch{/* Best-effort recovery cleanup. */}
    onClose()
   }
  } catch { setError('E7009 导出失败，已导出的画布节点会保留；可重试剩余结果，无需重新处理') } finally { setBusy(false) }
 }
 async function toggleFullscreen() {
  try {if(document.fullscreenElement===player.current)await document.exitFullscreen();else if(player.current)await player.current.requestFullscreen()} catch {setError('E7009 无法切换全屏预览')}
 }
 async function saveSnapshot() {
  setBusy(true);setError('')
  try {
   const captureTime=Math.max(0,Math.min(playhead,Math.max(0,timelineDuration-1/projectFPS)))
   const size=outputAspect ? snapshotSizes[outputAspect] : aspectSource
   const blob=await captureTimelineSnapshot({clips:previewClips,videos:videoLayers.map(visibleVideo),images:imageLayers.map(visibleImage),text:textLayers.map(visibleText),effects:previewEffects,urls,duration:timelineDuration,time:captureTime,fps:projectFPS,background:backgroundColor,width:size.width,height:size.height})
   const frame=Math.floor(captureTime*projectFPS),parts=[Math.floor(frame/(projectFPS*3600)),Math.floor(frame/(projectFPS*60))%60,Math.floor(frame/projectFPS)%60,frame%projectFPS].map(value=>String(value).padStart(2,'0')).join('-')
   const title=Array.from(exportTitle.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g,'-')).slice(0,50).join('')||'截图',objectUrl=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=`${title}-${parts}.png`;anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000)
  } catch {setError('E7009 截图暂时不可用，请检查素材后重试')} finally {setBusy(false)}
 }
 async function exportCover(target: 'local' | 'canvas') {
  if (!job || job.state!=='succeeded' || !job.cover) return
  setBusy(true);setError('')
  try {
   const selectedCover=job.cover
   const url=selectedCover.resource_uuid ? await ctx.api.source(ctx.project,selectedCover.resource_uuid) : await ctx.api.result(ctx.project,job.uuid)
   const response=await fetch(url,{credentials:'omit'});if(!response.ok)throw new Error('E7009')
   const original=await response.blob()
   const data=selectedCover.resource_uuid ? original : await captureCoverFrame(original,selectedCover.prepend ? 0 : selectedCover.frame_time ?? 0)
   const types:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}
   const extension=types[data.type];if(!extension)throw new Error('E7009')
   const name=`视频封面-${job.uuid.slice(0,8)}.${extension}`
   if(target==='local') {const objectUrl=URL.createObjectURL(data),anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),60000)}
   else if(!onCreate || !mediaNodeActionSucceeded(await onCreate({file:new File([data],name,{type:data.type}),modality:'image',name,offset:{x:380,y:200},connect_to_source:false}))) throw new Error('E7009')
  } catch {setError('E7009 封面导出失败，可重试导出，无需重新合成')} finally {setBusy(false)}
 }
 function openCover() {
  coverPreviousTime.current=playhead;video.current?.pause()
  const at=cover?.frame_time ?? Math.min(playhead,Math.max(0,timelineDuration-1/projectFPS))
  seekTimeline(at);setCoverOpen(true)
 }
 function closeCover() {setCoverOpen(false);seekTimeline(coverPreviousTime.current)}
 function point(event: React.PointerEvent<SVGSVGElement>) { const box = event.currentTarget.getBoundingClientRect(); return { x: Math.round(Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * dimensions.width), y: Math.round(Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) * dimensions.height) } }
 const exportContent = <div className={`grid gap-5 ${operation==='edit' && !job && exportVideoEnabled?'md:grid-cols-[280px_minmax(0,1fr)]':''}`}>
  {operation==='edit' && !job && exportVideoEnabled && <aside aria-label="封面设置" className="grid content-start gap-3">
   <CoverThumbnail effects={previewEffects} background={backgroundColor} cover={cover} clips={previewClips} videos={videoLayers.map(visibleVideo)} images={imageLayers.map(visibleImage)} text={textLayers.map(visibleText)} urls={urls} aspect={previewAspect} project={ctx.project} source={ctx.api.source}/>
   <div className="flex items-center justify-between text-xs"><span>{cover ? cover.frame_time !== undefined ? `视频帧 · ${cover.frame_time.toFixed(2)} 秒` : '本地封面' : '未设置封面'}</span><div className="flex gap-3"><button type="button" disabled={locked} className="text-[var(--mf-brand)]" onClick={openCover}>{cover?'更换封面':'设置封面'}</button>{cover && <button type="button" disabled={locked} onClick={()=>{setCover(undefined);setPrependCover(false)}}>删除封面</button>}</div></div>
   <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-[var(--mf-brand)]" checked={prependCover} disabled={locked||!cover} onChange={e=>setPrependCover(e.target.checked)} />封面添加至视频片头（1 秒）</label>
  </aside>}
  <div className="grid content-start gap-3">
   {error && <p role="alert" className="text-red-300">{error}</p>}
   {job && <p role="status">{labels[job.state]}{job.error_code ? ` · ${job.error_code}` : ''} · {job.uuid}</p>}
   <div className="grid gap-3">
    {job?.state === 'quoted' && <MediaButton disabled={busy} onClick={() => { setQuote(job); setJob(undefined); setError('') }}>继续确认此报价</MediaButton>}
    {job?.state === 'succeeded' && <MediaButton disabled={busy} onClick={() => { setJob(undefined); setQuote(undefined); setError('') }}>新建处理</MediaButton>}
    {operation === 'edit' && !job && <label className="grid grid-cols-[110px_1fr] items-center gap-2">标题<input aria-label="导出标题" className={field} maxLength={100} value={exportTitle} disabled={locked} onChange={event=>setExportTitle(event.target.value)} /></label>}
    {operation === 'edit' && !job && <label className="grid grid-cols-[110px_1fr] items-center gap-2">导出范围<select aria-label="导出范围" className={field} value={exportScope} disabled={locked} onChange={e=>{setQuote(undefined);setExportScope(e.target.value as 'selected' | 'timeline')}}><option className="bg-white text-[#111827]" value="selected" disabled={!clip}>选中片段</option><option className="bg-white text-[#111827]" value="timeline">完整时间线</option></select></label>}
    {operation === 'edit' && !job && <>
     <ExportSection title="视频导出" enabled={exportVideoEnabled} disabled={locked} onEnabledChange={enabled=>{setQuote(undefined);setOutputKind(enabled?(exportAudioEnabled?'both':'video'):(exportAudioEnabled?'audio':'none'))}}>
      <label className="grid grid-cols-[110px_1fr] items-center gap-2">分辨率<select aria-label="导出分辨率" className={field} value={outputResolution} disabled={locked} onChange={e => { setQuote(undefined); setOutputResolution(Number(e.target.value) as 360 | 480 | 720 | 1080) }}>{([360, 480, 720, 1080] as const).map(resolution => <option className="bg-white text-[#111827]" key={resolution} value={resolution}>{resolution}P</option>)}</select></label>
      <label className="grid grid-cols-[110px_1fr] items-center gap-2">格式<select aria-label="导出格式" className={field} value={outputFormat} disabled={locked} onChange={e => { setQuote(undefined); setOutputFormat(e.target.value as 'mp4' | 'webm') }}><option className="bg-white text-[#111827]" value="mp4">MP4</option><option className="bg-white text-[#111827]" value="webm">WEBM</option></select></label>
      <label className="grid grid-cols-[110px_1fr] items-center gap-2">帧率<select aria-label="导出帧率" className={field} value={outputFPS} disabled={locked} onChange={e => { setQuote(undefined); setOutputFPS(Number(e.target.value) as 24 | 25 | 30 | 60 | 120) }}>{([24, 25, 30, 60, 120] as const).map(fps => <option className="bg-white text-[#111827]" key={fps} value={fps}>{fps} fps</option>)}</select></label>
      <label className="grid grid-cols-[110px_1fr] items-center gap-2">视频编码<input aria-label="视频编码" className={field} value={outputFormat==='webm'?'VP9':'H.264'} readOnly /></label>
      <label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--mf-brand)]" checked={includeAudio} disabled={locked} onChange={e => { setQuote(undefined); setIncludeAudio(e.target.checked) }} />导出时包含音频</label>
     </ExportSection>
     <ExportSection title="音频导出" enabled={exportAudioEnabled} disabled={locked} onEnabledChange={enabled=>{setQuote(undefined);setOutputKind(enabled?(exportVideoEnabled?'both':'audio'):(exportVideoEnabled?'video':'none'))}}>
      <label className="grid grid-cols-[110px_1fr] items-center gap-2">音频格式<select aria-label="音频格式" className={field} value={audioFormat} disabled={locked} onChange={e=>{setQuote(undefined);setAudioFormat(e.target.value as 'mp3'|'wav')}}><option className="bg-white text-[#111827]" value="mp3">MP3</option><option className="bg-white text-[#111827]" value="wav">WAV</option></select></label>
     </ExportSection>
    </>}
    {quote && <span>按 {quote.seconds} 秒计费，共 {quote.peas} 积分（不足一秒按一秒）</span>}
    {job?.state === 'succeeded' ? <><MediaButton disabled={busy} onClick={()=>void exportResult('local')}>导出到本地</MediaButton><MediaButton variant="primary" disabled={busy||!onCreate} onClick={()=>void exportResult('canvas')}>导出到画布</MediaButton>{job.cover && <div className="flex gap-3"><MediaButton disabled={busy} onClick={()=>void exportCover('local')}>下载封面</MediaButton><MediaButton disabled={busy||!onCreate} onClick={()=>void exportCover('canvas')}>封面到画布</MediaButton></div>}</> : <><MediaButton disabled={locked||(operation==='edit'?timelineDuration<=0:!durations[resource])||(operation==='edit'&&outputKind==='none')||(needsRect&&!rect)||job?.state==='unknown'} onClick={()=>void estimate()}>计算费用</MediaButton><MediaButton variant="primary" disabled={locked||!quote||job?.state==='unknown'} onClick={()=>void submit()}>{operation==='edit'?'确认合成':'确认擦除'}</MediaButton></>}
   </div>
   {jobs.length>0 && <details className="rounded-lg border border-white/10 p-3"><summary>处理记录（关闭窗口后任务仍继续）</summary><div className="mt-2 grid max-h-40 gap-2 overflow-auto">{jobs.map(j=><button key={j.uuid} className="flex justify-between rounded px-2 py-1 text-left hover:bg-white/5" disabled={busy} onClick={()=>{setJob(j);setQuote(undefined);setError('')}}><span>{j.uuid.slice(0,8)} · {j.peas} 积分</span><span>{labels[j.state]}</span></button>)}</div></details>}
  </div>
 </div>
 // Scope shortcuts to the editor, preserving normal text and form controls.
 useEffect(() => {
  const textEntry='input:not([type="range"]),textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]'
  function handleShortcut(event:KeyboardEvent) {
   if(operation!=='edit' || exportOpen || coverOpen || document.querySelector('[data-editor-popover]') || event.defaultPrevented || event.isComposing)return
   const target=event.target as HTMLElement | null
   if(target?.closest(textEntry))return
   const key=event.key.toLowerCase(), mod=event.ctrlKey||event.metaKey
   if(event.altKey || (event.ctrlKey&&event.metaKey))return
   // Space plays from anywhere in the editor, so a focused toolbar button or the ruler must not swallow it.
   if(key===' '&&!mod&&!event.shiftKey){event.preventDefault();spacePlayback.current=true;togglePlayback();return}
   if(target?.closest('[role="slider"]'))return
   if(mod && key==='z') {event.preventDefault();if(!locked&&(event.shiftKey?canRedo:canUndo)){setQuote(undefined);if(event.shiftKey)redo();else undo();setSelected(0)};return}
   if(mod && key==='y' && !event.shiftKey) {event.preventDefault();if(!locked&&canRedo){setQuote(undefined);redo();setSelected(0)};return}
   if(mod && key==='b' && !event.shiftKey) {event.preventDefault();if(!locked&&canSplitSelection('both')){setQuote(undefined);splitSelection('both')};return}
   if(mod && key==='d' && !event.shiftKey) {event.preventDefault();if(!locked&&timelineSelection.length)copyActive();return}
   if(mod && key==='a' && !event.shiftKey){event.preventDefault();const items:ClipboardSelection[]=[...clips.map((_,index)=>({kind:'main' as const,index})),...videoLayers.map((_,index)=>({kind:'video' as const,index})),...imageLayers.map((_,index)=>({kind:'image' as const,index})),...textLayers.map((_,index)=>({kind:'text' as const,index})),...effectLayers.map((_,index)=>({kind:'effect' as const,index})),...audioLayers.map((_,index)=>({kind:'audio' as const,index}))];setSelectionState({items,draft:clipboardDraft()});return}
   if(mod && key==='c' && !event.shiftKey){if(!locked){event.preventDefault();copySelection()}return}
   if(mod && key==='x' && !event.shiftKey){if(!locked&&timelineSelection.length){event.preventDefault();setQuote(undefined);copySelection();deleteActive()}return}
   if(mod && key==='v' && !event.shiftKey){if(!locked&&timelineClipboard.items?.length){event.preventDefault();pasteSelection()}return}
   if(mod && key==='e' && !event.shiftKey){event.preventDefault();if(!recovering){if(!job)setOutputFPS(projectFPS);setExportOpen(true)};return}
   if(mod && key==='f' && event.shiftKey){event.preventDefault();void toggleFullscreen();return}
   if(mod && (key==='='||key==='+')){event.preventDefault();setZoom(value=>Math.min(4,value+.25));return}
   if(mod && (key==='-'||key==='_')){event.preventDefault();setZoom(value=>Math.max(1,value-.25));return}
   if(mod)return
   if(key==='k'&&!event.shiftKey){event.preventDefault();togglePlayback();return}
   if(key==='z'&&event.shiftKey){event.preventDefault();setZoom(1);return}
   if(['arrowleft','arrowright','home','end','enter','j','l'].includes(key)) {
    if(key==='enter'&&target?.closest('button'))return
    if(target?.closest('[role="menu"]'))return
    event.preventDefault();const delta=key==='arrowleft'?-(event.shiftKey?5:1/projectFPS):key==='arrowright'?(event.shiftKey?5:1/projectFPS):key==='j'?-1:key==='l'?1:0
    const next=key==='home'||key==='enter'?0:key==='end'?timelineDuration:playhead+delta;seekTimeline(Math.max(0,Math.min(timelineDuration,next)));return
   }
   if((key==='arrowup'||key==='arrowdown')&&!event.shiftKey) {
    if(target?.closest('[role="menu"]'))return
    event.preventDefault();const point=adjacentEditPoint(videoBoundaries,playhead,key==='arrowdown'?1:-1);if(point!==undefined)seekTimeline(Math.max(0,Math.min(timelineDuration,point)));return
   }
   if(event.shiftKey)return
   if(key==='escape'){event.preventDefault();event.stopPropagation();setSelectionState({items:[],draft:clipboardDraft()});return}
   if(key==='n'){event.preventDefault();setSnap(previous=>!previous);return}
   if(key==='p'){event.preventDefault();if(!locked)setRippleEditing(value=>!value);return}
   if(key==='m'){event.preventDefault();if(!locked&&timelineDuration>0)toggleAtPlayhead();return}
   if(key==='v'){event.preventDefault();if(!locked&&selectedVisualItems.length)toggleSelectedVisibility();return}
   if(key==='a'||key==='b'){event.preventDefault();if(!locked){setBladeMode(key==='b');setBladePreview(undefined)}return}
   if(key==='q'||key==='w') {
    event.preventDefault();if(!locked&&canSplitSelection(key==='q'?'right':'left')){setQuote(undefined);splitSelection(key==='q'?'right':'left')};return
   }
   if(key==='delete'||key==='backspace'){event.preventDefault();if(!locked&&timelineSelection.length){setQuote(undefined);deleteActive()}}
  }
  // A focused button activates on Space keyup; swallow that once Space already toggled playback.
  function handleShortcutKeyUp(event:KeyboardEvent) {
   if(event.key!==' '||!spacePlayback.current)return
   spacePlayback.current=false;event.preventDefault()
  }
  window.addEventListener('keydown',handleShortcut,true)
  window.addEventListener('keyup',handleShortcutKeyUp,true)
  return ()=>{window.removeEventListener('keydown',handleShortcut,true);window.removeEventListener('keyup',handleShortcutKeyUp,true)}
 })
 const previewMedia=<>
      {operation==='edit' && !sourceDimensions[resource] && currentResource!==resource && <video className="hidden" preload="metadata" src={urls[resource] ?? sourceUrl} onLoadedMetadata={event=>{const origin=event.currentTarget;if(origin.videoWidth&&origin.videoHeight)setSourceDimensions(previous=>({...previous,[resource]:{width:origin.videoWidth,height:origin.videoHeight}}))}} />}
      {operation==='edit' && clip?.media_type==='image' && <img ref={bindImage} data-preview-identity={`${operation}:${selected}:${currentResource}`} key={`${currentResource}:${selected}`} data-video-tool-preview aria-label="图片预览" alt="图片预览" src={stillCurrentUrl} className={`absolute inset-0 h-full w-full object-contain [image-orientation:none] ${tailTime!==undefined?'invisible':''}`} style={{transform:`translate(${displayTransform.x*100}%, ${displayTransform.y*100}%) rotate(${displayTransform.rotation}deg) scale(${displayTransform.scale})`,opacity:animatedTransform.opacity}} onLoad={event=>imageMetadata(event.currentTarget)} onError={()=>setError('E7009 图片预览暂时不可用')} />}
      {(operation!=='edit' || clip?.media_type!=='image') && <video ref={bindVideo} data-preview-identity={`${operation}:${selected}:${currentResource}`} data-video-tool-preview aria-label="视频预览" src={currentUrl} controls={operation === 'erase' && !needsRect} preload="metadata" style={operation === 'edit' && (clip?.transform || isHidden(clip) || previewDrag?.target.kind==='video') ? { transform: `translate(${displayTransform.x * 100}%, ${displayTransform.y * 100}%) rotate(${displayTransform.rotation}deg) scale(${displayTransform.scale})`, opacity: animatedTransform.opacity } : undefined} className={`${operation === 'edit' ? 'absolute inset-0 h-full w-full object-contain' : 'max-h-[38vh] max-w-full rounded-lg'} ${tailTime !== undefined || (operation==='edit'&&!clip) ? 'invisible' : ''}`} onLoadedMetadata={metadata} onError={() => setError('E7009 视频预览暂时不可用')} onPlay={() => { setPreviewPlaying(true); previewTimeUpdate() }} onPause={() => { setPreviewPlaying(false); previewTimeUpdate() }} onTimeUpdate={() => previewTimeUpdate()} onEnded={() => previewTimeUpdate(true)} />}
 </>
 return <MediaModal open className={operation === 'edit' ? editShell : '[--mf-brand:#d4d4d4] [&_.ant-modal-body]:max-h-[calc(100vh-130px)] [&_.ant-modal-body]:overflow-y-auto'} title={operation === 'edit' ? null : '视频工具'} closable={operation !== 'edit'} footer={null} width={operation === 'edit' ? '100vw' : 'min(1400px, calc(100vw - 32px))'} mask={{ closable: false }} onCancel={onClose}>
  <div className={operation === 'edit' ? 'flex h-full flex-col overflow-y-auto text-sm text-[#dedede] md:overflow-hidden' : 'grid gap-4 text-sm text-zinc-100'} onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
   <div className={operation === 'edit' ? 'flex h-[49px] shrink-0 items-center gap-2 bg-[#1d1d1d] px-4' : 'flex flex-wrap items-center gap-2'}>
    {operation === 'edit' && <><button type="button" aria-label="关闭剪辑" className="grid size-8 shrink-0 place-items-center rounded-md text-white hover:bg-white/10" onClick={onClose}><X size={18} aria-hidden="true" /></button><span className="min-w-0 flex-1 truncate text-[15px] font-medium text-white">剪辑</span></>}
    {operation === 'erase' && ctx.config.edit_enabled && <MediaButton variant="default" disabled={locked} onClick={() => setOperation('edit')}>剪辑</MediaButton>}
    {operation === 'erase' && ctx.config.erase_enabled && <MediaButton variant={operation === 'erase' ? 'primary' : 'default'} disabled={locked} onClick={() => setOperation('erase')}>字幕擦除</MediaButton>}
    {operation === 'edit' && <MediaPopover open={shortcutsOpen} onOpenChange={setShortcutsOpen} trigger="click" placement="bottomRight" content={<div className="grid min-w-72 gap-1.5 rounded-xl border border-white/10 bg-zinc-900 p-4 text-xs text-zinc-100"><p className="mb-1 font-medium">快捷键（同剪映）</p>{shortcutHelp.map(([label,binding])=><p key={label} className="flex items-center justify-between gap-6"><span className="text-[#a3a3a3]">{label}</span><kbd className="rounded border border-white/15 bg-white/10 px-1.5 font-sans text-[11px] leading-[18px]">{binding}</kbd></p>)}</div>}><button type="button" className="h-8 shrink-0 rounded-full px-3 text-[13px] text-[#dedede] hover:bg-white/10">快捷键</button></MediaPopover>}
    {droppingFiles.current && <span role="status" className="text-xs text-[#7a7a7a]">正在导入素材…</span>}
    {operation === 'edit' && <ShortcutTooltip label="导出" description="设置分辨率、帧率等参数并导出成片" shortcut={keys.export}><button type="button" disabled={recovering} className="h-8 shrink-0 rounded-full bg-[#dedede] px-4 text-[13px] font-medium text-[#1a1a1a] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50" onClick={()=>{if(!job)setOutputFPS(projectFPS);setExportOpen(true)}}>导出</button></ShortcutTooltip>}
    {operation === 'erase' && <select aria-label="擦除模式" className={`${field} max-w-64`} value={mode} disabled={locked} onChange={e => setMode(e.target.value as EraseMode)}>{Object.entries(modes).map(([value, label]) => <option className="bg-white text-[#111827]" key={value} value={value}>{label}</option>)}</select>}
   </div>
   <div className={operation === 'edit' ? 'grid shrink-0 gap-2 px-3 pb-2 md:min-h-[260px] md:flex-1 md:basis-0 md:grid-cols-[clamp(220px,24.3vw,350px)_minmax(0,1fr)_clamp(220px,24.3vw,350px)]' : 'grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]'}>
    {operation === 'edit' && <aside aria-label="素材" className={`${editorPanelClass} max-md:h-[60vh]`}>
     <EditorPanelHeader compact><div role="group" aria-label="素材分类" className="grid w-full min-w-0 auto-cols-fr grid-flow-col gap-0.5 rounded-[10px] bg-[#3a3a3a]/35 p-1">{libraryTabs.map(([value,name,Icon])=><button type="button" key={value} aria-pressed={libraryTab===value} title={name} className={`flex h-9 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-xs font-medium text-white ${libraryTab===value?'bg-black':'hover:bg-white/10'}`} onClick={()=>setLibraryTab(value)}><Icon size={14} aria-hidden="true" className="shrink-0" /><span className="truncate leading-tight">{name}</span></button>)}</div></EditorPanelHeader>
     <div className={`min-h-0 flex-1 ${libraryTab==='video'||libraryTab==='audio'?'flex':'overflow-y-auto p-3'}`}>
     {libraryTab==='sticker' ? <StickerLibrary key={ctx.preferenceNamespace??'anonymous'} namespace={ctx.preferenceNamespace} disabled={locked||!ctx.library||imageLayers.length>=16} onAdd={sticker=>addSticker(sticker)} onDragStart={(event,sticker)=>{event.stopPropagation();stickerDrag.current=sticker;event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('application/x-flowx-sticker','1')}} onDragEnd={()=>{stickerDrag.current=undefined;setTextPresetDrop(undefined)}} /> : libraryTab==='effect' ? <div aria-label="特效素材" className="grid grid-cols-2 gap-2"><button type="button" aria-label="添加模糊特效" draggable={!locked} onDragStart={event=>{event.stopPropagation();effectDrag.current=true;event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('application/x-flowx-effect','blur')}} onDragEnd={()=>{effectDrag.current=false;setTextPresetDrop(undefined)}} disabled={locked} className="rounded-lg border border-white/10 bg-[var(--mf-brand)]/10 p-3 text-sm text-zinc-100 hover:border-[var(--mf-brand)] disabled:opacity-50" onClick={()=>addEffect(playhead)}>模糊 ＋</button></div> : libraryTab==='settings' ? <section aria-label="项目设置" className="grid gap-4 text-sm"><p className="font-medium">项目设置</p><label className="grid gap-1 text-xs text-zinc-400">背景<input aria-label="项目背景颜色" type="color" value={`#${backgroundColor}`} disabled={locked} onChange={event=>setBackgroundColor(event.target.value.slice(1))} className="h-10 w-full cursor-pointer rounded-lg border border-white/15 bg-zinc-900 p-1" /></label><label className="grid gap-1 text-xs text-zinc-400">宽高比<select aria-label="项目画面比例" className={field} value={outputAspect} disabled={locked} onChange={event=>{setQuote(undefined);setOutputAspect(event.target.value as VideoAspect)}}>{Object.keys(aspects).map(value=><option className="bg-white text-[#111827]" key={value||'original'} value={value}>{value===''?'适应（原始）':value==='5.8'?'5.8寸':value}</option>)}</select></label><label className="grid gap-1 text-xs text-zinc-400">帧率<select aria-label="项目帧率" className={field} value={projectFPS} disabled={locked} onChange={event=>setProjectFPS(Number(event.target.value) as 24|25|30|60|120)}>{[24,25,30,60,120].map(value=><option className="bg-white text-[#111827]" key={value} value={value}>{value} fps</option>)}</select></label></section> : libraryTab==='text' ? <TextPresets items={textPresets.items} disabled={locked} addDisabled={textLayers.length>=MAX_TEXT_LAYERS} onAdd={style=>addText(style,playhead>=599.95?0:playhead)} onDragStart={(event,style)=>{event.stopPropagation();textPresetDrag.current=style;event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('application/x-flowx-text-preset','1')}} onDragEnd={()=>{textPresetDrag.current=undefined;setTextPresetDrop(undefined)}} onRename={textPresets.rename} onDelete={textPresets.remove} /> : <SourcePicker key={libraryTab} kinds={libraryTab==='audio'?['audio']:['image','video','audio']} library={ctx.library} resolve={resolveSource} sources={{video:ctx.sources,audio:ctx.audioSources,image:ctx.imageSources}} disabled={kind=>locked || (kind==='video'?(videoAddMode==='main'?clips.length>=32:videoLayers.length>=16):kind==='audio'?audioLayers.length>=16:imageLayers.length>=16)} extra={libraryTab==='video' ? <label className="grid gap-1 text-xs text-[#7a7a7a]">视频添加到<select aria-label="视频添加方式" className={field} value={videoAddMode} disabled={locked} onChange={e=>setVideoAddMode(e.target.value as 'main'|'overlay')}><option className="bg-white text-[#111827]" value="main">主视频轨道</option><option className="bg-white text-[#111827]" value="overlay">叠加视频轨道</option></select></label> : undefined} onError={setError} onDragStart={(event,kind,id,name)=>{event.stopPropagation();sourceDrag.current={kind,id,name};event.dataTransfer.effectAllowed='copy';event.dataTransfer.setData('application/x-flowx-source','1')}} onDragEnd={()=>{sourceDrag.current=undefined;setTextPresetDrop(undefined)}} onAdd={async (kind,id,name) => { if(kind==='video') {if(videoAddMode==='overlay')await addOverlay(id);else await addSource(id)} else if(kind==='image') await addImageSource(id); else { setAddedAudioSources(previous=>[...previous.filter(source=>source.resource!==id),{resource:id,name}]); await addAudioSource(id) } }} />}
     </div>
    </aside>}
    <div ref={player} className={`relative flex min-h-60 items-center justify-center fullscreen:h-screen fullscreen:w-screen fullscreen:rounded-none fullscreen:border-0 fullscreen:bg-black ${operation==='edit'?'min-h-0 flex-col overflow-hidden rounded-md border border-[#2e2e2e] bg-[#262626] max-md:h-[50vh]':'rounded-xl bg-black/30 p-3'}`}>
     {operation==='edit' && !playerFullscreen && <EditorPanelHeader title="播放器" />}
     <div className={operation==='edit'?'flex min-h-0 w-full flex-1 items-center justify-center p-3':'contents'}>
     {/* The preview canvas must follow the chosen output ratio and available viewport. */}
     <div ref={previewCanvas} data-video-tool-canvas onPointerDown={previewPointerDown} onPointerMove={previewPointerMove} onPointerUp={previewPointerEnd} onPointerCancel={e=>previewPointerEnd(e,true)} onLostPointerCapture={e=>previewPointerEnd(e,true)} className={`relative overflow-hidden ${operation === 'edit' ? 'shrink-0 touch-none bg-[var(--mf-canvas-background)]' : 'inline-flex max-w-full bg-black'}`} style={operation === 'edit' ? { aspectRatio: previewAspect, width: playerFullscreen ? `min(100%, ${92 * previewAspect}vh)` : `min(100%, max(${144 * previewAspect}px, calc(${50 * previewAspect}vh - ${150 * previewAspect}px)))`, '--mf-canvas-background': `#${backgroundColor}` } as React.CSSProperties : undefined}>
      {/* Runtime transform values mirror the selected clip’s render settings. */}
      {operation==='edit' ? <EffectComposition background={backgroundColor} baseBlend={clip?.blend_mode} baseEffects={clip?.effects} baseTime={time} baseScale={displayTransform.scale} videos={previewVideos} images={previewImages} text={previewText} effects={previewEffects} urls={urls} time={playhead} playing={previewPlaying||tailPlaying} onDuration={(id,duration)=>setDurations(previous=>previous[id]===duration?previous:{...previous,[id]:duration})} base={previewMedia} /> : previewMedia}
      {tailTime !== undefined && <div className="absolute inset-0 grid place-items-center rounded-lg bg-transparent"><button type="button" className="rounded-full bg-white/15 px-4 py-2 text-white" onClick={() => tailPlaying ? pauseTail() : startTail(tailTime >= timelineDuration ? totalDuration : tailTime)}>{tailPlaying ? '暂停' : '播放'}</button></div>}
      {operation === 'edit' && showBookmarkNotes && <div aria-label="书签备注预览" aria-live="polite" className="pointer-events-none absolute left-2 top-2 z-20 flex max-w-[50%] flex-col gap-1">{visibleBookmarkNotes(bookmarks,playhead).map(item=><div key={item.id} className="border-l-[3px] border-[var(--mf-bookmark-color)] bg-black/60 px-2 py-1 text-xs text-white" style={{'--mf-bookmark-color':item.color??'var(--mf-brand)'} as React.CSSProperties}>{item.note}</div>)}</div>}
      {operation === 'edit' && timelineSelection.length===1 && activeTrack.kind!=='effect' && <PreviewSelection canvas={previewCanvas} selection={{kind:activeTrack.kind,index:activeTrack.index}} main={previewDrag?.target.kind==='video'?{...displayTransform,keyframes:undefined}:clip?.transform} mainIndex={selected} mainVisible={Boolean(clip)&&tailTime===undefined&&!isHidden(clip)} videos={previewVideos} images={previewImages} text={previewText} urls={urls} time={playhead} sourceTime={time} onHandle={previewHandle} />}
      {needsRect && dimensions.width > 0 && <svg role="img" aria-label="拖拽选择字幕擦除区域" className="absolute inset-0 h-full w-full touch-none cursor-crosshair" viewBox={`0 0 ${dimensions.width || 1} ${dimensions.height || 1}`} preserveAspectRatio="none" onPointerDown={e => { if (locked) return; selecting.current = point(e); e.currentTarget.setPointerCapture(e.pointerId) }} onPointerMove={e => { const start = selecting.current; if (!start) return; const end = point(e); setRect({ x1: Math.min(start.x,end.x), y1: Math.min(start.y,end.y), x2: Math.max(start.x,end.x), y2: Math.max(start.y,end.y) }) }} onPointerUp={() => { selecting.current = undefined }} onPointerCancel={() => { selecting.current = undefined }}>
       {rect && <rect x={rect.x1} y={rect.y1} width={rect.x2-rect.x1} height={rect.y2-rect.y1} className="fill-[var(--mf-brand)]/20 stroke-[var(--mf-brand)]" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
      </svg>}
     </div>
     </div>
     {operation==='edit' && !playerFullscreen && <div aria-label="播放器控制" className="relative flex h-10 w-full shrink-0 items-center justify-between gap-2 px-4 text-xs text-[#7a7a7a]">
      <span aria-label="播放时间" className="min-w-0 flex-1 whitespace-nowrap font-mono text-[11.5px] tabular-nums"><EditableTimecode display={timecode(playhead,projectFPS)} fps={projectFPS} duration={timelineDuration} disabled={locked || timelineDuration<=0 || (Boolean(clip) && tailTime===undefined && loadedResource!==currentResource)} onSeek={seekTimeline} /> / {timecode(timelineDuration,projectFPS)}</span>
      <ShortcutTooltip label={previewPlaying||tailPlaying?'暂停':'播放'} shortcut={keys.playPause}><button type="button" aria-label={previewPlaying||tailPlaying?'暂停预览':'播放预览'} onClick={togglePlayback} className="grid size-7 shrink-0 place-items-center rounded-md text-[#dedede] hover:bg-white/10">{previewPlaying||tailPlaying?<Pause size={16} aria-hidden="true" />:<Play size={16} aria-hidden="true" />}</button></ShortcutTooltip>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1"><TimelineToolButton label="保存截图" description="将当前播放器画面保存为图片" icon={Camera} disabled={locked || timelineDuration<=0 || (!outputAspect && (!aspectSource.width || !aspectSource.height))} onClick={()=>void saveSnapshot()} /><select aria-label="画面比例" className="!h-[22px] max-w-24 cursor-pointer !rounded-none !border !border-white/85 !bg-transparent !px-1 !py-0 text-[10px] font-semibold !text-white" value={outputAspect} disabled={locked} onChange={e=>{setQuote(undefined);setOutputAspect(e.target.value as VideoAspect)}}>{Object.keys(aspects).map(value=><option className="bg-white text-[#111827]" key={value||'original'} value={value}>{value===''?'适应（原始）':value==='5.8'?'5.8寸':value}</option>)}</select></div>
     </div>}
     {operation === 'edit' && <ShortcutTooltip label={playerFullscreen?'退出全屏':'全屏预览'} shortcut={keys.fullscreen}><button type="button" aria-label={playerFullscreen?'退出全屏':'全屏预览'} className="absolute right-2 top-2 z-30 grid size-7 place-items-center rounded-md text-[#dedede] hover:bg-white/10" onClick={()=>void toggleFullscreen()}>{playerFullscreen?<Minimize2 size={16} aria-hidden="true" />:<Maximize2 size={16} aria-hidden="true" />}</button></ShortcutTooltip>}
     {operation === 'edit' && playerFullscreen && <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-black/70 px-4 py-2 text-white"><button type="button" aria-label={previewPlaying||tailPlaying?'全屏暂停':'全屏播放'} onClick={togglePlayback}>{previewPlaying||tailPlaying?'暂停':'播放'}</button><span aria-label="播放时间" className="whitespace-nowrap text-xs tabular-nums"><EditableTimecode display={timecode(playhead,projectFPS)} fps={projectFPS} duration={timelineDuration} disabled={locked || timelineDuration<=0 || (Boolean(clip) && tailTime===undefined && loadedResource!==currentResource)} onSeek={seekTimeline} /> / {timecode(timelineDuration,projectFPS)}</span><button type="button" aria-label="全屏保存截图" disabled={locked || timelineDuration<=0 || (!outputAspect && (!aspectSource.width || !aspectSource.height))} onClick={()=>void saveSnapshot()}>截图</button></div>}
    </div>
    <aside aria-label={operation==='edit'?'草稿参数':undefined} className={operation==='edit'?`${editorPanelClass} max-md:min-h-[40vh]`:'grid max-h-[42vh] content-start gap-3 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-4'}>
     {operation==='edit' && <EditorPanelHeader title="草稿参数" />}
     <div className={operation==='edit'?'grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4 text-xs':'contents'}>
     {operation==='edit' && timelineSelection.length!==1 ? timelineSelection.length ? <p className="py-6 text-center text-[#7a7a7a]">已选择 {timelineSelection.length} 个片段</p> : <EditorEmptyState title="这里是空的" description="点击时间轴上的元素来编辑其属性" /> : operation === 'edit' && activeTrack.kind==='effect' && effectLayers[activeTrack.index] ? <div aria-label="特效属性" className="grid gap-3 text-sm"><p className="font-medium">模糊特效</p><label>强度<input aria-label="模糊强度" type="number" min="0" max="100" step="1" className={field} disabled={locked} value={effectLayers[activeTrack.index].intensity} onChange={event=>setEffectLayers(previous=>previous.map((item,index)=>index===activeTrack.index?{...item,intensity:Number(event.target.value)}:item))} /></label></div> : operation === 'edit' && activeTrack.kind==='overlay' && videoLayers[activeTrack.index] ? <VideoLayerPanel layer={videoLayers[activeTrack.index]} time={playhead} disabled={locked} onChange={change=>{setQuote(undefined);const index=activeTrack.index,item=videoLayers[index];if(change.start!==undefined||change.end!==undefined){if(rippleEditing)commitRippleTrim('video',index,item,{...item,...change});else moveVisualTrackItem({kind:'video',index},item,{...item,...change},newTrackId())}else setVideoLayers(previous=>previous.map((entry,i)=>i===index?{...entry,...change}:entry))}} onDelete={deleteActive} /> : operation === 'edit' && activeTrack.kind==='audio' && audioLayers[activeTrack.index] ? <AudioTrackPanel layers={audioLayers} selectedIndex={activeTrack.index} sources={[...ctx.audioSources,...addedAudioSources]} disabled={locked} onChange={(index,change)=>{setQuote(undefined);const item=audioLayers[index];if(!item)return;if(rippleEditing&&(change.start!==undefined||change.end!==undefined)){commitRippleTrim('audio',index,item,{...item,...change});return}const id=newTrackId();setAudioLayers(previous=>{const current=previous[index];if(!current)return previous;return change.start!==undefined||change.end!==undefined?moveAudioItem(previous,index,{...current,...change},id)??previous:previous.map((entry,i)=>i===index?{...entry,...change}:entry)})}} onDelete={index=>{if(index===activeTrack.index)deleteActive()}} /> : operation === 'edit' && activeTrack.kind==='image' && imageLayers[activeTrack.index] ? <ImageTrackPanel layers={imageLayers} time={playhead} selectedIndex={activeTrack.index} disabled={locked} onChange={(index,change)=>{setQuote(undefined);const item=imageLayers[index];if(!item)return;if(change.start!==undefined||change.end!==undefined){if(rippleEditing)commitRippleTrim('image',index,item,{...item,...change});else moveVisualTrackItem({kind:'image',index},item,{...item,...change},newTrackId())}else setImageLayers(previous=>previous.map((entry,i)=>i===index?{...entry,...change}:entry))}} onDelete={index=>{if(index===activeTrack.index)deleteActive()}} /> : operation === 'edit' && activeTrack.kind==='text' && textLayers[activeTrack.index] ? <TextTrackPanel onSavePreset={textPresets.save} layers={textLayers} selectedIndex={activeTrack.index} time={playhead} disabled={locked} onChange={(index,change)=>{setQuote(undefined);const item=textLayers[index];if(!item)return;if(change.start!==undefined||change.end!==undefined){if(rippleEditing)commitRippleTrim('text',index,item,{...item,...change});else moveVisualTrackItem({kind:'text',index},item,{...item,...change},newTrackId())}else setTextLayers(previous=>previous.map((entry,i)=>i===index?{...entry,...change}:entry))}} onDelete={index=>{if(index===activeTrack.index)deleteActive()}} /> : operation === 'edit' && clip ? <>
      <p className="font-medium">画面变换</p><VideoTransformControls transform={transform} time={time} outside={loadedResource!==currentResource || tailTime!==undefined || time<clip.start || time>clip.end} disabled={locked} blendMode={clip.blend_mode} onTransform={transform=>update({transform})} onBlend={blend_mode=>update({blend_mode})}/>
      <p className="text-xs text-zinc-400">位置以画面宽高为单位，旋转以角度为单位。</p><button type="button" className="text-left text-xs text-[var(--mf-brand)]" disabled={locked} onClick={() => update({ transform: undefined })}>重置画面变换</button>
      <label>开始（秒）<input className={field} type="number" min="0" step="0.01" value={clip.start} disabled={locked} onChange={e => update({ start: Number(e.target.value) })} /></label>
      <label>结束（秒）<input className={field} type="number" min="0" step="0.01" value={clip.end} disabled={locked} onChange={e => update({ end: Number(e.target.value) })} /></label>
      {clip.media_type!=='image' && <><label>变速倍数<input className={field} type="number" min="0.25" max="4" step="0.05" value={clip.rate} disabled={locked} onChange={e => update({ rate: Number(e.target.value) })} /></label>
      <label>音量增益（dB）<input className={field} type="number" min="-60" max="12" step="0.1" value={clip.volume_db} disabled={locked} onChange={e => update({ volume_db: Number(e.target.value) })} /></label>
      <p className="text-xs text-zinc-400">增益高于 0 dB 的效果在导出时应用。</p></>}
     </> : <><p>处理完整原视频，保留原声。</p>{needsRect && <p className="text-xs text-zinc-400">在画面上拖拽选区，最多 480,000 像素。{rect ? `当前 ${(rect.x2-rect.x1)*(rect.y2-rect.y1)} 像素` : ''}</p>}<input aria-label="预览位置" type="range" min="0" max={durations[resource] ?? 0} step="0.05" value={time} onChange={e => { if(video.current) video.current.currentTime=Number(e.target.value) }} /></>}
     {operation==='edit' && timelineSelection.length===1 && activeTrack.kind!=='audio' && activeTrack.kind!=='effect' && (()=>{const kind=activeIsVideo?'video':activeTrack.kind,index=activeIsVideo?selected:activeTrack.index,item=kind==='video'?clip:kind==='overlay'?videoLayers[index]:kind==='image'?imageLayers[index]:textLayers[index];if(!item?.effects?.length)return null;const at=kind==='video'?time:kind==='overlay'?(item as VideoLayer).source_start+Math.max(0,playhead-item.start)*(item as VideoLayer).rate:playhead,outside=kind==='video'?tailTime!==undefined||time<item.start||time>=item.end:playhead<item.start||playhead>=item.end;return <VisualEffectsPanel effects={item.effects} time={at} outside={outside} disabled={locked} onChange={effects=>{setQuote(undefined);if(kind==='video')setClips(previous=>previous.map((entry,i)=>i===index?{...entry,effects}:entry));else if(kind==='overlay')setVideoLayers(previous=>previous.map((entry,i)=>i===index?{...entry,effects}:entry));else if(kind==='image')setImageLayers(previous=>previous.map((entry,i)=>i===index?{...entry,effects}:entry));else setTextLayers(previous=>previous.map((entry,i)=>i===index?{...entry,effects}:entry))}} />})()}
     </div>
    </aside>
   </div>
   {operation === 'edit' && <>
    {audioLayers.map((layer,index) => urls[layer.resource_uuid] && <audio key={`${layer.resource_uuid}:${index}`} ref={element => { if (element) audioElements.current.set(index,element); else audioElements.current.delete(index) }} src={urls[layer.resource_uuid]} preload="metadata" onLoadedMetadata={e => { const duration=e.currentTarget.duration; if (Number.isFinite(duration) && duration > 0) setAudioDurations(p => ({ ...p, [layer.resource_uuid]: duration })) }} />)}
    <section aria-label="时间线面板" className={`${editorPanelClass} mx-3 mb-3 min-h-[220px] flex-1 basis-0 max-md:min-h-[420px]`}>
    <div aria-label="时间线工具栏" className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-[#2e2e2e] px-2 py-1">
     <TimelineToolButton label="撤销" description="撤销上一步编辑" shortcut={keys.undo} icon={Undo2} disabled={locked || !canUndo} onClick={()=>{setQuote(undefined);undo();setSelected(0)}} />
     <TimelineToolButton label="重做" description="恢复刚刚撤销的编辑" shortcut={keys.redo} icon={Redo2} disabled={locked || !canRedo} onClick={()=>{setQuote(undefined);redo();setSelected(0)}} />
     <TimelineToolButton label={bladeMode?'切换为选择工具':'剪刀工具'} description={bladeMode?'恢复选择模式，可拖动和选中片段（A）':'点击时间轴上的片段即可在该位置切割；按 A 返回选择模式'} shortcut={bladeMode?keys.select:keys.blade} icon={Scissors} pressed={bladeMode} disabled={locked} onClick={()=>{setBladeMode(previous=>!previous);setBladePreview(undefined)}} />
     {(['both','left','right'] as const).map((keep,i)=><TimelineToolButton key={keep} label={['分割','向右裁剪','向左裁剪'][i]} description={['在播放头位置分割选中片段（未选中时分割播放头下的片段）','删除播放头右侧部分，保留左侧','删除播放头左侧部分，保留右侧'][i]} shortcut={[keys.split,keys.trimRight,keys.trimLeft][i]} icon={Split} disabled={locked || !canSplitSelection(keep)} onClick={()=>splitSelection(keep)} />)}
     <TimelineToolButton label="图层上移" description="将选中的画面图层上移一层，覆盖在更多图层之上" icon={ArrowUp} disabled={locked || timelineSelection.length!==1 || !selectedVisual || selectedVisualPosition<0 || selectedVisualPosition>=visualOrder.length-1} onClick={()=>{if(selectedVisual)moveVisualLayer(selectedVisual,activeTrack.index,1)}} />
     <TimelineToolButton label="图层下移" description="将选中的画面图层下移一层" icon={ArrowDown} disabled={locked || timelineSelection.length!==1 || !selectedVisual || selectedVisualPosition<=0} onClick={()=>{if(selectedVisual)moveVisualLayer(selectedVisual,activeTrack.index,-1)}} />
     <TimelineToolButton label={selectedElementHidden?'启用片段':'停用片段'} description={selectedElementHidden?'重新在画面中显示选中片段':'在画面中隐藏选中片段，导出时也不显示'} shortcut={keys.toggleEnabled} icon={selectedElementHidden?EyeOff:Eye} disabled={locked || !selectedVisualItems.length} onClick={toggleSelectedVisibility} />
     <TimelineToolButton label={selectedElementsMuted?'取消静音':'静音'} description={selectedElementsMuted?'恢复选中片段的声音':'关闭选中片段的声音'} icon={selectedElementsMuted?VolumeX:Volume2} disabled={locked || !selectedAudibleItems.length} onClick={toggleSelectedMute} />
     <TimelineToolButton label="复制" description="复制选中片段，可粘贴到播放头位置" shortcut={keys.copy} icon={Copy} disabled={locked || !timelineSelection.length} onClick={copySelection} />
     <TimelineToolButton label="粘贴" description="在播放头位置粘贴已复制的片段" shortcut={keys.paste} icon={ClipboardPaste} disabled={locked || !timelineClipboard.items?.length} onClick={pasteSelection} />
     <TimelineToolButton label="复制片段" description="在选中片段之后直接生成一份副本" shortcut={keys.duplicate} icon={CopyPlus} disabled={locked || !timelineSelection.length} onClick={copyActive} />
     <TimelineToolButton label="删除" description="删除选中片段" shortcut={keys.delete} icon={Trash2} disabled={locked || !timelineSelection.length} onClick={deleteActive} />
     <TimelineToolButton label="封面" description="从视频帧或本地图片设置导出封面" icon={ImageIcon} disabled={locked || timelineDuration<=0} onClick={openCover} />
     <TimelineToolButton label={bookmarks.some(item=>Math.abs(item.time-frameTime(playhead,projectFPS))<.001)?'移除标记':'添加标记'} description="在播放头位置添加或移除时间线标记" shortcut={keys.marker} icon={bookmarks.some(item=>Math.abs(item.time-frameTime(playhead,projectFPS))<.001)?BookmarkX:Bookmark} disabled={locked || timelineDuration<=0} onClick={toggleAtPlayhead} />
     <TimelineToolButton label={showBookmarkNotes?'隐藏标记备注':'显示标记备注'} description="在时间线标尺上显示标记的文字备注" icon={MessageSquare} pressed={showBookmarkNotes} onClick={()=>setShowBookmarkNotes(previous=>!previous)} />
     <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
      <TimelineToolButton label={snap?'关闭自动吸附':'开启自动吸附'} description="拖动片段时自动对齐其他片段边缘和播放头；拖动时按住 Shift 可暂时关闭" shortcut={keys.snap} icon={Magnet} pressed={snap} onClick={()=>setSnap(previous=>!previous)} />
      <TimelineToolButton label={rippleEditing?'关闭磁吸':'开启磁吸'} description="开启后分割、裁剪或删除片段时，同轨道后续片段自动前移补齐空隙" shortcut={keys.ripple} icon={Link2} pressed={rippleEditing} disabled={locked} onClick={()=>setRippleEditing(value=>!value)} />
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-[#2e2e2e]" />
      <TimelineToolButton label="时间线缩小" description="缩小时间线以查看更长范围；Shift + Z 适应全部片段" shortcut={keys.zoomOut} icon={ZoomOut} disabled={zoom<=1} onClick={()=>setZoom(value=>Math.max(1,value-.25))} />
      {/* The filled part of the zoom track follows the current zoom through a CSS variable. */}
      <input aria-label="时间线缩放" type="range" min="1" max="4" step="0.25" value={zoom} onChange={e=>setZoom(Number(e.target.value))} className="h-4 w-24 cursor-pointer appearance-none bg-transparent [&::-moz-range-progress]:h-1.5 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-[var(--mf-brand)] [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-[var(--mf-brand)]/50 [&::-moz-range-thumb]:bg-[#1a1a1a] [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-white/15 [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--mf-brand)_var(--mf-zoom),rgb(255_255_255/0.14)_var(--mf-zoom))] [&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-[var(--mf-brand)]/50 [&::-webkit-slider-thumb]:bg-[#1a1a1a]" style={{'--mf-zoom':`${(zoom-1)/3*100}%`} as React.CSSProperties} />
      <TimelineToolButton label="时间线放大" description="放大时间线以精确编辑" shortcut={keys.zoomIn} icon={ZoomIn} disabled={zoom>=4} onClick={()=>setZoom(value=>Math.min(4,value+.25))} />
     </div>
    </div>
    <label className="sr-only">播放位置<input aria-label="时间线播放位置" className="flex-1 accent-[var(--mf-brand)]" type="range" disabled={locked || (tailTime===undefined && loadedResource!==currentResource)} min="0" max={timelineDuration} step="any" value={playhead} onChange={e=>seekTimeline(Number(e.target.value))} onKeyDown={event=>{const delta=event.key==='ArrowLeft'||event.key==='ArrowDown'?-1/projectFPS:event.key==='ArrowRight'||event.key==='ArrowUp'?1/projectFPS:0;if(delta||event.key==='Home'||event.key==='End'){event.preventDefault();seekTimeline(event.key==='Home'?0:event.key==='End'?timelineDuration:Math.max(0,Math.min(timelineDuration,playhead+delta)))}}} /></label>
    <div className="min-h-0 flex-1 overflow-auto" aria-label="时间线">
     {/* Timeline positions and lengths reflect the selected zoom and track timing. */}
     <div data-video-tool-timeline-content className={`relative ${bladeMode?'cursor-crosshair [&_[data-blade-kind]_*]:!cursor-crosshair':''}`} onPointerDownCapture={event=>{if(!bladeMode||locked||event.button!==0)return;const target=(event.target as Element).closest('[data-blade-kind]'),kind=target?.getAttribute('data-blade-kind'),raw=target?.getAttribute('data-blade-index');if(!target||!raw||!/^\d+$/.test(raw))return;event.preventDefault();event.stopPropagation();if(kind==='video'||kind==='overlay'||kind==='audio'||kind==='image'||kind==='text'||kind==='effect'){const box=event.currentTarget.getBoundingClientRect(),at=Math.max(0,Math.min(timelineDuration,frameTime((event.clientX-box.left-TRACK_HEADER)/pixelsPerSecond,projectFPS)));splitAt(kind,Number(raw),at,'both')}}} onClickCapture={event=>{if(bladeMode&&(event.target as Element).closest('[data-blade-kind]')){event.preventDefault();event.stopPropagation()}}} onPointerMove={event=>{if(!bladeMode)return;const target=(event.target as Element).closest('[data-blade-kind]');if(!target){setBladePreview(undefined);return}const box=event.currentTarget.getBoundingClientRect();setBladePreview(Math.max(0,Math.min(timelineDuration,frameTime((event.clientX-box.left-TRACK_HEADER)/pixelsPerSecond,projectFPS))))}} onPointerLeave={()=>setBladePreview(undefined)} onDragOver={event=>{if(locked){if(event.dataTransfer.types.includes('Files'))event.preventDefault();return}const source=sourceDrag.current,style=textPresetDrag.current;if(event.dataTransfer.types.includes('application/x-flowx-video-clip-index')&&!(event.target as Element).closest('[data-main-video-track]')){event.preventDefault();event.dataTransfer.dropEffect='move'}else if(stickerDrag.current&&event.dataTransfer.types.includes('application/x-flowx-sticker')){event.preventDefault();event.dataTransfer.dropEffect='copy';setTextPresetDrop(dropFrameTime(event))}else if(effectDrag.current&&event.dataTransfer.types.includes('application/x-flowx-effect')){event.preventDefault();event.dataTransfer.dropEffect='copy';setTextPresetDrop(dropFrameTime(event))}else if(!source&&!style&&event.dataTransfer.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect=ctx.library?'copy':'none';if(ctx.library)setTextPresetDrop(playhead)}else if(source&&event.dataTransfer.types.includes('application/x-flowx-source')){event.preventDefault();event.dataTransfer.dropEffect='copy';setTextPresetDrop(source.kind==='video'&&(Boolean((event.target as Element).closest('[data-main-video-track]'))||(!(event.target as Element).closest('[data-video-tool-track]')&&videoAddMode==='main'))?totalDuration:dropFrameTime(event))}else if(style&&textLayers.length<MAX_TEXT_LAYERS&&event.dataTransfer.types.includes('application/x-flowx-text-preset')){event.preventDefault();event.dataTransfer.dropEffect='copy';setTextPresetDrop(dropFrameTime(event))}}} onDragLeave={event=>{if(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))return;setTextPresetDrop(undefined)}} onDrop={timelineDrop} style={{width:TRACK_HEADER+Math.max(800,timelineExtent*pixelsPerSecond+120)}}>
      <div className="sticky top-0 z-20 flex h-[34px] bg-[#262626]"><div aria-hidden="true" className={`${trackHeaderClass} h-full`} /><div role="slider" tabIndex={locked ? -1 : 0} aria-label="时间线标尺" aria-disabled={locked || timelineDuration<=0 || (Boolean(clip) && tailTime===undefined && loadedResource!==currentResource)} aria-valuemin={0} aria-valuemax={timelineDuration} aria-valuenow={playhead} className="relative h-full min-w-0 flex-1 cursor-pointer border-b border-[#2e2e2e] text-[10px] leading-none text-[#7a7a7a]/85" onPointerDown={e=>{if(locked || timelineDuration<=0 || (clip && tailTime===undefined && loadedResource!==currentResource))return;e.currentTarget.setPointerCapture(e.pointerId);seekTimeline(rulerSeekTime(e))}} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;seekTimeline(rulerSeekTime(e))}} onKeyDown={e=>{if(locked || timelineDuration<=0 || (clip && tailTime===undefined && loadedResource!==currentResource))return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();seekTimeline(Math.max(0,Math.min(timelineDuration,playhead+(e.key==='ArrowRight'?1/projectFPS:-1/projectFPS))))}else if(e.key==='Home'){e.preventDefault();seekTimeline(0)}else if(e.key==='End'){e.preventDefault();seekTimeline(timelineDuration)}}}>{/* Tick spacing follows zoom and frame rate, so the repeating marks take their period from CSS variables. */}<span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.2)_0_1px,transparent_1px_var(--mf-ruler-minor))]" style={{'--mf-ruler-minor':`${rulerStep(pixelsPerSecond,projectFPS)*pixelsPerSecond/5}px`} as React.CSSProperties} /><span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-[repeating-linear-gradient(90deg,rgb(255_255_255/0.35)_0_1px,transparent_1px_var(--mf-ruler-major))]" style={{'--mf-ruler-major':`${rulerStep(pixelsPerSecond,projectFPS)*pixelsPerSecond}px`} as React.CSSProperties} />{rulerTicks(timelineExtent,pixelsPerSecond,projectFPS).map(tick=><span key={tick.time} className="absolute top-2 select-none pl-1" style={{left:tick.time*pixelsPerSecond}}>{tick.label}</span>)}{bookmarks.map(item=><BookmarkMarker key={item.id} bookmark={item} pixelsPerSecond={pixelsPerSecond} fps={projectFPS} timelineDuration={timelineDuration} snap={snap} targets={timelineSnapTargets(clips,videoBoundaries,videoLayers,audioLayers,imageLayers,textLayers,playhead,'video',-1,bookmarks.filter(other=>other.id!==item.id),true,effectLayers)} disabled={locked} onSeek={time=>seekTimeline(Math.max(0,Math.min(timelineDuration,frameTime(time,projectFPS))))} onMove={moveBookmarkAt} onChange={(id,change)=>setBookmarks(previous=>changeBookmark(previous,id,change))} onDelete={id=>setBookmarks(previous=>previous.filter(item=>item.id!==id))} />)}</div></div>
      {visualOrder.slice().reverse().map(track=>{const ref=track.refs[0],index=ref.index,kind=ref.kind,layer=kind==='video'?videoLayers[index]:kind==='image'?imageLayers[index]:kind==='text'?textLayers[index]:effectLayers[index],activeKind=kind==='video'?'overlay':kind,dropKey=track.key
       return <TrackContextMenu key={dropKey} disabled={locked} actions={[{label:'粘贴元素',disabled:!timelineClipboard.items?.length,onSelect:()=>void pasteSelection()},...(track.category==='video'?[{label:'track_muted' in layer&&layer.track_muted?'取消静音':'静音轨道',onSelect:()=>{setQuote(undefined);toggleVisualTrackMute(kind,index)}}]:[]),{label:layer.track_hidden?'显示轨道':'隐藏轨道',onSelect:()=>toggleVisualTrackVisibility(kind,index)},...(track.category==='video'?subtitleActions(ref=>ref.kind==='video'&&track.refs.some(item=>item.kind==='video'&&item.index===ref.index)):[]),{label:'删除轨道',destructive:true,onSelect:()=>deleteItems(track.refs,false)}]}>{(openMenu,menuOpen)=><VisualTrackRow menuOpen={menuOpen} isSticker={track.category==='sticker'} trackKey={track.key} kind={kind} index={index} disabled={locked} onMenu={openMenu} trackHidden={Boolean(layer.track_hidden)} onToggleVisibility={()=>toggleVisualTrackVisibility(kind,index)} dropTarget={visualDrop===dropKey} onSelect={()=>selectTimeline({kind:kind==='video'?'video':kind,index},false)} onDragStart={event=>{event.stopPropagation();visualDrag.current={ref:{kind,index},layer};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-flowx-visual-track','1');setActiveTrack({kind:activeKind,index})}} onDragOver={event=>{if(!visualDrag.current || locked)return;event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='move';setVisualDrop(previous=>previous===dropKey?previous:dropKey)}} onDragLeave={event=>{if(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))return;setVisualDrop(previous=>previous===dropKey?undefined:previous)}} onDrop={event=>{const source=visualDrag.current;if(!source || locked)return;event.preventDefault();event.stopPropagation();visualDrag.current=undefined;setVisualDrop(undefined);if(source.ref.kind===kind && source.ref.index===index)return;setQuote(undefined);moveVisualLayerTo(source.ref,{kind,index},source.layer,layer);setActiveTrack({kind:source.ref.kind==='video'?'overlay':source.ref.kind,index:source.ref.index})}} onDragEnd={()=>{visualDrag.current=undefined;setVisualDrop(undefined)}}>
        {track.refs.map(member=>{const memberIndex=member.index,memberKind=member.kind,element=memberKind==='video'?videoLayers[memberIndex]:memberKind==='image'?imageLayers[memberIndex]:memberKind==='text'?textLayers[memberIndex]:effectLayers[memberIndex],memberName=memberKind==='video'?'叠加视频':memberKind==='image'?(track.category==='sticker'?'贴纸':'图片'):memberKind==='effect'?'特效':'文字',selection=memberKind==='video'?'overlay':memberKind;return <TimelineLayer key={`${memberKind}:${memberIndex}`} bladeKind={selection} bladeIndex={memberIndex} isSelected={selectedOnTimeline(memberKind,memberIndex)} selectedGroup={timelineSelection.length>1&&selectedOnTimeline(memberKind,memberIndex)} effectKind={selection==='overlay'||selection==='image'||selection==='text'?selection:undefined} effectIndex={memberIndex} layer={element} strip={memberKind==='video'?filmstrips[(element as VideoLayer).resource_uuid]:undefined} imageUrl={memberKind==='image'?urls[(element as ImageLayer).resource_uuid]:undefined} name={`${memberName}${memberIndex+1}`} trackKey={track.key} pixelsPerSecond={pixelsPerSecond} fps={projectFPS} sourceDuration={memberKind==='video'?durations[(element as VideoLayer).resource_uuid]:undefined} disabled={locked} snap={snap} targets={timelineTargets(selection,memberIndex)} onSelect={multi=>selectTimeline({kind:memberKind,index:memberIndex},multi)} onCommit={(next,target,mode,above)=>{if(mode==='move'&&target==='main'&&(memberKind==='video'||memberKind==='image')){if(track.category==='sticker'){setError('E7009 贴纸不能放入主视频轨道');return}transferVisualToMain(memberKind,memberIndex);return}if(timelineSelection.length>1&&selectedOnTimeline(memberKind,memberIndex)){moveSelectedItem({kind:memberKind,index:memberIndex},element,next,target,track.key,mode,above);return}if(rippleEditing&&mode!=='move'&&(!target||target===track.key)){commitRippleTrim(memberKind,memberIndex,element,next as VisualLayer);return}const siblings=track.refs.filter(ref=>ref.kind!==memberKind||ref.index!==memberIndex).map(ref=>ref.kind==='video'?videoLayers[ref.index]:ref.kind==='image'?imageLayers[ref.index]:ref.kind==='text'?textLayers[ref.index]:effectLayers[ref.index]),safe=constrainTrackTrim(element,next as VisualLayer,mode,siblings,memberKind==='video'?durations[(element as VideoLayer).resource_uuid]:undefined);if(safe.start===element.start&&safe.end===element.end&&(!target||target===track.key))return;setQuote(undefined);moveVisualTrackItem({kind:memberKind,index:memberIndex},element,safe,newTrackId(),target,positionFor(target,above,'visual'))}} />})}
       </VisualTrackRow>}</TrackContextMenu>
      })}
      <TrackContextMenu disabled={locked} actions={[{label:'粘贴元素',disabled:!timelineClipboard.items?.length,onSelect:()=>void pasteSelection()},{label:mainTrackMuted?'取消静音':'静音轨道',onSelect:()=>{setQuote(undefined);toggleMainTrackMute()}},{label:mainTrackHidden?'显示轨道':'隐藏轨道',onSelect:toggleMainTrackVisibility},{label:'设置封面',disabled:timelineDuration<=0,onSelect:openCover},...subtitleActions(ref=>ref.kind==='main'),{label:'删除轨道',disabled:true,destructive:true,onSelect:()=>{}}]}>{(openMenu,menuOpen)=><div className="flex"><div className={`${trackHeaderClass} h-[68px] !gap-0 !px-0`}><div className="flex h-full w-28 shrink-0 items-center justify-end gap-0.5 border-r border-[#2e2e2e] pr-2"><button type="button" aria-label={mainTrackMuted?'取消静音主视频轨道':'静音主视频轨道'} aria-pressed={!mainTrackMuted} title={mainTrackMuted?'取消静音':'静音轨道'} disabled={locked} onClick={()=>{setQuote(undefined);toggleMainTrackMute()}} className={trackIconButtonClass}>{mainTrackMuted?<VolumeX size={16} aria-hidden="true" />:<Volume2 size={16} aria-hidden="true" />}</button><button type="button" aria-label={mainTrackHidden?'显示主视频轨道':'隐藏主视频轨道'} aria-pressed={!mainTrackHidden} title={mainTrackHidden?'显示轨道':'隐藏轨道'} disabled={locked} onClick={toggleMainTrackVisibility} className={trackIconButtonClass}><VisibilityIcon hidden={mainTrackHidden} /></button><button type="button" aria-label="主视频轨道操作" aria-haspopup="menu" aria-expanded={menuOpen} disabled={locked} onClick={openMenu} className={trackIconButtonClass}><MoreHorizontal size={16} aria-hidden="true" /></button></div><div className="grid flex-1 place-items-center"><button type="button" aria-label="设置封面" title={cover?'已设置封面，点击修改':'设置封面'} disabled={locked || timelineDuration<=0} onClick={openCover} className={`relative grid size-10 place-items-center rounded-md border border-dashed text-xs font-medium hover:text-[#dedede] disabled:cursor-not-allowed disabled:opacity-50 ${cover?'border-[var(--mf-brand)] text-[var(--mf-brand)]':'border-white/20 text-[#7a7a7a]'}`}>封面</button></div></div>
      <div className="relative my-1 h-[60px] min-w-0 flex-1" data-main-video-track aria-label="视频时间线">{clips.map((c,i) => <div key={i} data-selected={selectedOnTimeline('main',i)} data-blade-kind="video" data-blade-index={i} data-effect-kind="video" data-effect-index={i} draggable={!locked&&!bladeMode} onDragStart={e => {e.stopPropagation();e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-flowx-video-clip-index', String(i));e.dataTransfer.setData('application/x-flowx-video-clip-offset',String(Math.max(0,(e.clientX-e.currentTarget.getBoundingClientRect().left)/pixelsPerSecond)))}} onDragOver={e => {if(e.dataTransfer.types.includes('application/x-flowx-video-clip-index'))e.preventDefault()}} onDrop={e => { const raw=e.dataTransfer.getData('application/x-flowx-video-clip-index');if(!/^\d+$/.test(raw))return;e.preventDefault();e.stopPropagation();const from=Number(raw); if(locked||!Number.isInteger(from)||from<0||from>=clips.length)return;if(from===i)return;const state=clipboardDraft(),order=state.clips.map((item,index)=>({item,index})),[moved]=order.splice(from,1);order.splice(i,0,moved);const remap=new Map(order.map((entry,index)=>[entry.index,index])),next={...state,clips:order.map(entry=>entry.item)},items=timelineSelection.map(ref=>ref.kind==='main'?{...ref,index:remap.get(ref.index)??ref.index}:ref);setQuote(undefined);applyTransaction(next,state);setSelectionState({items,draft:next});setSelected(remap.get(selected)??selected) }} className={`group/clip absolute inset-y-0 min-w-3 overflow-hidden rounded-[5.6px] border-2 bg-[#1a1a1a] ${selectedOnTimeline('main',i)?'border-[var(--mf-brand)]':'border-transparent hover:border-white/30'}`} style={{left:videoBoundaries[i]*pixelsPerSecond,width:displayDuration(c)*pixelsPerSecond}}>
       <TimelineFilmstrip strip={c.media_type==='image'?undefined:filmstrips[c.resource_uuid]} imageUrl={c.media_type==='image'?urls[c.resource_uuid]:undefined} start={c.start} duration={clipDuration(c)} rate={c.rate} pixelsPerSecond={pixelsPerSecond} height={56} />
       {(['start', 'end'] as const).map(side => <ClipTrimHandle key={side} clip={c} duration={c.media_type==='image'?600:durations[c.resource_uuid] ?? 0} side={side} disabled={locked} onCommit={value => {const state=clipboardDraft(),next={...state,clips:state.clips.map((item,index)=>index===i?{...item,[side]:value}:item)},items=selectedOnTimeline('main',i)&&timelineSelection.length>1?timelineSelection:[{kind:'main' as const,index:i}];setQuote(undefined);applyTransaction(next,state);setSelectionState({items,draft:next});setSelected(i);setActiveTrack({kind:'video',index:i})}} />)}
       <button className="absolute inset-0 flex size-full items-start p-1 text-left text-white" aria-pressed={selectedOnTimeline('main',i)} disabled={locked} onClick={event=>selectTimeline({kind:'main',index:i},event.metaKey||event.ctrlKey||event.shiftKey)}><span className="max-w-full truncate rounded bg-black/55 px-1.5 text-[11px] leading-4">片段 {i+1}<span className="text-white/60"> · {clipDuration(c).toFixed(2)} 秒 · {c.rate}×</span></span></button>
       <div className="absolute right-1 top-1 z-20 flex gap-0.5 rounded bg-black/60 px-0.5 text-[11px] leading-4 text-white opacity-0 focus-within:opacity-100 group-hover/clip:opacity-100 [&>button]:rounded [&>button]:px-1 [&>button:hover]:bg-white/15 [&>button:disabled]:opacity-40"><button aria-label={`片段${i+1}前移`} disabled={locked||i===0} onClick={()=>{setClips(p=>{const n=[...p];[n[i-1],n[i]]=[n[i],n[i-1]];return n});setSelected(i-1)}}>←</button><button aria-label={`删除片段${i+1}`} disabled={locked} onClick={()=>deleteItems([{kind:'main',index:i}])}>删除</button></div>
      </div>)}</div></div>}</TrackContextMenu>
      {audioOrder.map(track=>{const first=track.indices[0],muted=Boolean(audioLayers[first].track_muted);return <TrackContextMenu key={track.key} disabled={locked} actions={[{label:'粘贴元素',disabled:!timelineClipboard.items?.length,onSelect:()=>void pasteSelection()},{label:muted?'取消静音':'静音轨道',onSelect:()=>toggleAudioTrackMute(first)},...subtitleActions(ref=>ref.kind==='audio'&&track.indices.includes(ref.index)),{label:'删除轨道',destructive:true,onSelect:()=>deleteItems(track.indices.map(index=>({kind:'audio',index})),false)}]}>{(openMenu,menuOpen)=><div data-video-tool-track={track.key} className="flex" aria-label={`音频轨道${first+1}`}><div className={`${trackHeaderClass} h-12`}><Headphones size={14} aria-hidden="true" className="ml-1 shrink-0" /><span className="min-w-0 flex-1 truncate px-1">音频 {first+1}</span><button type="button" aria-label={`${muted?'取消静音':'静音'}音频${first+1}轨道`} aria-pressed={!muted} title={muted?'取消静音':'静音轨道'} disabled={locked} onClick={()=>toggleAudioTrackMute(first)} className={trackIconButtonClass}>{muted?<VolumeX size={16} aria-hidden="true" />:<Volume2 size={16} aria-hidden="true" />}</button><button type="button" aria-label={`音频${first+1}轨道操作`} aria-haspopup="menu" aria-expanded={menuOpen} disabled={locked} onClick={openMenu} className={trackIconButtonClass}><MoreHorizontal size={16} aria-hidden="true" /></button></div><div className="relative h-12 min-w-0 flex-1">{track.indices.map(index=>{const layer=audioLayers[index];return <TimelineLayer key={index} bladeKind="audio" bladeIndex={index} isSelected={selectedOnTimeline('audio',index)} selectedGroup={timelineSelection.length>1&&selectedOnTimeline('audio',index)} layer={layer} waveform={waveforms[layer.resource_uuid]} name={`音频${index+1}`} trackKey={track.key} pixelsPerSecond={pixelsPerSecond} fps={projectFPS} sourceDuration={audioDurations[layer.resource_uuid]} disabled={locked} snap={snap} targets={timelineTargets('audio',index)} onSelect={multi=>selectTimeline({kind:'audio',index},multi)} onCommit={(next,target,mode,above)=>{if(timelineSelection.length>1&&selectedOnTimeline('audio',index)){moveSelectedItem({kind:'audio',index},layer,next,target,track.key,mode,above);return}if(rippleEditing&&mode!=='move'&&(!target||target===track.key)){commitRippleTrim('audio',index,layer,next as AudioLayer);return}const siblings=track.indices.filter(i=>i!==index).map(i=>audioLayers[i]),safe=constrainTrackTrim(layer,next as AudioLayer,mode,siblings,audioDurations[layer.resource_uuid]);if(safe.start===layer.start&&safe.end===layer.end&&(!target||target===track.key))return;const id=newTrackId();setQuote(undefined);setAudioLayers(previous=>previous[index]!==layer?previous:moveAudioItem(previous,index,safe,id,target,positionFor(target,above,'audio'))??previous)}} />})}</div></div>}</TrackContextMenu>})}
      {bladeMode && bladePreview!==undefined && <div aria-hidden="true" className="pointer-events-none absolute bottom-0 top-[34px] z-30 w-px bg-white" style={{left:TRACK_HEADER+bladePreview*pixelsPerSecond}} />}
      {textPresetDrop!==undefined && <div aria-hidden="true" className="pointer-events-none absolute bottom-0 top-[34px] z-30 w-0.5 bg-white" style={{left:TRACK_HEADER+textPresetDrop*pixelsPerSecond}} />}
      <div aria-hidden="true" className="pointer-events-none absolute bottom-0 top-0 z-[25] w-0.5 -translate-x-1/2 bg-[#d9d9d9] before:absolute before:left-1/2 before:top-1 before:size-3 before:-translate-x-1/2 before:rounded-full before:border-2 before:border-white/50 before:bg-[#d9d9d9]" style={{left:TRACK_HEADER+playhead*pixelsPerSecond}} />
     </div>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#2e2e2e] px-3 py-1.5 text-[11px] text-[#7a7a7a] [&>p]:text-[11px] [&>p]:text-[#7a7a7a]">
    <SmartSubtitleBar state={smartSubtitles} disabled={ctx.readOnly} />
    {clipboardStatus && <p role="status" className="text-xs text-zinc-400">{clipboardStatus}</p>}
    {textPresets.status && <p role="status" className="text-xs text-zinc-400">{textPresets.status}</p>}
    <p className="text-xs text-zinc-400">总时长 {timelineDuration.toFixed(2)} 秒 · 最多 32 段 / 10 分钟 · 草稿自动保存到当前画布</p>
    </div>
    </section>
   </>}
   {operation === 'edit' && !draftKey && <p role="status" className="px-3 pb-2 text-xs text-[#7a7a7a]">身份尚未确认，草稿仅在当前编辑会话保留</p>}
   {operation === 'edit' && !exportOpen && error && <p role="alert" className="px-3 pb-2 text-xs text-red-300">{error}</p>}
   {operation === 'edit' && !exportOpen && job && <p role="status" className="px-3 pb-2 text-xs">{labels[job.state]}{job.error_code ? ` · ${job.error_code}` : ''}</p>}
   {coverOpen && <CoverSelector baseBlend={clip?.blend_mode} baseEffects={clip?.effects} effects={previewEffects} background={backgroundColor} mediaType={clip?.media_type} cover={cover} playhead={playhead} duration={timelineDuration} fps={projectFPS} currentUrl={currentUrl} sourceTime={time} transform={animatedTransform} aspect={previewAspect} tail={!clip||tailTime!==undefined} videos={videoLayers.map(visibleVideo)} images={imageLayers.map(visibleImage)} text={textLayers.map(visibleText)} urls={urls} library={ctx.library} source={ctx.api.source} project={ctx.project} onSeek={seekTimeline} onConfirm={value=>{setCover(value);closeCover()}} onCancel={closeCover} onError={setError} />}
   {operation === 'edit' ? <MediaModal open={exportOpen} title="导出设置" width="min(860px, calc(100vw - 32px))" className="[--mf-brand:#d4d4d4] [&_.ant-modal-body]:max-h-[calc(100vh-160px)] [&_.ant-modal-body]:overflow-y-auto" zIndex={1600} footer={null} onCancel={()=>setExportOpen(false)}>{exportContent}</MediaModal> : exportContent}
  </div>
 </MediaModal>
}
