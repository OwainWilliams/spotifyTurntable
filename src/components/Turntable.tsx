import type { Track } from '../player/useSpotifyPlayer'

interface Props {
  track: Track | null
  paused: boolean
  positionMs: number
  onToggle: () => void
}

/**
 * The deck. Everything is sized in vmin so it scales to any screen.
 * The disc spins via a CSS animation; we only toggle animation-play-state,
 * so it slows to a stop in place rather than snapping.
 *
 * Tonearm angle: rests at 0 when nothing plays, drops to the lead-in groove
 * at ~22deg, and sweeps to ~44deg at the run-out as the track plays.
 */
export function Turntable({ track, paused, positionMs, onToggle }: Props) {
  const progress = track ? Math.min(positionMs / track.durationMs, 1) : 0
  const armAngle = track ? 22 + progress * 22 : 0
  const spinning = !!track && !paused

  return (
    <div className="deck">
      <div className="plinth">
        <div className="slipmat">
          <button
            className={`disc ${spinning ? 'spinning' : ''}`}
            onClick={onToggle}
            aria-label={paused ? 'Play' : 'Pause'}
          >
            <div className="grooves" />
            <div
              className="label"
              style={track?.artUrl ? { backgroundImage: `url(${track.artUrl})` } : undefined}
            />
            <div className="spindle" />
          </button>
        </div>

        <div className="arm-base">
          <div className="arm" style={{ transform: `rotate(${armAngle}deg)` }}>
            <div className="headshell" />
          </div>
        </div>
      </div>
    </div>
  )
}
