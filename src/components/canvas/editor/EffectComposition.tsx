import * as React from 'react'

import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { EffectLayer, ImageLayer, TextLayer, VideoLayer } from './api'
import { orderedVisuals } from './visual-order'
import { VisualStack } from './VisualStack'
import { AttachedEffects } from './AttachedEffects'
import { blendClass, type BlendMode } from './blend-mode'
import { imageValue } from './image-keyframes'
import { valueAt } from './keyframe-values'
import type { VisualEffect } from './api'

/** Filters wrap only the layers below each effect in the shared visual order. */
export function EffectComposition({base,videos,images,text,effects,baseEffects,baseBlend,background='000000',baseTime=0,baseScale=1,urls,time,playing=false,onDuration}:{base:ReactNode;baseBlend?:BlendMode;background?:string;baseEffects?:VisualEffect[];baseTime?:number;baseScale?:number;videos:VideoLayer[];images:ImageLayer[];text:TextLayer[];effects:EffectLayer[];urls:Record<string,string>;time:number;playing?:boolean;onDuration?:(id:string,duration:number)=>void}) {
 const ref=useRef<HTMLDivElement>(null),prefix=`flowx-blur-${useId().replace(/[^a-zA-Z0-9_-]/g,'')}`
 const [size,setSize]=useState({width:0,height:0})
 useEffect(()=>{const element=ref.current;if(!element)return;const measure=()=>{const box=element.getBoundingClientRect();setSize(previous=>previous.width===box.width&&previous.height===box.height?previous:{width:box.width,height:box.height})};measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect()},[])
 let content:ReactNode=<div className={`absolute inset-0 ${blendClass(baseBlend)}`}><AttachedEffects effects={baseEffects} time={baseTime} scale={baseScale}>{base}</AttachedEffects></div>
 for(const item of orderedVisuals(videos,images,text,effects)) {
  if(item.kind==='effect') {
   const effect=effects[item.index],active=time>=effect.start && time<effect.end && effect.intensity>0
   content=<div key={`effect:${item.index}`} className="absolute inset-0" style={active?{filter:`url(#${prefix}-${item.index})`}:undefined}>{content}</div>
  } else {
   const stack=item.kind==='video'?<VisualStack videos={[videos[item.index]]} images={[]} text={[]} urls={urls} time={time} playing={playing} onDuration={onDuration}/>:item.kind==='image'?<VisualStack videos={[]} images={[images[item.index]]} text={[]} urls={urls} time={time}/>:<VisualStack videos={[]} images={[]} text={[text[item.index]]} urls={urls} time={time}/>
   const layer=item.kind==='video'?videos[item.index]:item.kind==='image'?images[item.index]:text[item.index],at=item.kind==='video'?(layer as VideoLayer).source_start+Math.max(0,time-layer.start)*(layer as VideoLayer).rate:time,scale=item.kind==='video'?valueAt((layer as VideoLayer).transform?.scale??1,(layer as VideoLayer).transform?.keyframes?.scale,at):item.kind==='image'?imageValue(layer as ImageLayer,'scale',time):1
   content=<Fragment key={`${item.kind}:${item.index}`}>{content}<div className={`absolute inset-0 ${blendClass(layer.blend_mode)}`}><AttachedEffects effects={layer.effects} time={at} scale={scale} text={item.kind==='text'?layer as TextLayer:undefined}>{stack}</AttachedEffects></div></Fragment>
  }
 }
 // The canvas color must be inside the isolated group so layers can blend against it.
 return <div ref={ref} className="absolute inset-0 isolate bg-[var(--mf-blend-background)]" style={{'--mf-blend-background':`#${background}`} as React.CSSProperties}><svg aria-hidden="true" width="0" height="0" className="absolute"><defs>{effects.map((effect,index)=><filter id={`${prefix}-${index}`} key={index} colorInterpolationFilters="sRGB"><feGaussianBlur stdDeviation={`${effect.intensity/5*size.width/1920} ${effect.intensity/5*size.height/1080}`} edgeMode="duplicate" /></filter>)}</defs></svg>{content}</div>
}
