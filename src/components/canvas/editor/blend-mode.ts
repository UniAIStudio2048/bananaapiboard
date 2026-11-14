import { t as translateUi } from '../../../i18n/index.js'
export const blendModes = [
 ['normal','uiMessages.m296de0e31f8c'], ['darken','uiMessages.m07ba6329553a'], ['multiply','uiMessages.m29b81751af64'], ['color-burn','uiMessages.mebb4b68533f6'],
 ['lighten','uiMessages.mfde6b8089807'], ['screen','uiMessages.me9fec455f1e4'], ['plus-lighter','uiMessages.mdb37ff3bcb74'], ['color-dodge','uiMessages.m06b59e81acb8'],
 ['overlay','uiMessages.m045d4bf17444'], ['soft-light','uiMessages.m2eb88a373a7f'], ['hard-light','uiMessages.mc2909f9ae1b3'], ['difference','uiMessages.m973e5d7657db'], ['exclusion','uiMessages.mac83d3972fe9'],
 ['hue','uiMessages.m3ff6d1c07cfc'], ['saturation','uiMessages.m762f17e26780'], ['color','directorStudio.inspector.color'], ['luminosity','uiMessages.mc5fce2a15bee'],
] as const
export type BlendMode = typeof blendModes[number][0]
const classes:Record<BlendMode,string> = {
 normal:'[mix-blend-mode:normal]',darken:'[mix-blend-mode:darken]',multiply:'[mix-blend-mode:multiply]',
 'color-burn':'[mix-blend-mode:color-burn]',lighten:'[mix-blend-mode:lighten]',screen:'[mix-blend-mode:screen]',
 'plus-lighter':'[mix-blend-mode:plus-lighter]','color-dodge':'[mix-blend-mode:color-dodge]',overlay:'[mix-blend-mode:overlay]',
 'soft-light':'[mix-blend-mode:soft-light]','hard-light':'[mix-blend-mode:hard-light]',difference:'[mix-blend-mode:difference]',
 exclusion:'[mix-blend-mode:exclusion]',hue:'[mix-blend-mode:hue]',saturation:'[mix-blend-mode:saturation]',
 color:'[mix-blend-mode:color]',luminosity:'[mix-blend-mode:luminosity]',
}
export function validBlendMode(value:unknown):value is BlendMode|undefined {return value===undefined || (typeof value==='string' && Object.hasOwn(classes,value))}
export function blendClass(value?:BlendMode):string {return classes[value??'normal'] ?? classes.normal}
export function canvasBlend(value?:BlendMode):GlobalCompositeOperation {return value==='plus-lighter'?'lighter':value==='normal'||!value?'source-over':value}
