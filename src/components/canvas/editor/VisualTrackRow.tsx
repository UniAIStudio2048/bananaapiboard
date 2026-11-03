import * as React from 'react'
import type { DragEvent, ReactNode } from 'react'
import { GripVertical, MoreHorizontal } from 'lucide-react'
import type { VisualKind } from './visual-order'
import { VisibilityIcon } from './VisibilityIcon'

export const trackHeaderClass = 'sticky left-0 z-30 flex w-[180px] shrink-0 items-center gap-1 border-r border-[#2e2e2e] bg-[#262626] px-2 text-xs text-[#7a7a7a]'
export const trackIconButtonClass = 'grid size-6 shrink-0 place-items-center rounded hover:bg-white/10 hover:text-[#dedede] disabled:cursor-not-allowed disabled:opacity-50'

export function VisualTrackRow({kind,index,isSticker=false,disabled,dropTarget,trackHidden,trackKey,children,onToggleVisibility,onMenu,menuOpen,onSelect,onDragStart,onDragOver,onDragLeave,onDrop,onDragEnd}:{kind:VisualKind;index:number;isSticker?:boolean;disabled:boolean;dropTarget:boolean;trackHidden:boolean;trackKey:string;children:ReactNode;onToggleVisibility():void;onMenu():void;menuOpen:boolean;onSelect():void;onDragStart(event:DragEvent<HTMLButtonElement>):void;onDragOver(event:DragEvent<HTMLDivElement>):void;onDragLeave(event:DragEvent<HTMLDivElement>):void;onDrop(event:DragEvent<HTMLDivElement>):void;onDragEnd():void}) {
 const name=isSticker?'贴纸':kind==='video'?'叠加视频':kind==='image'?'图片':kind==='effect'?'特效':'文字'
 return <div data-video-tool-track={trackKey} aria-label={`${name}轨道${index+1}`} className={`flex ${dropTarget?'bg-[var(--mf-brand)]/10':''}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
  <div className={`${trackHeaderClass} h-12`}><button type="button" draggable={!disabled} disabled={disabled} aria-label={`拖动${name}${index+1}轨道`} title="拖动调整图层顺序" className="flex min-w-0 flex-1 cursor-grab items-center gap-1 rounded px-1 py-1 text-left hover:bg-white/10 hover:text-[#dedede] active:cursor-grabbing disabled:cursor-not-allowed" onClick={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd}><GripVertical size={14} aria-hidden="true" className="shrink-0" /><span className="truncate">{name} {index+1}</span></button><button type="button" aria-label={`${trackHidden?'显示':'隐藏'}${name}${index+1}轨道`} aria-pressed={!trackHidden} title={trackHidden?'显示轨道':'隐藏轨道'} disabled={disabled} onClick={onToggleVisibility} className={trackIconButtonClass}><VisibilityIcon hidden={trackHidden} /></button><button type="button" aria-label={`${name}${index+1}轨道操作`} aria-haspopup="menu" aria-expanded={menuOpen} disabled={disabled} onClick={onMenu} className={trackIconButtonClass}><MoreHorizontal size={16} aria-hidden="true" /></button></div>
  <div className="relative h-12 min-w-0 flex-1">{children}</div>
 </div>
}
