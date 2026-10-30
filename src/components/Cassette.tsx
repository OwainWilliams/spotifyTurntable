import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { Track } from '../player/useSpotifyPlayer'
import type { ContextTrack } from '../spotify/api'
import { locate, odometer } from '../lib/tape'
import { VuMeter } from './VuMeter'
import { FasciaKey } from './CdPlayer'
import { CycleIcon, ExpandIcon, PauseIcon, PlayIcon, ShrinkIcon } from './icons'

// Winding speed, in tape time per real second. Like a real motor it spins up
// over about a second, so a tap nudges a few seconds and a hold covers a
// four-minute song in about ten.
const WIND_MAX = 30
const WIND_ACCEL = 25
/** Tape time per counter step: a 45-minute side reads about 675. */
const COUNTER_MS = 4000

// The cassette in its own units: 100 wide, 63.5 high, as a real one in mm.
const HUB_L = 28.8
const HUB_R = 71.2
const HUB_Y = 29
const HUB = 6.4      // pack radius with no tape on it
const FULL = 17      // pack radius holding the whole tape

/** Radius of a pack holding `share` (0-1) of the tape. Tape is area, so it's the square roots that add. */
const packRadius = (share: number) => Math.sqrt(HUB * HUB + share * (FULL * FULL - HUB * HUB))

interface Props {
  track: Track | null
  paused: boolean
  positionMs: number
  /** The album or playlist, printed on the label. */
  heading: string
  /** The album or playlist (or queue): the tape, laid end to end. */
  tracks: ContextTrack[]
  volume: number
  isFullscreen: boolean
  /** Name of the theme the theme key switches to. */
  nextTheme: string
  onToggle: () => void
  onPause: () => void
  /** Winding stopped here: play `uri` from `positionMs`, carrying on only if `play`. */
  onCue: (uri: string, positionMs: number, play: boolean) => void
  onVolume: (v: number) => void
  onCrate: () => void
  onFullscreen: () => void
  onTheme: () => void
}

/** Placeholders until the first render hands the real ones to the listeners. */
const startNothing: (dir: 1 | -1) => void = () => {}

interface Wind {
  /** 1 fast forward, -1 rewind, 0 not winding. */
  dir: -1 | 0 | 1
  rate: number
  tapeMs: number
  wasPlaying: boolean
}

/**
 * The cassette theme: an 80s black tape deck. No skip buttons, as on the
 * real thing: you play, pause, and wind. FF and REW work while held, in
 * silence, and nothing says where you are in the song; let go and it plays
 * from wherever the tape got to, which may be a song or two further on.
 * The tape counter turns with the reels and can be zeroed, which is how
 * people found their place on a real tape.
 *
 * The cassette is SVG in its own 100 x 63.5 units. The reels, packs and
 * counter are animated like the VU meter: one rAF loop writing straight to
 * the DOM, not React state.
 */
export function Cassette(p: Props) {
  const { track, tracks } = p
  const [winding, setWinding] = useState<Wind['dir']>(0)
  const mask = `label-${useId().replace(/:/g, '')}`

  // The tape is the album or playlist with the songs end to end, or just this
  // song when the list doesn't include it (e.g. a lone track).
  const index = track ? tracks.findIndex((t) => t.uri === track.uri) : -1
  const tape: { uri: string; durationMs: number }[] = index >= 0 ? tracks : track ? [track] : []
  const at = Math.max(index, 0)
  // The player's own duration for the playing song, in case the list has none.
  const durations = tape.map((t, i) => (i === at && track ? track.durationMs : t.durationMs))
  const offset = durations.slice(0, at).reduce((a, b) => a + b, 0)
  const totalMs = durations.reduce((a, b) => a + b, 0)
  const tapeMs = track ? offset + Math.min(p.positionMs, track.durationMs) : 0

  const hubs = useRef<(SVGGElement | null)[]>([null, null])
  const packs = useRef<(SVGCircleElement | null)[]>([null, null])
  const drums = useRef<(HTMLSpanElement | null)[]>([null, null, null])

  const wind = useRef<Wind>({ dir: 0, rate: 0, tapeMs: 0, wasPlaying: false })
  /** After winding, where the tape stopped, until the player catches up. */
  const hold = useRef<{ tapeMs: number; until: number } | null>(null)
  /** The tape position the reels last showed. */
  const shown = useRef(0)
  /** Counter reading at the last RESET. */
  const zero = useRef(0)

  // The loop and the window's key listeners read the latest render from here.
  const live = useRef({ tapeMs, totalMs, playing: false, tape, durations, start: startNothing, stop: () => {} })

  const startWind = (dir: 1 | -1) => {
    if (!track || wind.current.dir) return
    hold.current = null
    wind.current = { dir, rate: 0, tapeMs: shown.current, wasPlaying: !p.paused }
    if (!p.paused) p.onPause() // decks wind in silence
    setWinding(dir)
  }

  const stopWind = () => {
    const w = wind.current
    if (!w.dir) return
    wind.current = { ...w, dir: 0 }
    setWinding(0)
    const { tape, durations } = live.current
    const spot = locate(durations, w.tapeMs)
    const t = tape[spot.index]
    if (!t) return
    // Keep the reels where they stopped; the player takes a moment to get there.
    hold.current = { tapeMs: w.tapeMs, until: performance.now() + 4000 }
    p.onCue(t.uri, spot.positionMs, w.wasPlaying)
  }

  useLayoutEffect(() => {
    live.current = { tapeMs, totalMs, playing: !!track && !p.paused, tape, durations, start: startWind, stop: stopWind }
  })

  useEffect(() => {
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const angle = [0, 0]
    let frame = 0
    let last = performance.now()

    const tick = (now: number) => {
      // Drawing skips long gaps (a hidden tab), but winding covers the real
      // time held: frames can come slowly while the key is still down.
      const held = Math.min((now - last) / 1000, 1)
      const dt = Math.min(held, 0.1)
      last = now
      const { tapeMs, totalMs, playing } = live.current
      const w = wind.current
      const h = hold.current

      let pos: number
      let speed: number // tape speed, 1 = playing
      if (w.dir) {
        w.rate = Math.min(WIND_MAX, w.rate + WIND_ACCEL * held)
        w.tapeMs = Math.min(Math.max(w.tapeMs + w.dir * w.rate * held * 1000, 0), totalMs)
        pos = w.tapeMs
        speed = pos <= 0 || pos >= totalMs ? 0 : w.dir * w.rate // stops dead at either end
      } else if (h && now < h.until && Math.abs(tapeMs - h.tapeMs) > 2000) {
        pos = h.tapeMs
        speed = 0
      } else {
        hold.current = null
        pos = tapeMs
        speed = playing ? 1 : 0
      }
      shown.current = pos

      // Tape runs off the left reel onto the right one.
      const f = totalMs ? pos / totalMs : 0
      const radii = [packRadius(1 - f), packRadius(f)]
      // Past a few times play speed the eye only sees a blur (and spokes
      // start to strobe backwards), so the drawn speed is capped.
      const drawn = Math.sign(speed) * Math.min(Math.abs(speed), 4)
      radii.forEach((r, i) => {
        // Same tape speed at both reels, so the smaller one turns faster.
        // Playing, both turn anticlockwise.
        if (!still) angle[i] = (angle[i] - (drawn * 4.5 / r) * 360 * dt) % 360
        packs.current[i]?.setAttribute('r', r.toFixed(2))
        hubs.current[i]?.setAttribute('transform', `translate(${i ? HUB_R : HUB_L} ${HUB_Y}) rotate(${angle[i].toFixed(1)})`)
      })

      odometer(pos / COUNTER_MS - zero.current).forEach((d, i) => {
        drums.current[i]?.style.setProperty('--d', d.toFixed(3))
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  // Hold ← / → to rewind / fast forward. Subscribed once, like App's keys.
  useEffect(() => {
    const dirOf = (e: globalThis.KeyboardEvent) => (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0)
    const down = (e: globalThis.KeyboardEvent) => {
      const dir = dirOf(e)
      if (!dir || e.repeat || e.target instanceof HTMLInputElement) return
      live.current.start(dir)
    }
    const up = (e: globalThis.KeyboardEvent) => { if (dirOf(e) === wind.current.dir) live.current.stop() }
    // Let go of a key in another window and we'd never hear about it.
    const blur = () => live.current.stop()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const spinning = !!track && !p.paused && !winding

  return (
    <div className="tape-scene drift">
      <div className="tape-deck">
        <div className="tape-body">
          <header className="tape-top">
            <span className="wordmark">Turntable <small>TC-1</small></span>
            <span className="tape-legend">Stereo Cassette Deck</span>
            <span className="power"><span className="power-led" aria-hidden="true" /> Power</span>
          </header>

          <div className="tape-main">
            <div className="tape-left">
              <div className="tape-door">
                <h1 className="sr-only" aria-live="polite">{track ? `${track.name}, ${track.artists}` : 'No tape'}</h1>
                {track ? (
                  <div className={`cassette ${winding ? 'winding' : ''}`}>
                    <svg viewBox="0 0 100 63.5" aria-hidden="true">
                      <defs>
                        <mask id={mask}>
                          <rect x="5" y="3.5" width="90" height="40" rx="1.6" fill="#fff" />
                          <circle cx={HUB_L} cy={HUB_Y} r="8.2" fill="#000" />
                          <circle cx={HUB_R} cy={HUB_Y} r="8.2" fill="#000" />
                          <rect x="39" y="22.5" width="22" height="13" rx="1.4" fill="#000" />
                        </mask>
                        {/* The shell's insides only show through the label's holes; a full pack is
                            wider than the label is tall, so clip it rather than let it poke out below. */}
                        <clipPath id={`${mask}-in`}>
                          <rect x="5" y="3.5" width="90" height="40" />
                        </clipPath>
                        <radialGradient id={`${mask}-pack`}>
                          <stop offset="0.3" stopColor="#2a1810" />
                          <stop offset="0.92" stopColor="#4a2c1b" />
                          <stop offset="1" stopColor="#24150d" />
                        </radialGradient>
                      </defs>

                      <rect className="shell" width="100" height="63.5" rx="3" />
                      {/* Inside the shell, seen through the label's holes. */}
                      <g clipPath={`url(#${mask}-in)`}>
                        <rect x="14" y="16" width="72" height="27" fill="#0d0b0a" />
                        {[0, 1].map((i) => (
                          <circle
                            key={i} ref={(el) => { packs.current[i] = el }}
                            cx={i ? HUB_R : HUB_L} cy={HUB_Y} r={HUB} fill={`url(#${mask}-pack)`}
                          />
                        ))}
                        {[0, 1].map((i) => (
                          <g key={i} ref={(el) => { hubs.current[i] = el }} className="hub">
                            <circle r="5.4" fill="#e8e3d8" />
                            <circle r="3.4" fill="#16130f" />
                            {[0, 60, 120, 180, 240, 300].map((a) => (
                              <rect key={a} x="-0.55" y="-3.6" width="1.1" height="1.5" fill="#e8e3d8" transform={`rotate(${a})`} />
                            ))}
                          </g>
                        ))}
                      </g>

                      <g mask={`url(#${mask})`}>
                        <rect x="5" y="3.5" width="90" height="40" fill="#efe7d3" />
                        {track.artUrl && (
                          <image
                            key={track.artUrl} className="label-art" href={track.artUrl}
                            x="5" y="15" width="90" height="28.5" preserveAspectRatio="xMidYMid slice"
                          />
                        )}
                      </g>
                      <rect className="window-rim" x="39" y="22.5" width="22" height="13" rx="1.4" />

                      {/* The edge that goes into the deck: guide holes and the head opening. */}
                      <path className="shell-edge" d="M15 63.5 L21 49 H79 L85 63.5 Z" />
                      <circle cx="27" cy="57" r="1.8" fill="#0b0a09" />
                      <circle cx="73" cy="57" r="1.8" fill="#0b0a09" />
                      <rect x="43" y="55.5" width="14" height="8" rx="0.6" fill="#0b0a09" />
                      <rect x="43" y="61.2" width="14" height="1" fill="#4a2c1b" />
                      {[[3, 3], [97, 3], [3, 60.5], [97, 60.5], [50, 51.5]].map(([x, y]) => (
                        <circle key={`${x},${y}`} className="screw" cx={x} cy={y} r="1.1" />
                      ))}
                    </svg>
                    <div className="label-strip">
                      <span className="label-side">A</span>
                      <span className="label-text">
                        <b>{track.name}</b>
                        <span>{track.artists}{p.heading ? ` · ${p.heading}` : ''}</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="door-empty">No tape</span>
                )}
                <div className="door-sheen" aria-hidden="true" />
              </div>

              <div className="tape-keys" role="group" aria-label="Transport">
                <PianoKey legend="Eject" title="Change tape: open the crate (C)" onClick={p.onCrate}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 4 14h16Z" /><rect x="4" y="17" width="16" height="2.5" /></svg>
                </PianoKey>
                <PianoKey
                  legend="Rew" label="Rewind (hold, or hold ←)" disabled={!track} down={winding === -1}
                  onHold={(on) => (on ? startWind(-1) : stopWind())}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 6v12L3 12Z" /><path d="M21 6v12l-8-6Z" /></svg>
                </PianoKey>
                <PianoKey legend="Play" onClick={() => p.paused && p.onToggle()} disabled={!track} down={spinning}>
                  <PlayIcon />
                </PianoKey>
                <PianoKey
                  legend="F.Fwd" label="Fast forward (hold, or hold →)" disabled={!track} down={winding === 1}
                  onHold={(on) => (on ? startWind(1) : stopWind())}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6v12l8-6Z" /><path d="M13 6v12l8-6Z" /></svg>
                </PianoKey>
                <PianoKey legend="Pause" onClick={p.onToggle} disabled={!track} down={!!track && p.paused && !winding}>
                  <PauseIcon />
                </PianoKey>
              </div>
            </div>

            <div className="tape-right">
              <div className="tape-panel counter-panel">
                <div className="counter-block">
                  <span className="counter" role="img" aria-label="Tape counter">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="drum" ref={(el) => { drums.current[i] = el }}>
                        <span className="drum-strip">{'01234567890'.split('').map((d, k) => <span key={k}>{d}</span>)}</span>
                      </span>
                    ))}
                  </span>
                  <span className="counter-reset">
                    <button
                      className="tape-btn" onClick={() => { zero.current = shown.current / COUNTER_MS }}
                      aria-label="Reset counter" title="Zero the counter here"
                    />
                    <span className="legend">Reset</span>
                  </span>
                </div>
                <div className="lamps">
                  <Lamp on={spinning} colour="green">Play</Lamp>
                  <Lamp on={!!winding} colour="amber">Wind</Lamp>
                  <Lamp on={!!track && p.paused && !winding} colour="amber">Pause</Lamp>
                  <Lamp on colour="amber">CrO₂</Lamp>
                </div>
              </div>

              <div className="tape-panel meter-panel">
                <VuMeter trackKey={track ? `${track.name}|${track.artists}` : null} playing={spinning} volume={p.volume} />
                <span className="meter-scale" aria-hidden="true">
                  <span>-20</span><span>-10</span><span>-5</span><span>-3</span><span>0</span><span>+3</span><span>+6</span>
                </span>
              </div>

              <p className="tape-spec" aria-hidden="true">
                <span>Auto tape select</span><span>Hold FF · REW to wind</span>
              </p>

              <div className="tape-controls">
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

interface PianoKeyProps {
  legend: string
  label?: string
  title?: string
  /** Latched down, like a real deck's PLAY or PAUSE. */
  down?: boolean
  disabled?: boolean
  onClick?: () => void
  /** For keys that act while held (FF, REW): true on press, false on release. */
  onHold?: (on: boolean) => void
  children: ReactNode
}

/** A long silver transport key, symbol and word printed on its face. */
function PianoKey({ legend, label, title, down, disabled, onClick, onHold, children }: PianoKeyProps) {
  // Pointer capture keeps the release coming here even if the pointer slides
  // off the key. Enter works the same way from the keyboard.
  const hold = onHold && {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => { e.currentTarget.setPointerCapture(e.pointerId); onHold(true) },
    onPointerUp: () => onHold(false),
    onLostPointerCapture: () => onHold(false),
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.repeat) onHold(true) },
    onKeyUp: (e: KeyboardEvent) => { if (e.key === 'Enter') onHold(false) },
  }
  return (
    <button
      className={`piano-key ${down ? 'down' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={onHold || onClick === undefined ? undefined : down}
      aria-label={label ?? legend}
      title={title ?? label}
      {...hold}
    >
      {children}
      <span aria-hidden="true">{legend}</span>
    </button>
  )
}

function Lamp({ on, colour, children }: { on: boolean; colour: 'green' | 'amber'; children: ReactNode }) {
  return (
    <span className={`lamp ${colour} ${on ? 'on' : ''}`}>
      <i aria-hidden="true" />
      {children}
    </span>
  )
}
