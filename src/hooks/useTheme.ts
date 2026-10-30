import { useEffect, useState } from 'react'

/** In the order T (and the theme button) cycles through them. */
const THEMES = ['turntable', 'jukebox', 'cd', 'cassette', 'winamp'] as const
export type Theme = (typeof THEMES)[number]

/** What the theme button calls each one. It names the theme it goes to. */
export const THEME_NAMES: Record<Theme, string> = {
  turntable: 'Turntable', jukebox: 'Jukebox', cd: 'CD', cassette: 'Cassette', winamp: 'Winamp',
}

const THEME_KEY = 'turntable.theme'

/** The theme after `t`, wrapping round to the first. */
export function nextTheme(t: Theme): Theme {
  return THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]
}

/** A stored value back to a theme; anything unknown (or nothing) is the turntable. */
export function parseTheme(value: string | null): Theme {
  return THEMES.find((t) => t === value) ?? 'turntable'
}

/** Last theme picked, so the screen comes back the same after a reboot. */
function savedTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY))
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

  const cycle = () => setTheme(nextTheme)
  return [theme, cycle] as const
}
