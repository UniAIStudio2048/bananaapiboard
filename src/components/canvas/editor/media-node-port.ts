export type MediaNodeEditedAssetHandler = (request: any) => Promise<any>
export function mediaNodeActionSucceeded(value: any) { return value === true || value?.ok === true }
