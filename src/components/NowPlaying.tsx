import type { MouseEvent } from 'react'
import type { Track } from '../player/useSpotifyPlayer'
import { clock } from '../lib/clock'

interface Props {
  track: Track | null
  upNext: Track | null
  paused: boolean
  positionMs: number
  onSeek: (ms: number) => void
}

/**
 * The text side of the screen: what's playing, how far through, what's next.
 * Stays visible when idle (it's the point of a display); only the controls
 * fade out.
 */
export function NowPlaying({ track, upNext, paused, positionMs, onSeek }: Props) {
  if (!track) {
    return (
      <section className="now-playing empty">
        <p className="eyebrow">Turntable</p>
        <h1 className="title">Nothing on the deck</h1>
        <p className="artist">Open the crate and pick a record.</p>
      </section>
    )
  }

  const pos = Math.min(positionMs, track.durationMs)
  const pct = (pos / track.durationMs) * 100

  // Click anywhere on the bar to seek there. The tonearm does the same thing
  // with more ceremony.
  const seekTo = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onSeek(Math.round(((e.clientX - r.left) / r.width) * track.durationMs))
  }

  return (
    <section className="now-playing">
      <p className={`eyebrow ${paused ? 'paused' : ''}`}>
        <span className="dot" aria-hidden="true" />
        {paused ? 'Paused' : 'Now playing'}
      </p>
      {/* Announce track changes, but not the ticking clock below. */}
      <div aria-live="polite">
        <h1 className="title">{track.name}</h1>
        <p className="artist">{track.artists}</p>
        <p className="album">{track.album}</p>
      </div>

      <div className="progress">
        <div
          className="rail" onClick={seekTo}
          role="progressbar" aria-label="Track position"
          aria-valuemin={0} aria-valuemax={track.durationMs} aria-valuenow={pos}
        >
          <div className="fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="times">
          <span>{clock(pos)}</span>
          <span>−{clock(track.durationMs - pos)}</span>
        </div>
      </div>

      {upNext && (
        <p className="up-next">
          <span>Up next</span>
          {upNext.name} <span className="sep">·</span> {upNext.artists}
        </p>
      )}
    </section>
  )
}
