import * as React from 'react'

import { useEffect, useRef, useState } from 'react'
import type { TextLayer } from './api'
import { backgroundValue, valueAt } from './text-keyframes'
import { colorValue } from './color-keyframes'

function TextLayerPreview({layer,time,shortSide}:{layer:TextLayer;time:number;shortSide:number}) {
 const ref=useRef<HTMLSpanElement>(null),[size,setSize]=useState({width:0,height:0})
 useEffect(()=>{const element=ref.current;if(!element)return;const measure=()=>{const width=element.offsetWidth,height=element.offsetHeight;setSize(previous=>previous.width===width&&previous.height===height?previous:{width,height})};measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect()},[])
 const unit=shortSide/720,px=backgroundValue(layer,'background_padding_x',time)*unit,py=backgroundValue(layer,'background_padding_y',time)*unit,ox=backgroundValue(layer,'background_offset_x',time)*unit,oy=backgroundValue(layer,'background_offset_y',time)*unit,radius=Math.min(size.width+px*2,size.height+py*2)*backgroundValue(layer,'background_radius',time)/200
 return <span ref={ref} className="isolate absolute max-w-none whitespace-pre text-left leading-tight" style={{
  // Position, font size and background geometry follow the measured preview.
  left:`${valueAt(layer.x,layer.keyframes?.x,time)*100}%`,top:`${valueAt(layer.y,layer.keyframes?.y,time)*100}%`,fontSize:`${shortSide*valueAt(layer.size,layer.keyframes?.size,time)/720}px`,transform:`translate(-50%, -50%) rotate(${valueAt(layer.rotation??0,layer.keyframes?.rotation,time)}deg) scale(${valueAt(layer.scale??1,layer.keyframes?.scale,time)})`,color:`#${colorValue(layer,'color',time)}`,opacity:valueAt(layer.opacity,layer.keyframes?.opacity,time),fontFamily:layer.font==='serif'?'"Noto Serif CJK SC", "Songti SC", serif':'"Noto Sans CJK SC", "PingFang SC", sans-serif',
 }}>{layer.background?.enabled&&<i aria-hidden="true" className="absolute -z-10" style={{left:ox-px,top:oy-py,width:`calc(100% + ${px*2}px)`,height:`calc(100% + ${py*2}px)`,borderRadius:radius,backgroundColor:`#${colorValue(layer,'background_color',time)}`}}/>}{layer.text}</span>
}
export function TextOverlay({ layers, time }: { layers: TextLayer[]; time: number }) {
 const ref=useRef<HTMLDivElement>(null),[shortSide,setShortSide]=useState(0)
 // Layout size ignores the editor's opening scale animation, which ResizeObserver never reports.
 useEffect(()=>{const element=ref.current;if(!element)return;const measure=()=>setShortSide(Math.min(element.offsetWidth,element.offsetHeight));measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect()},[])
 return <div ref={ref} className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg" aria-label="文字预览">{layers.map((layer,index)=>time>=layer.start&&time<layer.end?<TextLayerPreview key={index} layer={layer} time={time} shortSide={shortSide}/>:null)}</div>
}
