import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import type { Track } from '../player/useSpotifyPlayer'

interface Props {
  track: Track | null
  paused: boolean
  positionMs: number
  onToggle: () => void
  onSeek: (ms: number) => void
  /** Extra hardware mounted on the plinth (e.g. the VU meter). */
  children?: ReactNode
}

/**
 * Tonearm angles (degrees) where the stylus meets the outer groove and the
 * run-out just outside the label. These depend on the geometry in
 * styles.css (pivot, spindle and arm length, in cqw) and were solved for it;
 * change one and re-solve the other.
 */
const LEAD_IN = 27
const RUN_OUT = 47

/**
 * The deck, drawn as a top-down product shot. Sized in cqw (container query
 * units: 1cqw = 1% of the deck's width), so it scales as one piece whatever
 * size the layout gives it.
 *
 * Only the record (grooves + label) rotates. The light reflections sit on a
 * separate layer above it and stay still, as they would under a real lamp.
 * Rotation uses animation-play-state so it stops in place rather than snapping.
 *
 * Tonearm: rests at 0deg beside the platter, drops to LEAD_IN when a track
 * plays and sweeps to RUN_OUT by the end. Drag it to seek: while dragging
 * the arm follows the pointer; on release we seek to wherever it was dropped.
 */
export function Turntable({ track, paused, positionMs, onToggle, onSeek, children }: Props) {
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
        <div className="platter">
          <button
            className={`disc ${spinning ? 'spinning' : ''}`}
            onClick={onToggle}
            aria-label={paused ? 'Play' : 'Pause'}
          >
            <div className="grooves" />
            <div
              className={`label ${track?.artUrl ? '' : 'blank'}`}
              style={track?.artUrl ? { backgroundImage: `url(${track.artUrl})` } : undefined}
            />
          </button>
          <div className="sheen" aria-hidden="true" />
          <div className="spindle" aria-hidden="true" />
        </div>

        <div className="arm-rest" aria-hidden="true" />

        <div className="arm-base" ref={baseRef}>
          <div
            className={`arm ${track ? 'draggable' : ''} ${dragAngle !== null ? 'dragging' : ''}`}
            style={{ transform: `rotate(${armAngle}deg)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDragAngle(null)}
            title={track ? 'Drag to seek' : undefined}
          >
            <div className="counterweight" />
            <div className="arm-tube" />
            <div className="headshell">
              <div className="finger-lift" />
              <div className="cartridge" />
            </div>
            <div className="bearing" />
          </div>
        </div>

        <button
          className={`start-stop ${spinning ? 'on' : ''}`}
          onClick={onToggle}
          disabled={!track}
          aria-label={paused ? 'Start' : 'Stop'}
        >
          <span className="led" aria-hidden="true" />
          <span>Start · Stop</span>
        </button>

        {children}
      </div>
    </div>
  )
}
