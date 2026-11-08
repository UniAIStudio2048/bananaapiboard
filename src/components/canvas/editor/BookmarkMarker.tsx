import * as React from 'react'
import { useRef, useState } from 'react'
import { MediaPopover } from './ui'
import type { TimelineBookmark } from './bookmarks'
import { frameTime, snapTime } from './timeline-snap'

const field='w-full rounded border border-white/15 bg-zinc-900 px-2 py-1 text-xs text-zinc-100'
export function BookmarkMarker({bookmark,pixelsPerSecond,fps,timelineDuration,snap,targets,disabled,onSeek,onMove,onChange,onDelete}:{bookmark:TimelineBookmark;pixelsPerSecond:number;fps:number;timelineDuration:number;snap:boolean;targets:number[];disabled:boolean;onSeek(time:number):void;onMove(id:string,original:number,time:number):void;onChange(id:string,change:Partial<Pick<TimelineBookmark,'note'|'color'|'duration'>>):void;onDelete(id:string):void}) {
 const [open,setOpen]=useState(false),[preview,setPreview]=useState<number>()
 const drag=useRef<{x:number;y:number;time:number;next:number;moved:boolean} | undefined>(undefined),ignoreClick=useRef(false)
 const time=preview??bookmark.time
 function down(event:React.PointerEvent<HTMLButtonElement>) {
  if(disabled||event.button!==0)return;event.stopPropagation();drag.current={x:event.clientX,y:event.clientY,time:bookmark.time,next:bookmark.time,moved:false};event.currentTarget.setPointerCapture(event.pointerId)
 }
 function move(event:React.PointerEvent<HTMLButtonElement>) {
  const current=drag.current;if(!current)return;event.stopPropagation();const dx=event.clientX-current.x,dy=event.clientY-current.y
  if(!current.moved&&Math.hypot(dx,dy)<=3)return
  current.moved=true;const raw=Math.max(0,Math.min(timelineDuration,frameTime(current.time+dx/pixelsPerSecond,fps))),next=snap&&!event.shiftKey?snapTime(raw,targets,10/pixelsPerSecond):raw
  current.next=Math.max(0,Math.min(timelineDuration,next));setPreview(current.next)
 }
 function finish(event:React.PointerEvent<HTMLButtonElement>) {
  event.stopPropagation();const current=drag.current;drag.current=undefined;setPreview(undefined);if(!current||!current.moved)return
  ignoreClick.current=true;window.setTimeout(()=>{ignoreClick.current=false},0);onMove(bookmark.id,current.time,current.next)
 }
 const content=<div className="grid w-56 gap-3 rounded-lg border border-white/15 bg-zinc-900 p-3 text-xs text-zinc-100 shadow-xl" onPointerDown={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
  <label className="grid gap-1">备注<input aria-label="书签备注" className={field} maxLength={4096} value={bookmark.note??''} placeholder="添加备注…" onChange={event=>onChange(bookmark.id,{note:event.target.value})} /></label>
  <div className="grid gap-1"><label className="flex items-center gap-2">颜色<input aria-label="书签颜色" type="color" value={bookmark.color??'#a3a3a3'} onChange={event=>onChange(bookmark.id,{color:event.target.value})} className="h-7 w-14 cursor-pointer rounded border border-white/15 bg-zinc-900 !p-1" /></label>{bookmark.color && <button type="button" className="text-left text-[var(--mf-brand)]" onClick={()=>onChange(bookmark.id,{color:undefined})}>恢复默认颜色</button>}</div>
  <label className="grid gap-1">时长（秒）<input aria-label="书签时长" className={field} type="number" min="0" max={Math.max(0,timelineDuration-bookmark.time)} step="0.1" value={bookmark.duration??0} onChange={event=>{const value=Number(event.target.value);if(Number.isFinite(value))onChange(bookmark.id,{duration:Math.max(0,Math.min(Math.max(0,timelineDuration-bookmark.time),value))})}} /></label>
  <button type="button" className="rounded border border-red-400/40 px-2 py-1 text-left text-red-300 hover:bg-red-400/10" onClick={()=>{setOpen(false);onDelete(bookmark.id)}}>删除书签</button>
 </div>
 // Timeline geometry and a user-selected color are runtime values.
 return <MediaPopover open={open} trigger="click" placement="bottomLeft" onOpenChange={next=>{if(!next)setOpen(false)}} content={content}>
  <button type="button" aria-label={`书签 ${bookmark.time.toFixed(2)} 秒`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} title="单击跳转，双击编辑，拖动移动" className="absolute top-0 z-20 h-6 min-w-3 cursor-grab touch-none select-none border-0 bg-transparent p-0 active:cursor-grabbing disabled:opacity-50" style={{left:Math.max(0,time*pixelsPerSecond-6),width:Math.max(12,(bookmark.duration??0)*pixelsPerSecond+12)}} onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{drag.current=undefined;setPreview(undefined)}} onLostPointerCapture={()=>{drag.current=undefined;setPreview(undefined)}} onClick={event=>{event.stopPropagation();if(ignoreClick.current){event.preventDefault();ignoreClick.current=false;return}if(event.detail===2){event.preventDefault();setOpen(true)}else onSeek(bookmark.time)}} onContextMenu={event=>{event.preventDefault();event.stopPropagation();setOpen(true)}} onKeyDown={event=>{event.stopPropagation();if(event.key==='F2'){event.preventDefault();setOpen(true)}}}>
   <span aria-hidden="true" className="absolute left-1 top-1 h-3 w-3 rotate-45 rounded-sm bg-[var(--mf-bookmark-color)]" style={{'--mf-bookmark-color':bookmark.color??'var(--mf-brand)'} as React.CSSProperties} />
   {(bookmark.duration??0)>0 && <span aria-hidden="true" className="absolute bottom-1 left-3 right-1 h-1 bg-[var(--mf-bookmark-color)] opacity-40" style={{'--mf-bookmark-color':bookmark.color??'var(--mf-brand)'} as React.CSSProperties} />}
  </button>
 </MediaPopover>
}
