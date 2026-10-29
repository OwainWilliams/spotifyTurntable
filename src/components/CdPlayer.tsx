import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import type { Track } from '../player/useSpotifyPlayer'
import type { ContextTrack } from '../spotify/api'
import { clock } from '../lib/clock'
import { VuMeter } from './VuMeter'
import { CrateIcon, CycleIcon, ExpandIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, ShrinkIcon } from './icons'

/** Track numbers in the display's calendar, as on a real deck. */
export const CALENDAR = 20
/** Roughly how many characters fit across the display; longer text scrolls. */
const VFD_CHARS = 30

const TIME_MODE_KEY = 'turntable.cdTime'
const savedRemaining = () => {
  try { return localStorage.getItem(TIME_MODE_KEY) === 'remaining' } catch { return false }
}

/**
 * Which 20 track numbers the calendar shows: the block holding the playing
 * track (1-20, 21-40...), or the first block when nothing in the list is
 * playing. `over` lights when the disc has more tracks than are shown.
 */
export function calendarWindow(index: number, count: number) {
  const first = Math.floor(Math.max(index, 0) / CALENDAR) * CALENDAR
  const shown = Math.max(0, Math.min(CALENDAR, count - first))
  return { first, shown, over: count > first + CALENDAR }
}

interface Props {
  track: Track | null
  paused: boolean
  positionMs: number
  /** The disc's title, e.g. the playlist name. */
  heading: string
  /** The album or playlist (or queue) being played, as for the jukebox strips. */
  tracks: ContextTrack[]
  volume: number
  isFullscreen: boolean
  /** Name of the theme the theme key switches to. */
  nextTheme: string
  onPlayTrack: (uri: string) => void
  onToggle: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (ms: number) => void
  onVolume: (v: number) => void
  onCrate: () => void
  onFullscreen: () => void
  onTheme: () => void
}

/**
 * The CD theme: a 90s hi-fi CD deck. Brushed aluminium fascia, the disc
 * spinning behind a smoked window, and a vacuum fluorescent display with the
 * track number, time, a scrolling title, the track calendar and a level
 * meter. Drawn in cqw (.cd is the container) like the other two machines.
 *
 * The album art is the disc's printed face. As on the turntable, only the
 * disc rotates; the window's reflection stays still.
 */
export function CdPlayer(p: Props) {
  const { track, tracks } = p
  /** TIME key: count down what's left instead of up. Persisted like queue mode. */
  const [remaining, setRemaining] = useState(savedRemaining)

  useEffect(() => {
    try { localStorage.setItem(TIME_MODE_KEY, remaining ? 'remaining' : 'elapsed') } catch { /* not persisted; harmless */ }
  }, [remaining])

  const spinning = !!track && !p.paused
  const pos = track ? Math.min(p.positionMs, track.durationMs) : 0
  const index = track ? tracks.findIndex((t) => t.uri === track.uri) : -1
  const cal = calendarWindow(index, tracks.length)
  const time = track ? clock(remaining ? track.durationMs - pos : pos) : '-:--'

  const title = track ? `${track.name} — ${track.artists}` : 'NO DISC'
  const scrolls = title.length > VFD_CHARS

  const seekTo = (e: MouseEvent<HTMLDivElement>) => {
    if (!track) return
    const r = e.currentTarget.getBoundingClientRect()
    p.onSeek(Math.round(((e.clientX - r.left) / r.width) * track.durationMs))
  }

  return (
    <div className="cd-scene drift">
      <div className="cd">
        <div className="fascia">
          <header className="fascia-top">
            <span className="wordmark">Turntable <small>CD-1</small></span>
            <span className="fascia-legend">Compact Disc Player</span>
            <span className="power"><span className="power-led" aria-hidden="true" /> Power</span>
          </header>

          <div className="fascia-main">
            <div className="cd-window">
              <div className={`cd-disc ${spinning ? 'spinning' : ''}`}>
                <div
                  className={`cd-print ${track?.artUrl ? '' : 'blank'}`}
                  style={track?.artUrl ? { backgroundImage: `url(${track.artUrl})` } : undefined}
                />
                <div className="cd-clamp" />
              </div>
              <div className="cd-sheen" aria-hidden="true" />
            </div>

            <div className="fascia-right">
              <div className="vfd">
                <div className="vfd-row">
                  <span className="vfd-state" aria-label={!track ? 'Stopped' : p.paused ? 'Paused' : 'Playing'}>
                    {track && (p.paused ? <PauseIcon /> : <PlayIcon />)}
                  </span>
                  <span className="vfd-field">
                    <small>Track</small>
                    <b>{index >= 0 ? String(index + 1).padStart(2, '0') : '--'}</b>
                  </span>
                  <span className="vfd-field">
                    <small>{remaining ? <span className="lit">Remain</span> : 'Min · Sec'}</small>
                    <b>{remaining && track ? '-' : ''}{time}</b>
                  </span>
                  {track && <span className="vfd-disc" title={p.heading}>{p.heading}</span>}
                </div>

                {/* Announce track changes, but not the ticking clock above. */}
                <div className="vfd-text" aria-live="polite">
                  <h1 className="sr-only">{track ? `${track.name}, ${track.artists}` : 'No disc'}</h1>
                  <div
                    className={`vfd-scroll ${scrolls ? 'scrolls' : ''}`}
                    style={{ '--chars': title.length } as CSSProperties}
                    aria-hidden="true"
                  >
                    <span>{title}</span>
                    {scrolls && <span>{title}</span>}
                  </div>
                </div>

                {track && (
                  <div
                    className="vfd-progress" onClick={seekTo}
                    role="progressbar" aria-label="Track position"
                    aria-valuemin={0} aria-valuemax={track.durationMs} aria-valuenow={pos}
                  >
                    <div className="fill" style={{ width: `${(pos / track.durationMs) * 100}%` }} />
                  </div>
                )}

                <div className="vfd-bottom">
                  <div className="calendar" role="group" aria-label="Tracks">
                    {Array.from({ length: CALENDAR }, (_, k) => {
                      const i = cal.first + k
                      const t = k < cal.shown ? tracks[i] : null
                      // Like a real calendar: played numbers go out, the rest stay lit.
                      const state = !t ? 'off' : i === index ? 'now' : index >= 0 && i < index ? 'played' : 'lit'
                      return t ? (
                        <button
                          key={k}
                          className={`cal-num ${state}`}
                          onClick={() => p.onPlayTrack(t.uri)}
                          title={`${t.name} · ${t.artists}`}
                          aria-current={state === 'now' || undefined}
                        >
                          {i + 1}
                        </button>
                      ) : (
                        <span key={k} className="cal-num off" aria-hidden="true">{i + 1}</span>
                      )
                    })}
                    <span className={`cal-over ${cal.over ? 'lit' : ''}`} aria-hidden="true">Over</span>
                  </div>
                  <VuMeter
                    trackKey={track ? `${track.name}|${track.artists}` : null}
                    playing={spinning}
                    volume={p.volume}
                  />
                </div>
              </div>

              <div className="fascia-keys">
                <FasciaKey legend="Crate" title="Crate (C)" onClick={p.onCrate}><CrateIcon /></FasciaKey>
                <span className="key-gap" />
                <FasciaKey legend="Prev" label="Previous track" onClick={p.onPrevious} disabled={!track}><PrevIcon /></FasciaKey>
                <FasciaKey
                  legend="Play · Pause" label={p.paused ? 'Play' : 'Pause'} onClick={p.onToggle} disabled={!track}
                  wide lit={spinning}
                >
                  {p.paused ? <PlayIcon /> : <PauseIcon />}
                </FasciaKey>
                <FasciaKey legend="Next" label="Next track" onClick={p.onNext} disabled={!track}><NextIcon /></FasciaKey>
                <span className="key-gap" />
                <FasciaKey legend="Time" title="Elapsed or remaining time" onClick={() => setRemaining((r) => !r)} pressed={remaining}>
                  <span className="key-dot" aria-hidden="true" />
                </FasciaKey>
                <label className="fascia-level" title="Volume (↑ ↓)">
                  <input
                    type="range" min={0} max={1} step={0.01}
                    value={p.volume}
                    onChange={(e) => p.onVolume(Number(e.target.value))}
                    aria-label="Volume"
                  />
                  <span className="legend">Level</span>
                </label>
                <FasciaKey legend={p.nextTheme} title={`Switch to ${p.nextTheme} (T)`} onClick={p.onTheme}><CycleIcon /></FasciaKey>
                <FasciaKey
                  legend="Screen" label={p.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} title="Fullscreen (F)" onClick={p.onFullscreen}
                >
                  {p.isFullscreen ? <ShrinkIcon /> : <ExpandIcon />}
                </FasciaKey>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface KeyProps {
  /** Printed on the fascia under the button. */
  legend: string
  /** Accessible name, when the legend alone isn't one. */
  label?: string
  title?: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  wide?: boolean
  lit?: boolean
  children: ReactNode
}

/** A small aluminium push button with its legend printed below it. */
function FasciaKey({ legend, label, title, onClick, disabled, pressed, wide, lit, children }: KeyProps) {
  return (
    <span className="fascia-key">
      <button
        className={`alu-btn ${wide ? 'wide' : ''} ${lit ? 'lit' : ''}`}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={pressed}
        aria-label={label ?? legend}
        title={title}
      >
        {children}
      </button>
      <span className="legend" aria-hidden="true">{legend}</span>
    </span>
  )
}
