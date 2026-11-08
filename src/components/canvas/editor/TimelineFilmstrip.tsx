import * as React from 'react'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Filmstrip } from './useTimelineFilmstrips'

/** Positions use source time, so trims and speed changes select the correct frames. */
export function TimelineFilmstrip({strip,imageUrl,start,duration,rate,pixelsPerSecond,height}:{strip?:Filmstrip;imageUrl?:string;start:number;duration:number;rate:number;pixelsPerSecond:number;height:number}) {
 const ref=useRef<HTMLSpanElement>(null),[visible,setVisible]=useState({left:0,right:1200})
 const width=Math.max(0,duration*pixelsPerSecond),tile=strip?Math.max(16,height*strip.aspect):height
 useEffect(()=>{
  const element=ref.current,host=element?.closest('[aria-label="时间线"]');if(!element||!host||!strip)return
  const measure=()=>{const box=element.getBoundingClientRect(),view=host.getBoundingClientRect(),left=Math.max(0,view.left-box.left-tile),right=Math.min(width,view.right-box.left+tile);setVisible(previous=>Math.abs(previous.left-left)<1&&Math.abs(previous.right-right)<1?previous:{left,right})}
  measure();host.addEventListener('scroll',measure,{passive:true});const observer=new ResizeObserver(measure);observer.observe(element);observer.observe(host);window.addEventListener('resize',measure)
  return()=>{host.removeEventListener('scroll',measure);observer.disconnect();window.removeEventListener('resize',measure)}
 },[strip,width,tile])
 if(imageUrl)return <span aria-hidden="true" data-timeline-image className="pointer-events-none absolute inset-0 opacity-75" style={{backgroundImage:`url(${JSON.stringify(imageUrl)})`,backgroundRepeat:'repeat-x',backgroundSize:'auto 100%'}} />
 if(!strip||duration<=0||pixelsPerSecond<=0||rate<=0)return null
 const total=Math.ceil(width/tile),first=Math.max(0,Math.floor(visible.left/tile)),last=Math.min(total,Math.max(first,Math.ceil(visible.right/tile)))
 return <span ref={ref} aria-hidden="true" data-timeline-filmstrip className="pointer-events-none absolute inset-0 overflow-hidden opacity-75" style={{'--filmstrip-image':`url(${JSON.stringify(strip.image)})`} as CSSProperties}>{Array.from({length:last-first},(_,offset)=>{
  const index=first+offset,left=index*tile,partial=Math.min(tile,width-left),source=start+(left+partial/2)/pixelsPerSecond*rate,frame=Math.max(0,Math.min(strip.count-1,Math.round(source/strip.interval)))
  // Sprite positioning depends on measured track geometry and source time.
  return <span key={index} data-frame={frame} className="absolute inset-y-0 bg-[image:var(--filmstrip-image)]" style={{left,width:partial,backgroundSize:`${tile*strip.count}px ${height}px`,backgroundPosition:`-${tile*frame}px center`}} />
 })}</span>
}
