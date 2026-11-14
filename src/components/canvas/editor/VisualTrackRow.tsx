import { t as translateUi } from '../../../i18n/index.js'
import * as React from 'react'
import type { DragEvent, ReactNode } from 'react'
import { GripVertical, MoreHorizontal } from 'lucide-react'
import type { VisualKind } from './visual-order'
import { VisibilityIcon } from './VisibilityIcon'

export const trackHeaderClass = 'sticky left-0 z-30 flex w-[180px] shrink-0 items-center gap-1 border-r border-[#2e2e2e] bg-[#262626] px-2 text-xs text-[#7a7a7a]'
export const trackIconButtonClass = 'grid size-6 shrink-0 place-items-center rounded hover:bg-white/10 hover:text-[#dedede] disabled:cursor-not-allowed disabled:opacity-50'

export function VisualTrackRow({kind,index,isSticker=false,disabled,dropTarget,trackHidden,trackKey,children,onToggleVisibility,onMenu,menuOpen,onSelect,onDragStart,onDragOver,onDragLeave,onDrop,onDragEnd}:{kind:VisualKind;index:number;isSticker?:boolean;disabled:boolean;dropTarget:boolean;trackHidden:boolean;trackKey:string;children:ReactNode;onToggleVisibility():void;onMenu():void;menuOpen:boolean;onSelect():void;onDragStart(event:DragEvent<HTMLButtonElement>):void;onDragOver(event:DragEvent<HTMLDivElement>):void;onDragLeave(event:DragEvent<HTMLDivElement>):void;onDrop(event:DragEvent<HTMLDivElement>):void;onDragEnd():void}) {
 const name=isSticker?translateUi('uiMessages.m4152c4a07970'):kind==='video'?translateUi('uiMessages.m4869ac668dae'):kind==='image'?translateUi('canvas.nodeConfig.imageInput.label'):kind==='effect'?translateUi('uiMessages.m8829dbcbcfce'):translateUi('uiMessages.m14b69bd6eeb0')
 return <div data-video-tool-track={trackKey} aria-label={translateUi('uiMessages.m85b3d2dc2ea3', { value1: (name), value2: (index+1) })} className={`flex ${dropTarget?'bg-[var(--mf-brand)]/10':''}`} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
  <div className={`${trackHeaderClass} h-12`}><button type="button" draggable={!disabled} disabled={disabled} aria-label={translateUi('uiMessages.m0e0cee5aa22f', { value1: (name), value2: (index+1) })} title={translateUi('uiMessages.m8b7165351f53')} className="flex min-w-0 flex-1 cursor-grab items-center gap-1 rounded px-1 py-1 text-left hover:bg-white/10 hover:text-[#dedede] active:cursor-grabbing disabled:cursor-not-allowed" onClick={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd}><GripVertical size={14} aria-hidden="true" className="shrink-0" /><span className="truncate">{name} {index+1}</span></button><button type="button" aria-label={translateUi('uiMessages.m0db68beff736', { value1: (trackHidden?translateUi('directorStudio.inspector.visible'):translateUi('onboarding.settings.edgeStyleHidden')), value2: (name), value3: (index+1) })} aria-pressed={!trackHidden} title={trackHidden?translateUi('uiMessages.md20fce7833f8'):translateUi('uiMessages.mef686cc65786')} disabled={disabled} onClick={onToggleVisibility} className={trackIconButtonClass}><VisibilityIcon hidden={trackHidden} /></button><button type="button" aria-label={translateUi('uiMessages.m3f6dc4a7b325', { value1: (name), value2: (index+1) })} aria-haspopup="menu" aria-expanded={menuOpen} disabled={disabled} onClick={onMenu} className={trackIconButtonClass}><MoreHorizontal size={16} aria-hidden="true" /></button></div>
  <div className="relative h-12 min-w-0 flex-1">{children}</div>
 </div>
}
