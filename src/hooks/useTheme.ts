import { useEffect, useState } from 'react'

export type Theme = 'turntable' | 'jukebox'

const THEME_KEY = 'turntable.theme'

/** Last theme picked, so the screen comes back the same after a reboot. */
function savedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === 'jukebox' ? 'jukebox' : 'turntable'
  } catch {
    return 'turntable' // storage blocked; just use the default
  }
}

/** Which machine is on screen. Persisted like volume. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(savedTheme)

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* not persisted; harmless */ }
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'jukebox' ? 'turntable' : 'jukebox'))
  return [theme, toggle] as const
}
