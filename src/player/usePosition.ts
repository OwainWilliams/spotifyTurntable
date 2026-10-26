/**
 * The SDK only reports position when state changes (play, pause, seek,
 * new track). Between events we extrapolate with a requestAnimationFrame
 * clock so the tonearm moves smoothly.
 *
 * .NET analogy: a Stopwatch started at the last known offset.
 */
import { useEffect, useState } from 'react'
import type { PlayerState } from './useSpotifyPlayer'

export function usePosition(state: PlayerState): number {
  const [position, setPosition] = useState(state.positionMs)

  useEffect(() => {
    if (state.paused) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an SDK event
      setPosition(state.positionMs)
      return
    }
    let frame = 0
    const tick = () => {
      const elapsed = Date.now() - state.reportedAt
      const max = state.track?.durationMs ?? Infinity
      setPosition(Math.min(state.positionMs + elapsed, max))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [state])

  return position
}
