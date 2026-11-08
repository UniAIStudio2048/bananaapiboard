import type { EffectLayer, ImageLayer, TextLayer, VideoClip, VideoLayer, VideoTransform } from './api'

type Visibility={hidden?:boolean;track_hidden?:boolean;track_id?:string;track_muted?:boolean}
export const isHidden=(value:Visibility|undefined)=>value?.hidden===true||value?.track_hidden===true
export const validVisibility=(value:Visibility)=>[value.hidden,value.track_hidden,value.track_muted].every(field=>field===undefined||typeof field==='boolean')
const strip=<T extends Visibility>(item:T):T=>{const copy={...item};delete copy.hidden;delete copy.track_hidden;delete copy.track_id;delete copy.track_muted;return copy}
const transparent=(transform:VideoTransform|undefined):VideoTransform=>{const base=transform??{x:0,y:0,scale:1,rotation:0,opacity:1};return {...base,scale:1,opacity:0,...(base.keyframes?{keyframes:{...base.keyframes,scale:undefined,opacity:undefined}}:{})}}
/** Hidden editor-only state becomes transparent output; video audio remains intact. */
export function visibleClip(item:VideoClip):VideoClip {const rest=strip(item);return isHidden(item)?{...rest,transform:transparent(item.transform)}:rest}
export function visibleVideo(item:VideoLayer):VideoLayer {const rest=strip(item),sound=item.track_muted?{...rest,muted:true}:rest;return isHidden(item)?{...sound,transform:transparent(item.transform)}:sound}
export function visibleImage(item:ImageLayer):ImageLayer {const rest=strip(item);delete rest.is_sticker;return isHidden(item)?{...rest,scale:1,opacity:0,...(item.keyframes?{keyframes:{...item.keyframes,scale:undefined,opacity:undefined}}:{})}:rest}
export function visibleText(item:TextLayer):TextLayer {const rest=strip(item);return isHidden(item)?{...rest,rotation:0,opacity:0,...(item.keyframes?{keyframes:{...item.keyframes,rotation:undefined,opacity:undefined}}:{})}:rest}

/** Track grouping is editor-local; track mute is folded into the audio mix. */
export function visibleAudio(item:import('./api').AudioLayer):import('./api').AudioLayer {const copy={...item};delete copy.track_id;delete copy.track_order;delete copy.track_muted;return item.track_muted?{...copy,muted:true}:copy}

export function visibleEffect(item:EffectLayer):EffectLayer {const rest=strip(item);return isHidden(item)?{...rest,intensity:0}:rest}
