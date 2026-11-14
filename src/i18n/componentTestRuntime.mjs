import { t, currentLanguage } from './index.js'

export function withI18n(app) {
  app.config.globalProperties.translateUi = t
  app.config.globalProperties.uiLanguage = currentLanguage
  return app
}
