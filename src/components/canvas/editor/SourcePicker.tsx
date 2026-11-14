import { t as translateUi } from '../../../i18n/index.js'
import * as React from 'react'

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { CloudUpload, Plus } from 'lucide-react'
import { validateMediaUploadFile } from './media-upload'
import type { MediaProjectLibraryController } from '../media-project-library'
import type { AudioSource, VideoSource } from './context'
import { EditorPanelHeader } from './EditorPanel'
import { SourceThumbnail } from './SourceThumbnail'

export type SourceKind = 'video' | 'audio' | 'image'
type Scope = 'import' | 'canvas' | 'history' | 'assets'
type Filter = 'all' | SourceKind
type Source = { resource: string; name: string }
const emptySubscribe = () => () => {}
const emptySnapshot = () => undefined
const kindNames: Record<SourceKind, string> = { get video() { return translateUi('canvas.nodeConfig.videoInput.label') }, get audio() { return translateUi('canvas.nodeConfig.audioInput.label') }, get image() { return translateUi('canvas.nodeConfig.imageInput.label') } }
const filterOrder: readonly SourceKind[] = ['image', 'video', 'audio']
const pager = 'rounded px-2 py-1 text-[#dedede] hover:bg-white/10 disabled:opacity-40'
export function SourcePicker({ kinds, library, sources, disabled, extra, resolve, onAdd, onError, onDragStart, onDragEnd }: { kinds: readonly SourceKind[]; library?: MediaProjectLibraryController; sources: Readonly<Record<SourceKind, readonly (VideoSource | AudioSource)[]>>; disabled(kind: SourceKind): boolean; extra?: ReactNode; resolve?(resource: string): Promise<string>; onAdd(kind: SourceKind, id: string, name: string): Promise<void>; onError(message: string): void; onDragStart(event:React.DragEvent<HTMLButtonElement>,kind:SourceKind,id:string,name:string):void; onDragEnd():void }) {
 const scopes = [['import', translateUi('canvas.import')], ['canvas', translateUi('uiMessages.m2d6c34301c66')], ['history', translateUi('canvas.historyPanel.title')], ['assets', translateUi('canvas.assetPanel.title')]] as const
 const [scope, setScope] = useState<Scope>('canvas')
 const [filter, setFilter] = useState<Filter>('all')
 const snapshot = useSyncExternalStore(library?.subscribe ?? emptySubscribe, library?.getSnapshot ?? emptySnapshot, emptySnapshot)
 const [imported, setImported] = useState<(VideoSource & { kind: SourceKind })[]>([])
 const [uploading, setUploading] = useState(false)
 const [openedTask, setOpenedTask] = useState<string>()
 const active = filter === 'all' || !kinds.includes(filter) ? kinds : [filter]
 const shows = (kind: string): kind is SourceKind => (active as readonly string[]).includes(kind)
 const label = active.length === 1 ? kindNames[active[0]] : ''
 useEffect(() => {
  if (!library) return
  const type = active.length === 1 ? active[0] : 'all'
  setOpenedTask(undefined)
  void (async () => {
   if (scope === 'history') await library.loadHistoryPage(1, type)
   if (scope === 'assets') {
    if (library.getSnapshot().folderStatus === 'idle') await library.loadFolders('personal')
    if (library.getSnapshot().assets.filter !== type || library.getSnapshot().assets.status === 'idle') await library.loadAssetPage(1, type)
   }
  })().catch(() => onError(translateUi('uiMessages.m9036783488c2')))
 }, [scope, filter, kinds.join(','), library])
 async function upload(file?: File) {
  if (!file || !library) return
  let modality: SourceKind
  try { const validated=validateMediaUploadFile(file); if (validated.modality !== 'video' && validated.modality !== 'audio' && validated.modality !== 'image') throw new Error(); if(validated.modality==='image' && !/\.(png|jpe?g|webp|gif)$/i.test(validated.file_name)) throw new Error(); modality=validated.modality } catch { onError(translateUi('uiMessages.mbc1679d8a31c')); return }
  setUploading(true); setScope('import')
  try {
   const ok=await library.uploadAsset(file); const id=library.getSnapshot().upload.resource_uuid
   if (!ok || !id) throw new Error()
   setImported(previous => [...previous, {resource:id,name:file.name,kind:modality}])
   if (kinds.includes(modality) && !disabled(modality)) await onAdd(modality,id,file.name)
  } catch { onError(translateUi('uiMessages.m55d5711cd957')) } finally { setUploading(false) }
 }
 const run = (action: () => Promise<unknown>, message: string) => { void Promise.resolve().then(action).catch(() => onError(message)) }
 const tile = (kind: SourceKind, source: Source, index: number) => <button type="button" key={`${kind}:${source.resource}:${index}`} aria-label={translateUi('uiMessages.mf6ad543e4148', { value1: (source.name) })} disabled={disabled(kind) || uploading} draggable={!disabled(kind) && !uploading} onDragStart={event=>onDragStart(event,kind,source.resource,source.name)} onDragEnd={onDragEnd} onClick={() => run(() => onAdd(kind,source.resource,source.name), translateUi('uiMessages.m1b1bdf20414d'))} className="group grid min-w-0 content-start gap-1 text-left disabled:cursor-not-allowed disabled:opacity-50">
  <span className="relative block aspect-video overflow-hidden rounded-sm bg-[#1a1a1a] ring-[var(--mf-brand)] group-hover:ring-1 group-focus-visible:ring-1"><SourceThumbnail kind={kind} resource={source.resource} resolve={resolve} /><span aria-hidden="true" className="absolute right-1 top-1 grid size-5 place-items-center rounded-md bg-[#1a1a1a] text-[#d9d9d9] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"><Plus size={16} /></span></span>
  <span className="truncate text-[11.2px] text-[#7a7a7a]">{source.name}</span>
 </button>
 const grid = (items: ReactNode[], empty: string) => items.length ? <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">{items}</div> : empty ? <p className="py-6 text-center text-xs text-[#7a7a7a]">{empty}</p> : null
 const task = snapshot?.tasks.find(value => value.uuid === openedTask)
 const fileInput = <input aria-label={translateUi('uiMessages.m4f353793dac2')} type="file" accept="video/*,audio/*,image/png,image/jpeg,image/webp,image/gif,.mp4,.mov,.webm,.mp3,.wav,.ogg,.m4a,.png,.jpg,.jpeg,.webp,.gif" className="sr-only" disabled={uploading || kinds.every(disabled)} onChange={e => { const file=e.currentTarget.files?.[0]; e.currentTarget.value=''; void upload(file) }} />
 return <div className="flex min-h-0 min-w-0 flex-1">
  {library && <nav aria-label={translateUi('uiMessages.m9225f7f9c8a8')} className="grid w-[88px] shrink-0 content-start gap-1 border-r border-[#2e2e2e] bg-[#1e1e1e] p-1 py-1.5">{scopes.map(([value,name]) => <button type="button" key={value} aria-pressed={scope===value} className={`h-[34px] truncate rounded px-3 text-left text-xs ${scope===value?'bg-[#2a2a2a] font-medium text-white':'text-[#999] hover:text-white'}`} onClick={() => setScope(value)}>{name}</button>)}</nav>}
  <div className="flex min-w-0 flex-1 flex-col">
   <EditorPanelHeader title={translateUi('canvas.assetPanel.tagMaterial')}>{library && <label className="inline-flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[#2e2e2e] bg-[#1a1a1a] px-2.5 text-[12.64px] font-medium text-[#dedede] hover:bg-[#222] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"><CloudUpload size={16} aria-hidden="true" />{uploading?translateUi('uiMessages.mce1c9d61565f'):translateUi('canvas.import')}{fileInput}</label>}</EditorPanelHeader>
   <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto p-2">
    {extra}
    {kinds.length > 1 && <div role="group" aria-label={translateUi('uiMessages.m3be96f8eb83d')} className="flex flex-wrap gap-2">{(['all', ...filterOrder.filter(kind => kinds.includes(kind))] as const).map(value => <button type="button" key={value} aria-pressed={filter===value} className={`rounded px-3 py-1 text-[11.5px] ${filter===value?'bg-white/15 text-white':'text-[#7a7a7a] hover:bg-white/10 hover:text-white'}`} onClick={() => setFilter(value)}>{value === 'all' ? translateUi('canvas.categories.all') : kindNames[value]}</button>)}</div>}
    {scope==='import' && library && <>{grid(imported.filter(source=>shows(source.kind)).map((source,index)=>tile(source.kind,source,index)), '')}<p className="text-xs leading-5 text-[#7a7a7a]">{translateUi('uiMessages.m3b9d03d890c1', { value1: (uploading?translateUi('uiMessages.m6148b38691e3'):translateUi('uiMessages.me2150e132cf3')) })}</p></>}
    {scope==='canvas' && grid(active.flatMap(kind => sources[kind].map((source,index) => tile(kind,source,index))), translateUi('uiMessages.m3d9a59b15243', { value1: (label) }))}
    {scope==='assets' && library && <><div className="flex gap-2 text-xs">{(['personal','team'] as const).map(value=><button key={value} type="button" aria-pressed={snapshot?.folderScope===value} className={`rounded px-2 py-1 ${snapshot?.folderScope===value?'bg-white/15 text-white':'text-[#7a7a7a] hover:text-white'}`} onClick={()=>run(()=>library.loadFolders(value), translateUi('uiMessages.m9036783488c2'))}>{value==='personal'?translateUi('uiMessages.m15dec507959e'):translateUi('uiMessages.macdf17f4e9c4')}</button>)}</div><div className="flex flex-wrap gap-1">{snapshot?.folders?.map(folder=><button type="button" key={folder.uuid} aria-pressed={snapshot.activeFolderUuid===folder.uuid} className={`rounded px-2 py-1 text-xs ${snapshot.activeFolderUuid===folder.uuid?'bg-[#2a2a2a] text-white':'bg-white/5 text-[#999] hover:text-white'}`} onClick={()=>run(()=>library.openFolder(folder.uuid), translateUi('uiMessages.m9036783488c2'))}>{folder.name}</button>)}</div>{snapshot?.assets.status==='error' ? <button type="button" className="text-xs text-red-300" onClick={()=>run(()=>library.loadAssetPage(snapshot.assets.page), translateUi('uiMessages.m9036783488c2'))}>{translateUi('uiMessages.mcde10fa7efe6')}</button> : snapshot?.assets.status==='loading' ? <p className="text-xs text-[#7a7a7a]">{translateUi('uiMessages.m21bd738e0d71')}</p> : grid((snapshot?.assets.items ?? []).flatMap((source,index)=>shows(source.type)?[tile(source.type,{resource:source.uuid,name:source.name},index)]:[]), translateUi('uiMessages.m7a06cfd8440e', { value1: (label) }))}{snapshot && snapshot.assets.total > snapshot.assets.page_size && <div className="flex items-center justify-between text-xs text-[#7a7a7a]"><button type="button" className={pager} disabled={snapshot.assets.page<=1} onClick={()=>run(()=>library.loadAssetPage(snapshot.assets.page-1), translateUi('uiMessages.m9036783488c2'))}>{translateUi('uiMessages.mc9b9ae7a6144')}</button><span>{snapshot.assets.page}</span><button type="button" className={pager} disabled={snapshot.assets.page*snapshot.assets.page_size>=snapshot.assets.total} onClick={()=>run(()=>library.loadAssetPage(snapshot.assets.page+1), translateUi('uiMessages.m9036783488c2'))}>{translateUi('uiMessages.m8a8542f69648')}</button></div>}</>}
    {scope==='history' && library && <>{snapshot?.history.items.filter(row=>shows(row.modality) && row.status==='succeeded').map(row=><button type="button" key={row.task_uuid} aria-pressed={openedTask===row.task_uuid} className={`rounded px-2 py-1.5 text-left text-xs ${openedTask===row.task_uuid?'bg-[#2a2a2a] text-white':'bg-white/5 text-[#999] hover:text-white'}`} onClick={()=>{setOpenedTask(row.task_uuid);run(()=>library.loadHistoryTask(row.task_uuid), translateUi('uiMessages.m620ec5f17b12'))}}>{translateUi('uiMessages.md0a5557727aa', { value1: (new Date(row.created_at).toLocaleString()) })}</button>)}{task && !task.download_locked && grid(task.resources.flatMap((source,index)=>shows(source.type)?[tile(source.type,{resource:source.uuid,name:source.name},index)]:[]), translateUi('uiMessages.m7e2c02e42660', { value1: (label) }))}{snapshot && snapshot.history.total > snapshot.history.page_size && <div className="flex items-center justify-between text-xs text-[#7a7a7a]"><button type="button" className={pager} disabled={snapshot.history.page<=1} onClick={()=>{setOpenedTask(undefined);run(()=>library.loadHistoryPage(snapshot.history.page-1), translateUi('uiMessages.m620ec5f17b12'))}}>{translateUi('uiMessages.mc9b9ae7a6144')}</button><span>{snapshot.history.page}</span><button type="button" className={pager} disabled={snapshot.history.page*snapshot.history.page_size>=snapshot.history.total} onClick={()=>{setOpenedTask(undefined);run(()=>library.loadHistoryPage(snapshot.history.page+1), translateUi('uiMessages.m620ec5f17b12'))}}>{translateUi('uiMessages.m8a8542f69648')}</button></div>}{task?.download_locked && <p className="text-xs text-[#7a7a7a]">{translateUi('uiMessages.m748f8f1e0e19')}</p>}{snapshot?.history.status==='error' ? <button type="button" className="text-xs text-red-300" onClick={()=>run(()=>library.loadHistoryPage(snapshot.history.page), translateUi('uiMessages.m620ec5f17b12'))}>{translateUi('uiMessages.mae3d7cf7286c')}</button> : snapshot?.history.status==='loading' ? <p className="text-xs text-[#7a7a7a]">{translateUi('uiMessages.m21bd738e0d71')}</p> : !snapshot?.history.items.some(row=>shows(row.modality) && row.status==='succeeded') && <p className="py-6 text-center text-xs text-[#7a7a7a]">{translateUi('uiMessages.m5f406f9fcda7')}</p>}</>}
   </div>
  </div>
 </div>
}
