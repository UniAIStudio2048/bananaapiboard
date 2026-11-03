import * as React from 'react'
/* eslint-disable @next/next/no-img-element -- Authorized library images are decoded directly for thumbnails. */
import { useEffect, useState } from 'react'
import { Film, Image as ImageIcon, Music } from 'lucide-react'
import type { SourceKind } from './SourcePicker'

function duration(seconds: number) {
 const whole = Math.max(0, Math.round(seconds))
 return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

export function SourceThumbnail({ kind, resource, resolve }: { kind: SourceKind; resource: string; resolve?(resource: string): Promise<string> }) {
 const [loaded, setLoaded] = useState<{ resource: string; url: string }>()
 const [length, setLength] = useState<number>()
 useEffect(() => {
  if (kind === 'audio' || !resolve) return
  let live = true
  resolve(resource).then(url => { if (live) setLoaded({ resource, url }) }).catch(() => {})
  return () => { live = false }
 }, [kind, resource, resolve])
 const url = loaded?.resource === resource ? loaded.url : undefined
 const Fallback = kind === 'audio' ? Music : kind === 'image' ? ImageIcon : Film
 return <>
  {url && kind === 'image' ? <img src={url} alt="" draggable={false} className="size-full object-cover" />
   : url && kind === 'video' ? <video src={`${url}#t=0.1`} muted playsInline preload="metadata" className="pointer-events-none size-full object-cover" onLoadedMetadata={event => { const value = event.currentTarget.duration; if (Number.isFinite(value)) setLength(value) }} />
   : <span className="grid size-full place-items-center text-[#7a7a7a]"><Fallback size={20} aria-hidden="true" /></span>}
  {url && length !== undefined && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[11.5px] leading-[14px] text-white">{duration(length)}</span>}
 </>
}
