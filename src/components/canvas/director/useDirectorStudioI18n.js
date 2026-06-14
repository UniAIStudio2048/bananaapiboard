import { useI18n } from '@/i18n'

export function useDirectorStudioI18n() {
  const { t } = useI18n()

  function dt(key, fallback = '', params = {}) {
    const fullKey = key.startsWith('directorStudio.') ? key : `directorStudio.${key}`
    const value = t(fullKey, params)
    return value === fullKey ? fallback : value
  }

  return { dt }
}
