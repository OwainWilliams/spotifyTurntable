import { useEffect, useState } from 'react'

export type AttractPhase = 'off' | 'attract' | 'asleep'

/** Paused with nobody about for this long: start the light show. */
const ATTRACT_AFTER = 2 * 60_000
/** ...and after this much more of it, dim right down and let the screen sleep. */
const SLEEP_AFTER = 30 * 60_000

/**
 * Attract mode, as on an arcade cabinet or a jukebox in an empty bar: when
 * the music is stopped and nobody has touched anything for a while, the
 * machine puts on a show instead of sitting frozen (which is also kinder to
 * the screen than a static picture). After a long while it gives up and dims.
 *
 * The clock restarts on any mouse, key or touch, and when `enabled` turns
 * on (i.e. from the moment playback stops), not from the last activity
 * before that. .NET analogy: a pair of resettable System.Threading.Timers.
 */
export function useAttract(enabled: boolean): AttractPhase {
  const [phase, setPhase] = useState<AttractPhase>('off')

  useEffect(() => {
    setPhase('off')
    if (!enabled) return
    let timers: number[] = []
    const restart = () => {
      timers.forEach(clearTimeout)
      setPhase('off')
      timers = [
        window.setTimeout(() => setPhase('attract'), ATTRACT_AFTER),
        window.setTimeout(() => setPhase('asleep'), ATTRACT_AFTER + SLEEP_AFTER),
      ]
    }
    restart()
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart']
    events.forEach((e) => window.addEventListener(e, restart))
    return () => {
      timers.forEach(clearTimeout)
      events.forEach((e) => window.removeEventListener(e, restart))
    }
  }, [enabled])

  return phase
}
