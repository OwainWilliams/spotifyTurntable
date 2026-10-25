import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Track } from '../player/useSpotifyPlayer'

interface Props {
  track: Track | null
  paused: boolean
  positionMs: number
  onToggle: () => void
  onSeek: (ms: number) => void
}

/** Tonearm angles (degrees) for the start and end of a track. */
const LEAD_IN = 22
const RUN_OUT = 44

/**
 * The deck. Everything is sized in vmin so it scales to any screen.
 * The disc spins via a CSS animation; we only toggle animation-play-state,
 * so it slows to a stop in place rather than snapping.
 *
 * Tonearm angle: rests at 0 when nothing plays, drops to the lead-in groove
 * at LEAD_IN, and sweeps to RUN_OUT at the run-out as the track plays.
 *
 * Drag the arm to seek. While dragging, the arm follows the pointer instead
 * of the playback position; on release we seek to wherever it was dropped.
 */
export function Turntable({ track, paused, positionMs, onToggle, onSeek }: Props) {
  const baseRef = useRef<HTMLDivElement>(null)
  /** Angle while the user is dragging; null otherwise. */
  const [dragAngle, setDragAngle] = useState<number | null>(null)
  /**
   * Where the arm was dropped, held until the player reports the new position.
   * Without this the arm would swing back to the old position for a moment,
   * then swing forward again once the seek lands.
   */
  const [held, setHeld] = useState<{ angle: number; targetMs: number } | null>(null)

  const progress = track ? Math.min(positionMs / track.durationMs, 1) : 0
  const playAngle = track ? LEAD_IN + progress * (RUN_OUT - LEAD_IN) : 0
  const armAngle = dragAngle ?? held?.angle ?? playAngle
  const spinning = !!track && !paused

  // Let go of the held angle once the seek shows up in positionMs, or after a
  // few seconds if it never does (seek failed; App reports the error).
  useEffect(() => {
    if (!held) return
    if (Math.abs(positionMs - held.targetMs) < 1500) setHeld(null)
  }, [held, positionMs])
  useEffect(() => {
    if (!held) return
    const timer = setTimeout(() => setHeld(null), 3000)
    return () => clearTimeout(timer)
  }, [held])

  /**
   * Angle of the pointer around the arm's pivot, in the same terms as the CSS
   * rotate(): 0 = hanging straight down, positive = clockwise towards the disc.
   */
  const angleAt = (e: PointerEvent): number => {
    const r = baseRef.current!.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const deg = (Math.atan2(-dx, dy) * 180) / Math.PI
    return Math.min(Math.max(deg, LEAD_IN), RUN_OUT)
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!track) return
    // Capture keeps move/up events coming to the arm even when the pointer
    // leaves it. .NET analogy: Control.Capture in WinForms.
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragAngle(angleAt(e))
  }
  const onPointerMove = (e: PointerEvent) => {
    if (dragAngle !== null) setDragAngle(angleAt(e))
  }
  const onPointerUp = (e: PointerEvent) => {
    if (dragAngle === null || !track) return
    const angle = angleAt(e)
    const targetMs = Math.round(((angle - LEAD_IN) / (RUN_OUT - LEAD_IN)) * track.durationMs)
    setDragAngle(null)
    setHeld({ angle, targetMs })
    onSeek(targetMs)
  }

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

        <div className="arm-base" ref={baseRef}>
          <div
            className={`arm ${track ? 'draggable' : ''} ${dragAngle !== null ? 'dragging' : ''}`}
            style={{ transform: `rotate(${armAngle}deg)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDragAngle(null)}
          >
            <div className="headshell" />
          </div>
        </div>
      </div>
    </div>
  )
}
