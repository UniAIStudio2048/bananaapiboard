export function pickConfiguredSubmode(configuredMode, availableModes, fallback = 'text2video') {
  const modes = Array.isArray(availableModes) ? availableModes : []
  if (configuredMode && modes.some(mode => mode?.value === configuredMode)) {
    return configuredMode
  }
  return modes[0]?.value || fallback
}

export function pickInitialSubmode(savedMode, configuredMode, availableModes, fallback = 'text2video') {
  const modes = Array.isArray(availableModes) ? availableModes : []
  if (savedMode && modes.some(mode => mode?.value === savedMode)) {
    return savedMode
  }
  return pickConfiguredSubmode(configuredMode, modes, fallback)
}
