import { useEffect, useState } from 'react'
import { AuthRequiredError, NetworkError, handleCallback, isLoggedIn, login, logout } from './spotify/auth'
import { playContext, transferPlayback } from './spotify/api'
import { useSpotifyPlayer } from './player/useSpotifyPlayer'
import { usePosition } from './player/usePosition'
import { useFullscreen } from './hooks/useFullscreen'
import { useWakeLock } from './hooks/useWakeLock'
import { useIdle } from './hooks/useIdle'
import { useAlbumColour } from './hooks/useAlbumColour'
import { useOnline } from './hooks/useOnline'
import { log } from './lib/log'
import { Turntable } from './components/Turntable'
import { NowPlaying } from './components/NowPlaying'
import { Crate } from './components/Crate'
import { VuMeter } from './components/VuMeter'

/**
 * Three screens, one component:
 *   1. not logged in      -> "Connect Spotify"
 *   2. logged in, no deck -> "Power on" (needed: browsers require a click before audio)
 *   3. deck running       -> turntable + crate
 */
export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  const [powered, setPowered] = useState(false)
  const [crateOpen, setCrateOpen] = useState(false)
  /** One slot for the most recent problem the user should see. */
  const [notice, setNotice] = useState<string | null>(null)
  const online = useOnline()

  const player = useSpotifyPlayer(powered)
  const position = usePosition(player.state)
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const idle = useIdle(3000)
  const bg = useAlbumColour(player.state.track?.artUrl ?? null)

  useWakeLock(powered && !player.state.paused)

  /**
   * Central place to turn a thrown error into something on screen.
   * AuthRequiredError sends the user back to the login gate; everything
   * else becomes a dismissible notice. .NET analogy: exception filter middleware.
   */
  const report = (e: unknown) => {
    log.error('app', 'reported to user', e)
    if (e instanceof AuthRequiredError) {
      setPowered(false)
      setLoggedIn(false)
      setNotice(e.message)
    } else if (e instanceof NetworkError) {
      setNotice('Lost contact with Spotify. Will keep trying.')
    } else {
      setNotice((e as Error).message ?? 'Something went wrong')
    }
  }

  // Finish the PKCE redirect if we landed on /callback.
  useEffect(() => {
    if (window.location.pathname !== '/callback') return
    handleCallback()
      .then((ok) => ok && setLoggedIn(true))
      .catch(report)
  }, [])

  // Once the SDK device exists, make it the active Spotify device.
  useEffect(() => {
    if (!player.deviceId) return
    transferPlayback(player.deviceId).catch(report)
  }, [player.deviceId])

  useEffect(() => {
    log.info('app', online ? 'online' : 'offline')
  }, [online])

  // Clear a stale network notice when the connection comes back.
  useEffect(() => {
    if (online) setNotice((n) => (n?.startsWith('Lost contact') ? null : n))
  }, [online])

  // Keyboard: space play/pause, left/right skip, up/down volume, F fullscreen, C crate, L download log, Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      switch (e.key) {
        case ' ': e.preventDefault(); player.togglePlay(); break
        case 'ArrowRight': player.next(); break
        case 'ArrowLeft': player.previous(); break
        case 'ArrowUp': e.preventDefault(); player.setVolume(player.volume + 0.05); break
        case 'ArrowDown': e.preventDefault(); player.setVolume(player.volume - 0.05); break
        case 'f': case 'F': toggleFullscreen(); break
        case 'c': case 'C': setCrateOpen((o) => !o); break
        case 'l': case 'L': log.download(); break
        case 'Escape': setCrateOpen(false); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [player, toggleFullscreen])

  const play = async (uri: string) => {
    if (!player.deviceId) return setNotice('Player is still connecting')
    log.info('app', 'play context', { uri })
    try {
      await playContext(player.deviceId, uri)
      setCrateOpen(false)
    } catch (e) {
      report(e)
    }
  }

  const connect = () => login().catch(report)

  if (!loggedIn) {
    return (
      <main className="gate">
        <h1>Turntable</h1>
        {notice && <p className="muted">{notice}</p>}
        <button className="primary" onClick={connect}>Connect Spotify</button>
      </main>
    )
  }

  if (!powered) {
    return (
      <main className="gate">
        <h1>Turntable</h1>
        <button className="primary" onClick={() => setPowered(true)}>Power on</button>
        <button className="link" onClick={() => { logout(); setLoggedIn(false) }}>Sign out</button>
      </main>
    )
  }

  return (
    <main className={`stage ${idle ? 'idle' : ''}`} style={{ backgroundColor: bg }}>
      {!online && <div className="banner">Offline. Playback will resume when the connection returns.</div>}
      {online && player.status === 'loading' && <div className="banner muted">Connecting to Spotify…</div>}
      {player.error && (
        <div className="banner" onClick={player.clearError} role="status">{player.error}</div>
      )}
      {notice && (
        <div className="banner" onClick={() => setNotice(null)} role="status">{notice}</div>
      )}

      <Turntable
        track={player.state.track}
        paused={player.state.paused}
        positionMs={position}
        onToggle={player.togglePlay}
        onSeek={(ms) => {
          log.info('app', 'seek', { ms })
          player.seek(ms)?.catch(report)
        }}
      >
        <VuMeter
          trackKey={player.state.track ? `${player.state.track.name}|${player.state.track.artists}` : null}
          playing={!!player.state.track && !player.state.paused}
          volume={player.volume}
        />
      </Turntable>

      <NowPlaying track={player.state.track} />

      <nav className="controls">
        <button onClick={() => setCrateOpen(true)}>Crate</button>
        <button onClick={player.previous} aria-label="Previous">‹</button>
        <button onClick={player.togglePlay}>{player.state.paused ? 'Play' : 'Pause'}</button>
        <button onClick={player.next} aria-label="Next">›</button>
        <label className="volume" title="Volume (↑ ↓)">
          <span aria-hidden="true">Vol</span>
          <input
            type="range" min={0} max={1} step={0.01}
            value={player.volume}
            onChange={(e) => player.setVolume(Number(e.target.value))}
            aria-label="Volume"
          />
        </label>
        <button onClick={toggleFullscreen}>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</button>
        <button onClick={log.download} title="Download debug log (L)">Log</button>
      </nav>

      <Crate open={crateOpen} onPlay={play} onClose={() => setCrateOpen(false)} />
    </main>
  )
}
