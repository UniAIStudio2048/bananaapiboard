export const blendModes = [
 ['normal','正常'], ['darken','变暗'], ['multiply','正片叠底'], ['color-burn','颜色加深'],
 ['lighten','变亮'], ['screen','滤色'], ['plus-lighter','线性减淡(添加)'], ['color-dodge','颜色减淡'],
 ['overlay','叠加'], ['soft-light','柔光'], ['hard-light','强光'], ['difference','差值'], ['exclusion','排除'],
 ['hue','色相'], ['saturation','饱和度'], ['color','颜色'], ['luminosity','明度'],
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
