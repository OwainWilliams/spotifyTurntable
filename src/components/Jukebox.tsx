import { useEffect, useLayoutEffect, useRef, useState, type AnimationEvent, type CSSProperties, type MouseEvent } from 'react'
import type { Track } from '../player/useSpotifyPlayer'
import type { ContextTrack } from '../spotify/api'
import type { AttractPhase } from '../hooks/useAttract'
import { clock } from '../lib/clock'
import { CrateIcon, CycleIcon, ExpandIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, ShrinkIcon, VolumeIcon } from './icons'

/** Selection letters skip I and O, as real jukeboxes did: they read as 1 and 0. */
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const ROWS = 6
const COLS = 3
export const PER_PAGE = ROWS * COLS
/** How long each page shows while attract mode leafs through them. */
const ATTRACT_PAGE_MS = 10_000

const QUEUE_MODE_KEY = 'turntable.queueMode'
const savedQueueMode = () => {
  try { return localStorage.getItem(QUEUE_MODE_KEY) === 'true' } catch { return false }
}

/**
 * Strip i's selection code. Strips fill each column top to bottom, and every
 * column across all pages has its own letter: page 1 is A-C, page 2 D-F.
 */
export function codeFor(i: number): string {
  const page = Math.floor(i / PER_PAGE)
  const within = i % PER_PAGE
  return LETTERS[page * COLS + Math.floor(within / ROWS)] + (within % ROWS + 1)
}

interface Props {
  track: Track | null
  paused: boolean
  positionMs: number
  /** Marquee text, e.g. the playlist name. */
  heading: string
  strips: ContextTrack[]
  /** Already clamped to the pages that exist. */
  page: number
  volume: number
  isFullscreen: boolean
  /** Lights colour, picked from the album art. */
  neon: string
  attract: AttractPhase
  onPage: (page: number) => void
  onPlayTrack: (uri: string) => void
  /** Adds to Spotify's queue; resolves false if that failed (already reported). */
  onQueueTrack: (uri: string) => Promise<boolean>
  /** Empties Spotify's queue; resolves false if that failed (already reported). */
  onClearQueue: () => Promise<boolean>
  onToggle: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (ms: number) => void
  onVolume: (v: number) => void
  onCrate: () => void
  onFullscreen: () => void
  /** Name of the theme the theme key switches to. */
  nextTheme: string
  onTheme: () => void
}

/**
 * The jukebox theme: a title-strip wall-box filling the screen. Drawn in cqw
 * like the turntable (.jukebox is the container, 16:9), so it scales as one
 * piece.
 *
 * The strips are the current album or playlist (or the queue, when Spotify
 * won't list it), 18 to a page. Click a strip, or press a letter then a
 * number on the keypad, to select it. A selection plays now, or, with the
 * Queue key lit, joins the queue the way a coin in a real jukebox would.
 */
export function Jukebox(p: Props) {
  const { track, strips, page } = p
  const pages = Math.max(1, Math.ceil(strips.length / PER_PAGE))
  /** Letter pressed on the keypad, waiting for its number. */
  // The letter half of a code, remembered with its page: a half-entered code
  // means nothing on another page, so it lapses when the page changes.
  const [pendingAt, setPendingAt] = useState<{ letter: string; page: number } | null>(null)
  const pending = pendingAt?.page === page ? pendingAt.letter : null
  const setPending = (letter: string | null) => setPendingAt(letter ? { letter, page } : null)
  /** Selections add to the queue instead of playing now. */
  const [queueMode, setQueueMode] = useState(savedQueueMode)
  /** Tracks this screen has queued, in order, until each starts playing. */
  const [queued, setQueued] = useState<string[]>([])

  useEffect(() => {
    try { localStorage.setItem(QUEUE_MODE_KEY, String(queueMode)) } catch { /* not persisted; harmless */ }
  }, [queueMode])

  // A queued track that starts playing has been served; drop its badge.
  // (Spotify's API can't list or remove queue entries, so this is our own
  // record of what we added, not Spotify's.)
  const trackUri = track?.uri
  useEffect(() => {
    if (!trackUri) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to Spotify moving on to a new track
    setQueued((q) => {
      const at = q.indexOf(trackUri)
      return at < 0 ? q : [...q.slice(0, at), ...q.slice(at + 1)]
    })
  }, [trackUri])

  const playingIndex = track ? strips.findIndex((s) => s.uri === track.uri) : -1

  // Turn to the playing track's page when the track changes, as the
  // carriage on a real machine would. Paging away by hand is left alone
  // until the next track.
  useEffect(() => {
    if (playingIndex >= 0) p.onPage(Math.floor(playingIndex / PER_PAGE))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingIndex])

  // Attract mode leafs through the pages on its own.
  useEffect(() => {
    if (p.attract !== 'attract' || pages < 2) return
    const timer = setTimeout(() => p.onPage((page + 1) % pages), ATTRACT_PAGE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.attract, pages, page])

  const select = async (uri: string) => {
    if (!queueMode) return p.onPlayTrack(uri)
    if (await p.onQueueTrack(uri)) setQueued((q) => [...q, uri])
  }

  const first = page * PER_PAGE
  const slots = Array.from({ length: PER_PAGE }, (_, k) => strips[first + k] ?? null)
  const letters = LETTERS.slice(page * COLS, page * COLS + COLS).split('')

  const pressNumber = (n: number) => {
    if (!pending) return
    const strip = strips[first + letters.indexOf(pending) * ROWS + n - 1]
    setPending(null)
    if (strip) void select(strip.uri)
  }

  return (
    <div className="jukebox-scene drift">
      <div className={`jukebox ${p.attract === 'off' ? '' : p.attract}`} style={{ '--neon': p.neon } as CSSProperties}>
        <div className="cabinet">
          <header className="marquee">
            <small>{p.heading}</small>
            <span className="neon-sign" aria-hidden="true">JUKEBOX</span>
            <small>Page {page + 1} of {pages}</small>
          </header>

          <div className="jukebox-main">
            <Dome
              track={track}
              paused={p.paused}
              positionMs={p.positionMs}
              code={playingIndex >= 0 ? codeFor(playingIndex) : null}
              onSeek={p.onSeek}
            />

            <div className="strips" aria-label="Title strips">
              {slots.map((s, k) => {
                const i = first + k
                const playing = i === playingIndex
                const queuedAt = s ? queued.indexOf(s.uri) : -1
                // --i staggers the attract-mode chase light down the columns.
                const order = { '--i': k } as CSSProperties
                return s ? (
                  <button
                    key={k}
                    className={`strip ${playing ? 'playing' : ''}`}
                    style={order}
                    onClick={() => void select(s.uri)}
                    aria-label={`${codeFor(i)}: ${s.name} by ${s.artists}${queuedAt >= 0 ? `, queued ${queuedAt + 1}` : ''}`}
                    aria-current={playing || undefined}
                  >
                    <span className="code">{codeFor(i)}</span>
                    {queuedAt >= 0 && <span className="queued-badge" aria-hidden="true">{queuedAt + 1}</span>}
                    <span className="text">
                      <strong><span>{s.name}</span></strong>
                      <span className={`band band-${i % 4}`}>{s.artists}</span>
                    </span>
                  </button>
                ) : (
                  // Blank cards keep the grid full on a short last page.
                  <span key={k} className="strip empty" style={order} aria-hidden="true">
                    <span className="code">{codeFor(i)}</span>
                  </span>
                )
              })}
            </div>
          </div>

          <div className="jukebox-bar">
            <div className="bar-group" role="group" aria-label="Select a record">
              <button className="key" onClick={() => p.onPage(page - 1)} disabled={page === 0} aria-label="Previous page" title="Previous page (Page Up)">
                <PrevIcon />
              </button>
              {letters.map((l) => (
                <button key={l} className="key" aria-pressed={pending === l} onClick={() => setPending(pending === l ? null : l)}>
                  {l}
                </button>
              ))}
              <span className="bar-divider" />
              {Array.from({ length: ROWS }, (_, k) => (
                <button key={k} className="key" disabled={!pending} onClick={() => pressNumber(k + 1)}>
                  {k + 1}
                </button>
              ))}
              <button className="key" onClick={() => p.onPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page" title="Next page (Page Down)">
                <NextIcon />
              </button>
            </div>

            <div className="bar-group">
              <button className="piano" onClick={p.onPrevious} disabled={!track} aria-label="Previous track"><PrevIcon /></button>
              <button className={`piano wide ${track && !p.paused ? 'lit' : ''}`} onClick={p.onToggle} disabled={!track} aria-label={p.paused ? 'Play' : 'Pause'}>
                {p.paused ? <PlayIcon /> : <PauseIcon />}
              </button>
              <button className="piano" onClick={p.onNext} disabled={!track} aria-label="Next track"><NextIcon /></button>
            </div>

            <div className="bar-group">
              <button
                className={`pill-key mode ${queueMode ? 'on' : ''}`}
                onClick={() => setQueueMode((m) => !m)}
                aria-pressed={queueMode}
                title="Selections join the queue instead of playing now"
              >
                <span className="led" aria-hidden="true" /> Queue
              </button>
              <button
                className="pill-key"
                onClick={async () => { if (await p.onClearQueue()) setQueued([]) }}
                disabled={!track}
                title="Empty Spotify's queue (the current track keeps playing)"
              >
                Clear
              </button>
              <label className="bar-label" title="Volume (↑ ↓)">
                <VolumeIcon />
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={p.volume}
                  onChange={(e) => p.onVolume(Number(e.target.value))}
                  aria-label="Volume"
                />
              </label>
              <button className="pill-key" onClick={p.onCrate} title="Crate (C)"><CrateIcon /> Crate</button>
              <button className="pill-key" onClick={p.onTheme} title={`Switch to ${p.nextTheme} (T)`}><CycleIcon /> {p.nextTheme}</button>
              <button className="key" onClick={p.onFullscreen} aria-label={p.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} title="Fullscreen (F)">
                {p.isFullscreen ? <ShrinkIcon /> : <ExpandIcon />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface DomeProps {
  track: Track | null
  paused: boolean
  positionMs: number
  code: string | null
  onSeek: (ms: number) => void
}

/** The record put away while the next one comes in. */
interface Swap {
  key: number
  artUrl: string | null
}

/**
 * The 45 under glass, and the now-playing card below it. As on the
 * turntable, only the record rotates (the reflection stays still), and it
 * pauses in place via animation-play-state.
 *
 * Changing track plays the changer: the old record lifts up out of the dome,
 * then the new one comes down onto the spindle and only starts turning once
 * it has landed. Both are plain CSS animations; React just mounts the
 * outgoing record for the duration and clears it on animationend.
 */
function Dome({ track, paused, positionMs, code, onSeek }: DomeProps) {
  const [swap, setSwap] = useState<Swap | null>(null)
  const previous = useRef<Track | null>(track)

  // Layout effect, not a plain effect: it runs before the browser paints, so
  // the new record never shows for a frame at rest before its drop begins.
  // .NET analogy: handling it in the same dispatcher tick, before render.
  useLayoutEffect(() => {
    const before = previous.current
    previous.current = track
    // Not on the first record, and not when the user prefers less motion
    // (CSS turns the animations off then, so animationend would never come).
    if (!before || !track || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setSwap({ key: Date.now(), artUrl: before.artUrl })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.uri])

  // The incoming record's drop is the last animation, so it ends the swap.
  // Ignore events bubbling up from the spin inside it.
  const landed = (e: AnimationEvent) => {
    if (e.target === e.currentTarget) setSwap(null)
  }

  const spinning = !!track && !paused
  const pos = track ? Math.min(positionMs, track.durationMs) : 0

  const seekTo = (e: MouseEvent<HTMLDivElement>) => {
    if (!track) return
    const r = e.currentTarget.getBoundingClientRect()
    onSeek(Math.round(((e.clientX - r.left) / r.width) * track.durationMs))
  }

  return (
    <section className="dome">
      <div className="dome-record">
        {swap && <Single key={swap.key} className="leaving" artUrl={swap.artUrl} spinning={false} />}
        {/* Keyed by track so each new record mounts fresh and its drop replays. */}
        <Single
          key={track?.uri ?? 'none'}
          className={swap ? 'arriving' : ''}
          artUrl={track?.artUrl ?? null}
          spinning={spinning}
          onAnimationEnd={landed}
        />
      </div>

      <div className="readout">
        <div className="readout-head">
          <span>{!track ? 'Select a record' : `${paused ? 'Paused' : 'Now playing'}${code ? ` · ${code}` : ''}`}</span>
          {track && <span>{clock(pos)} / {clock(track.durationMs)}</span>}
        </div>
        {/* Announce track changes, but not the ticking clock above. */}
        <div aria-live="polite">
          <h1>{track?.name ?? 'Nothing playing'}</h1>
          <p>{track?.artists ?? 'Open the crate and pick a record.'}</p>
        </div>
        {track && (
          <div
            className="rail-45" onClick={seekTo}
            role="progressbar" aria-label="Track position"
            aria-valuemin={0} aria-valuemax={track.durationMs} aria-valuenow={pos}
          >
            <div className="fill" style={{ width: `${(pos / track.durationMs) * 100}%` }} />
          </div>
        )}
      </div>
    </section>
  )
}

interface SingleProps {
  className: string
  artUrl: string | null
  spinning: boolean
  onAnimationEnd?: (e: AnimationEvent) => void
}

/** One 45: the spinning record and its fixed reflection. */
function Single({ className, artUrl, spinning, onAnimationEnd }: SingleProps) {
  return (
    <div className={`single-wrap ${className}`} onAnimationEnd={onAnimationEnd}>
      <div className={`single ${spinning ? 'spinning' : ''}`}>
        <div
          className={`single-label ${artUrl ? '' : 'blank'}`}
          style={artUrl ? { backgroundImage: `url(${artUrl})` } : undefined}
        />
      </div>
      <div className="single-sheen" aria-hidden="true" />
    </div>
  )
}
