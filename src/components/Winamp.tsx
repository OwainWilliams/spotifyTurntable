import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Repeat, Track } from '../player/useSpotifyPlayer'
import type { ContextTrack } from '../spotify/api'
import { clock, lcd, longClock } from '../lib/clock'
import { tempoFor } from './VuMeter'
import { CycleIcon, ExpandIcon, ShrinkIcon } from './icons'

/** Roughly how many characters fit in the title display; longer text scrolls. */
const MARQUEE_CHARS = 31

type VisMode = 'spectrum' | 'scope' | 'off'
/** Clicking the visualiser cycles it, as on the real thing. */
const NEXT_VIS: Record<VisMode, VisMode> = { spectrum: 'scope', scope: 'off', off: 'spectrum' }

interface Props {
  track: Track | null
  paused: boolean
  positionMs: number
  /** The playlist's name, for its window's title. */
  heading: string
  /** The album or playlist (or queue) being played, as for the jukebox strips. */
  tracks: ContextTrack[]
  volume: number
  shuffle: boolean
  repeat: Repeat
  isFullscreen: boolean
  /** Name of the theme the theme button switches to. */
  nextTheme: string
  onPlayTrack: (uri: string) => void
  onToggle: () => void
  onResume: () => void
  onStop: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (ms: number) => void
  onVolume: (v: number) => void
  onShuffle: () => void
  onRepeat: () => void
  onCrate: () => void
  onFullscreen: () => void
  onTheme: () => void
}

/**
 * The fifth theme: a late-90s desktop MP3 player, three docked windows: the
 * main window (LCD time, spectrum analyser, scrolling title, sliders,
 * transport), the playlist editor below it, and album art beside them.
 *
 * Laid out in the original skin's pixels: --px is one of them (623 across the
 * three windows), and `at(x, y, w, h)` places a part where it sat on the
 * 275 x 116 main window (or inside the LCD, for the parts in there). .NET analogy: a WinForms form with absolute
 * Location/Size, scaled as one piece.
 */
export function Winamp(p: Props) {
  const { track } = p
  /** Click the time to count down instead, as the original did. */
  const [remaining, setRemaining] = useState(false)
  const [vis, setVis] = useState<VisMode>('spectrum')
  const [showList, setShowList] = useState(true)
  /** While a slider is dragged, the title display says what it's set to. */
  const [hint, setHint] = useState<string | null>(null)
  /** The seek bar's own position while dragged, then until playback catches up. */
  const [seek, setSeek] = useState<{ ms: number; dragging: boolean } | null>(null)
  /** The playlist row clicked once (blue); double-click plays it. */
  const [selected, setSelected] = useState<number | null>(null)
  const listRef = useRef<HTMLOListElement>(null)

  // The playlist: the whole album or playlist, or just this track if it isn't in it.
  const inList = !!track && p.tracks.some((t) => t.uri === track.uri)
  const list: ContextTrack[] = inList || !track ? p.tracks : [track]
  const index = track ? list.findIndex((t) => t.uri === track.uri) : -1

  const duration = track?.durationMs ?? 0
  const pos = track ? Math.min(p.positionMs, duration) : 0
  // Hold the dropped position until the player reports it (or 3s pass), or
  // the thumb would jump back to the old position before the seek lands.
  const caughtUp = !!seek && !seek.dragging && Math.abs(pos - seek.ms) < 1500
  const shownPos = seek && !caughtUp ? seek.ms : pos
  const stopped = !track || (p.paused && pos < 1000)
  const playing = !!track && !p.paused

  useEffect(() => {
    if (!seek || seek.dragging) return
    const t = setTimeout(() => setSeek(null), 3000)
    return () => clearTimeout(t)
  }, [seek])

  // Keep the playing track in view in the playlist, without scrolling the
  // page (scrollIntoView would also scroll .stage; see the crate's preventScroll).
  useEffect(() => {
    const ol = listRef.current
    const row = ol?.querySelector<HTMLElement>('[aria-current]')
    if (!ol || !row) return
    if (row.offsetTop < ol.scrollTop || row.offsetTop + row.offsetHeight > ol.scrollTop + ol.clientHeight) {
      ol.scrollTop = row.offsetTop - (ol.clientHeight - row.offsetHeight) / 2
    }
  }, [index, showList])

  const title = track ? `${index + 1}. ${track.artists} - ${track.name} (${clock(duration)})` : 'TURNTABLE 2.91'
  const scrolls = !hint && title.length > MARQUEE_CHARS
  const shown = hint ?? title

  const seekTo = (ms: number) => {
    setSeek({ ms, dragging: true })
    setHint(`Seek to: ${lcd(ms)}/${lcd(duration)} (${Math.round((ms / Math.max(duration, 1)) * 100)}%)`)
  }
  const endSeek = () => {
    setHint(null)
    if (!seek?.dragging) return
    p.onSeek(seek.ms)
    setSeek({ ms: seek.ms, dragging: false })
  }
  const setVolume = (v: number) => {
    p.onVolume(v)
    setHint(`Volume: ${Math.round(v * 100)}%`)
  }

  const total = list.reduce((sum, t) => sum + t.durationMs, 0)
  const before = list.slice(0, Math.max(index, 0)).reduce((sum, t) => sum + t.durationMs, 0)

  return (
    <div className="amp-scene drift">
      <div className="amp">
        <section className="amp-win amp-main" aria-label="Player">
          <TitleBar title="Turntable">
            <button className="amp-tbtn" onClick={p.onTheme} title={`Switch to ${p.nextTheme} (T)`} aria-label={`Switch to ${p.nextTheme}`}>
              <CycleIcon size={10} />
            </button>
            <button
              className="amp-tbtn" onClick={p.onFullscreen} title="Fullscreen (F)"
              aria-label={p.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {p.isFullscreen ? <ShrinkIcon size={10} /> : <ExpandIcon size={10} />}
            </button>
          </TitleBar>

          <div className="amp-clutter" style={at(10, 22, 8, 43)} aria-hidden="true">
            {'OAIDV'.split('').map((c) => <span key={c}>{c}</span>)}
          </div>

          <div className="amp-lcd" style={at(22, 22, 82, 40)}>
            <span className="amp-state" style={at(4, 6, 9, 9)} aria-label={stopped ? 'Stopped' : p.paused ? 'Paused' : 'Playing'}>
              <Glyph kind={stopped ? 'stop' : p.paused ? 'pause' : 'play'} />
            </span>
            <button
              className={`amp-time ${p.paused && !stopped ? 'blink' : ''}`} style={at(14, 1, 66, 18)}
              onClick={() => setRemaining((r) => !r)} title="Elapsed or remaining time"
              aria-label={track ? `${remaining ? 'Remaining' : 'Elapsed'} ${lcd(shownPos)}` : 'No time'}
            >
              {!stopped && <><span className="amp-minus">{remaining ? '-' : ''}</span>{lcd(remaining ? duration - shownPos : shownPos)}</>}
            </button>
            <Visualiser
              mode={vis}
              trackKey={track ? `${track.name}|${track.artists}` : null}
              playing={playing}
              volume={p.volume}
              onClick={() => setVis((v) => NEXT_VIS[v])}
            />
          </div>

          <div className="amp-marquee" style={at(109, 23, 157, 13)} aria-live="polite">
            <h1 className="sr-only">{track ? `${track.name}, ${track.artists}` : 'Nothing playing'}</h1>
            <div
              className={`amp-scroll ${scrolls ? 'scrolls' : ''}`}
              style={{ '--chars': shown.length } as CSSProperties}
              aria-hidden="true"
            >
              <span>{shown}</span>
              {scrolls && <span>{shown}</span>}
            </div>
          </div>

          {/* Nominal figures: Spotify doesn't say, but its web player streams 256k AAC. */}
          <span className="amp-box" style={at(109, 40, 19, 10)} aria-hidden="true">{track ? '256' : ''}</span>
          <span className="amp-legend" style={at(130, 41, 20, 8)} aria-hidden="true">kbps</span>
          <span className="amp-box" style={at(154, 40, 14, 10)} aria-hidden="true">{track ? '44' : ''}</span>
          <span className="amp-legend" style={at(170, 41, 16, 8)} aria-hidden="true">kHz</span>
          <span className="amp-legend amp-ch" style={at(206, 41, 26, 8)} aria-hidden="true">mono</span>
          <span className={`amp-legend amp-ch ${stopped ? '' : 'lit'}`} style={at(234, 41, 32, 8)} aria-hidden="true">stereo</span>

          <input
            className="amp-volume" style={{ ...at(107, 57, 68, 13), '--v': p.volume } as CSSProperties}
            type="range" min={0} max={1} step={0.01} value={p.volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            onPointerUp={() => setHint(null)} onKeyUp={() => setHint(null)} onBlur={() => setHint(null)}
            aria-label="Volume" title="Volume (↑ ↓)"
          />
          {/* Balance is part of the look only: the SDK has no pan control. */}
          <span className="amp-balance" style={at(177, 57, 38, 13)} aria-hidden="true"><span /></span>
          <button className="amp-small amp-toggle" style={at(219, 58, 23, 12)} disabled title="No equaliser: the page can't touch Spotify's audio">
            EQ
          </button>
          <button
            className={`amp-small amp-toggle ${showList ? 'on' : ''}`} style={at(242, 58, 23, 12)}
            onClick={() => setShowList((s) => !s)} aria-pressed={showList} title="Playlist"
          >
            PL
          </button>

          <input
            className="amp-seek" style={at(16, 72, 248, 10)}
            type="range" min={0} max={Math.max(duration, 1)} step={1000} value={shownPos}
            disabled={!track}
            onChange={(e) => seekTo(Number(e.target.value))}
            onPointerUp={endSeek} onKeyUp={endSeek}
            aria-label="Position"
          />

          <div className="amp-transport" style={at(16, 88, 115, 18)}>
            <button onClick={p.onPrevious} disabled={!track} aria-label="Previous track" title="Previous (←)"><Glyph kind="prev" /></button>
            <button onClick={() => (p.paused ? p.onResume() : p.onSeek(0))} disabled={!track} aria-label="Play" title="Play"><Glyph kind="play" /></button>
            <button onClick={() => !stopped && p.onToggle()} disabled={!track} aria-label="Pause" aria-pressed={!!track && p.paused && !stopped} title="Pause (Space)"><Glyph kind="pause" /></button>
            <button onClick={p.onStop} disabled={!track} aria-label="Stop" title="Stop"><Glyph kind="stop" /></button>
            <button onClick={p.onNext} disabled={!track} aria-label="Next track" title="Next (→)"><Glyph kind="next" /></button>
          </div>
          <button className="amp-eject" style={at(136, 89, 22, 16)} onClick={p.onCrate} aria-label="Open the crate" title="Open (C)">
            <Glyph kind="eject" />
          </button>
          <button
            className={`amp-small amp-toggle ${p.shuffle ? 'on' : ''}`} style={at(164, 89, 46, 15)}
            onClick={p.onShuffle} disabled={!track} aria-pressed={p.shuffle}
          >
            Shuffle
          </button>
          <button
            className={`amp-small amp-toggle ${p.repeat !== 'off' ? 'on' : ''}`} style={at(211, 89, 28, 15)}
            onClick={p.onRepeat} disabled={!track} aria-pressed={p.repeat !== 'off'}
            aria-label="Repeat" title={p.repeat === 'track' ? 'Repeating this track' : 'Repeat'}
          >
            <Glyph kind="repeat" />
          </button>
          <span className="amp-badge" style={at(248, 89, 16, 16)} aria-hidden="true" />
        </section>

        <section className={`amp-win amp-pl ${showList ? '' : 'hidden'}`} aria-label="Playlist">
          <TitleBar title={p.heading} />
          <ol className="pl-list" ref={listRef}>
            {list.map((t, i) => (
              <li key={i}>
                <button
                  className={`pl-row ${i === index ? 'now' : ''} ${i === selected ? 'sel' : ''}`}
                  onClick={() => setSelected(i)}
                  onDoubleClick={() => p.onPlayTrack(t.uri)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); p.onPlayTrack(t.uri) } }}
                  aria-current={i === index || undefined}
                  title="Double-click (or Enter) to play"
                >
                  <span className="pl-title">{i + 1}. {t.artists} - {t.name}</span>
                  <span className="pl-len">{clock(t.durationMs)}</span>
                </button>
              </li>
            ))}
            {!list.length && <li className="pl-empty">Press + to open the crate</li>}
          </ol>
          <footer className="pl-foot">
            <button className="amp-small" onClick={p.onCrate} title="Open the crate (C)" aria-label="Add: open the crate">+ Add</button>
            <span className="pl-total">
              {track ? longClock(before + pos) : '0:00'}/{longClock(total)}
            </span>
          </footer>
        </section>

        <section className="amp-win amp-art" aria-label="Album art">
          <TitleBar title={track ? track.album : 'Album art'} />
          <div className="art-frame">
            {track?.artUrl
              ? <img key={track.artUrl} src={track.artUrl} alt={`${track.album} cover`} />
              : <span className="art-none">No art</span>}
          </div>
        </section>
      </div>
    </div>
  )
}

/** Place a part at its pixel position on the original skin. */
function at(x: number, y: number, w: number, h: number): CSSProperties {
  const px = (n: number) => `calc(${n} * var(--px))`
  return { position: 'absolute', left: px(x), top: px(y), width: px(w), height: px(h) }
}

/** Gold-striped title bar, with buttons at the right where minimise and close were. */
function TitleBar({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="amp-title">
      <span className="amp-grip" aria-hidden="true" />
      <span className="amp-title-text">{title}</span>
      <span className="amp-grip" aria-hidden="true" />
      {children && <span className="amp-tbtns">{children}</span>}
    </header>
  )
}

/** Blocky transport glyphs, drawn on a 12 x 8 pixel grid. */
function Glyph({ kind }: { kind: 'prev' | 'play' | 'pause' | 'stop' | 'next' | 'eject' | 'repeat' }) {
  const shapes = {
    prev: <><rect x="1" y="0" width="2" height="8" /><path d="M3 4 7 0v8Zm4 0 4-4v8Z" /></>,
    play: <path d="M3 0 9 4 3 8Z" />,
    pause: <><rect x="3" y="0" width="2" height="8" /><rect x="7" y="0" width="2" height="8" /></>,
    stop: <rect x="2" y="0" width="8" height="8" />,
    next: <><path d="M1 0 5 4 1 8Zm4 0 4 4-4 4Z" /><rect x="9" y="0" width="2" height="8" /></>,
    eject: <><path d="M1 5 6 0l5 5Z" /><rect x="1" y="6" width="10" height="2" /></>,
    repeat: <path d="M1 1h10v6H6V6h4V2H2v3H1Zm4 3v4L2 6Z" />,
  }
  return (
    <svg className="amp-glyph" viewBox="0 0 12 8" aria-hidden="true" focusable="false" shapeRendering="crispEdges">
      {shapes[kind]}
    </svg>
  )
}

const VIS_W = 76
const VIS_H = 16
const BARS = 19

/** The classic visualiser colours: spectrum rows top (red) to bottom (green), then the scope's. */
const SPECTRUM = [
  '#ef3110', '#ce2910', '#d65a00', '#d66600', '#d67300', '#c67b08', '#dea518', '#d6b521',
  '#bdde29', '#94de21', '#29ce10', '#32be10', '#39b510', '#319c08', '#299400', '#188408',
]
const SCOPE = ['#ffffff', '#d6d6de', '#b5bdbd', '#a0aaaf', '#949ca5']
const PEAK = '#969696'
const DOTS = '#182129'

interface VisProps {
  mode: VisMode
  trackKey: string | null
  playing: boolean
  volume: number
  onClick: () => void
}

/**
 * The spectrum analyser (or oscilloscope). SIMULATED, like the VU meter and
 * for the same reason: the audio is DRM-protected, so there are no samples to
 * analyse. Each track's pseudo-tempo (tempoFor) drives a kick in the low bars
 * and a hi-hat in the high ones, plus a little noise, with falling peak caps.
 *
 * Drawn into a 76 x 16 canvas, the original's actual resolution, and scaled
 * up with image-rendering: pixelated, so it has the same chunky pixels. One
 * rAF loop, no React state per frame.
 */
function Visualiser({ mode, trackKey, playing, volume, onClick }: VisProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const live = useRef({ mode, playing, volume, bpm: 110 })
  useLayoutEffect(() => {
    live.current = { mode, playing, volume, bpm: trackKey ? tempoFor(trackKey) : 110 }
  })

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let last = performance.now()
    let beats = 0
    let phase = 0
    const level = new Array<number>(BARS).fill(0)
    const peak = new Array<number>(BARS).fill(0)
    const noise = new Array<number>(BARS).fill(0)

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const { mode, playing, volume, bpm } = live.current
      const on = playing && !still
      beats += (dt * bpm) / 60
      phase += dt * 9
      const t = beats % 1
      const kick = Math.exp(-t * 4) * (Math.floor(beats) % 4 === 0 ? 1 : 0.8)
      const hat = Math.exp(-((t + 0.5) % 1) * 9)
      const gain = Math.sqrt(volume)

      for (let i = 0; i < BARS; i++) {
        const f = i / (BARS - 1)                     // 0 = bass, 1 = treble
        noise[i] = Math.min(Math.max(noise[i] * 0.9 + (Math.random() - 0.5) * 0.5, -0.4), 0.4)
        const body = 0.55 - 0.3 * f + 0.15 * noise[i]
        const target = on ? gain * (body + kick * 0.5 * (1 - f) ** 2 + hat * 0.35 * f ** 2) : 0
        // Fast attack, steady fall; the caps hang on a moment, then drop slower.
        level[i] = target > level[i] ? target : Math.max(target, level[i] - dt * 2.2)
        peak[i] = level[i] > peak[i] ? level[i] : Math.max(0, peak[i] - dt * 0.7)
      }

      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, VIS_W, VIS_H)
      ctx.fillStyle = DOTS
      for (let y = 1; y < VIS_H; y += 2) for (let x = 1; x < VIS_W; x += 2) ctx.fillRect(x, y, 1, 1)

      if (mode === 'spectrum') {
        for (let i = 0; i < BARS; i++) {
          const h = Math.round(Math.min(level[i], 1) * VIS_H)
          for (let y = VIS_H - h; y < VIS_H; y++) {
            ctx.fillStyle = SPECTRUM[y]
            ctx.fillRect(i * 4, y, 3, 1)
          }
          const py = VIS_H - 1 - Math.round(Math.min(peak[i], 1) * (VIS_H - 1))
          if (peak[i] > 0.02) {
            ctx.fillStyle = PEAK
            ctx.fillRect(i * 4, py, 3, 1)
          }
        }
      } else if (mode === 'scope') {
        const amp = on ? gain * (0.25 + 0.6 * kick) * (VIS_H / 2) : 0
        let prev = VIS_H / 2
        for (let x = 0; x < VIS_W; x++) {
          const wave = Math.sin(x * 0.35 + phase) * 0.6 + Math.sin(x * 0.9 - phase * 1.7) * 0.3 + (Math.random() - 0.5) * 0.25
          const y = Math.min(VIS_H - 1, Math.max(0, Math.round(VIS_H / 2 + wave * amp)))
          const [a, b] = y > prev ? [prev, y] : [y, prev]
          ctx.fillStyle = SCOPE[Math.min(SCOPE.length - 1, Math.floor(Math.abs(y - VIS_H / 2) / 2))]
          ctx.fillRect(x, a, 1, Math.max(1, b - a))
          prev = y
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <button className="amp-vis" style={at(2, 21, VIS_W, VIS_H)} onClick={onClick} aria-label={`Visualiser: ${mode}. Click to change`}>
      <canvas ref={canvas} width={VIS_W} height={VIS_H} />
    </button>
  )
}
