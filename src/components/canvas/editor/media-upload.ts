import { t as translateUi } from '../../../i18n/index.js'
export function validateMediaUploadFile(file: File) {
 const modality = file.type.split('/')[0]
 const limit = modality === 'video' ? 500 : modality === 'audio' ? 100 : 20
 if (!['video','audio','image'].includes(modality) || !file.size || file.size > limit * 1024 * 1024) throw new Error(translateUi('uiMessages.mc9e9641c9ce9'))
 return { modality, file_name: file.name, content_type: file.type, file_size: file.size }
}
