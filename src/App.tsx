import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AuthRequiredError, NetworkError, getClientId, handleCallback, isCallback, isLoggedIn, login, logout } from './spotify/auth'
import { addToQueue, playContext, setRepeat, setShuffle, transferPlayback } from './spotify/api'
import { useSpotifyPlayer } from './player/useSpotifyPlayer'
import { usePosition } from './player/usePosition'
import { useContextTracks } from './player/useContextTracks'
import { useFullscreen } from './hooks/useFullscreen'
import { useWakeLock } from './hooks/useWakeLock'
import { useIdle } from './hooks/useIdle'
import { useAlbumColour } from './hooks/useAlbumColour'
import { useOnline } from './hooks/useOnline'
import { THEME_NAMES, nextTheme, useTheme } from './hooks/useTheme'
import { useAttract } from './hooks/useAttract'
import { log } from './lib/log'
import { Turntable } from './components/Turntable'
import { NowPlaying } from './components/NowPlaying'
import { Transport } from './components/Transport'
import { RepoLink } from './components/RepoLink'
import { Crate } from './components/Crate'
import { VuMeter } from './components/VuMeter'
import { Jukebox, PER_PAGE } from './components/Jukebox'
import { CdPlayer } from './components/CdPlayer'
import { Cassette } from './components/Cassette'
import { Winamp } from './components/Winamp'
import { Setup } from './components/Setup'
import { contextLabel } from './lib/contextLabel'

/**
 * Three screens, one component (plus first-run setup for the Client ID):
 *   1. not logged in      -> "Connect Spotify"
 *   2. logged in, no deck -> "Power on" (needed: browsers require a click before audio)
 *   3. deck running       -> turntable, jukebox, CD, cassette or Winamp-style player (the theme) + crate
 */
export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn())
  /** Showing the "bring your own Spotify app" form (always, until there's an ID). */
  const [settingUp, setSettingUp] = useState(() => !getClientId())
  const [powered, setPowered] = useState(false)
  const [crateOpen, setCrateOpen] = useState(false)
  const [theme, toggleTheme] = useTheme()
  /** Jukebox strip page. Lives here so Page Up/Down can turn it. */
  const [page, setPage] = useState(0)
  /** Bumped after adding to the queue, so queue-sourced strips refetch. */
  const [queueVersion, setQueueVersion] = useState(0)
  /** One slot for the most recent problem the user should see. */
  const [notice, setNotice] = useState<string | null>(null)
  const online = useOnline()

  const player = useSpotifyPlayer(powered)
  const position = usePosition(player.state)
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const idle = useIdle(3000)
  const { background: bg, neon } = useAlbumColour(player.state.track?.artUrl ?? null)
  const attract = useAttract(powered && theme === 'jukebox' && (player.state.paused || !player.state.track))

  // Awake while playing, and through attract mode (that's the point of it);
  // once attract mode gives up, the screen may sleep.
  useWakeLock(powered && (!player.state.paused || attract === 'attract'))

  // Only fetched for the jukebox's strips, the CD's track calendar, the
  // cassette's tape and the Winamp playlist; the turntable doesn't need it.
  const strips = useContextTracks(
    player.state.contextUri,
    player.state.track?.uri ?? null,
    powered && theme !== 'turntable',
    queueVersion,
  )
  const pages = Math.max(1, Math.ceil(strips.tracks.length / PER_PAGE))
  const shownPage = Math.min(page, pages - 1)

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
    if (!isCallback()) return
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- surfacing a hook's error through report()
    if (strips.error) report(strips.error)
  }, [strips.error])

  // Clear a stale network notice when the connection comes back.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- responding to the browser going back online
    if (online) setNotice((n) => (n?.startsWith('Lost contact') ? null : n))
  }, [online])

  // Keyboard: space play/pause, left/right skip (the cassette winds instead,
  // and listens for itself, since it needs the key's release), up/down volume, F fullscreen, C crate,
  // T theme, Page Up/Down jukebox page, L download log, Esc close.
  //
  // Subscribed once, reading the latest values through a ref. Re-subscribing
  // whenever `player` changed (every render) lost keys: when a keypress itself
  // triggers a render (e.g. useIdle waking the screen), React swaps the
  // listener mid-dispatch, and the DOM skips both the removed old listener and
  // the newly added one, so the first key after idle did nothing.
  // .NET analogy: subscribe in the constructor, read current state from a field.
  const keyDeps = useRef({ player, toggleFullscreen, toggleTheme, pages, theme })
  // Updated after each render (not during it, which React may discard/replay).
  useLayoutEffect(() => { keyDeps.current = { player, toggleFullscreen, toggleTheme, pages, theme } })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const { player, toggleFullscreen, toggleTheme, pages, theme } = keyDeps.current
      switch (e.key) {
        case ' ': e.preventDefault(); player.togglePlay(); break
        case 'ArrowRight': if (theme !== 'cassette') player.next(); break
        case 'ArrowLeft': if (theme !== 'cassette') player.previous(); break
        case 'ArrowUp': e.preventDefault(); player.setVolume(player.volume + 0.05); break
        case 'ArrowDown': e.preventDefault(); player.setVolume(player.volume - 0.05); break
        case 'f': case 'F': toggleFullscreen(); break
        case 'c': case 'C': setCrateOpen((o) => !o); break
        case 't': case 'T': toggleTheme(); break
        case 'PageDown': e.preventDefault(); setPage((p) => Math.min(p + 1, pages - 1)); break
        case 'PageUp': e.preventDefault(); setPage((p) => Math.max(p - 1, 0)); break
        case 'l': case 'L': log.download(); break
        case 'Escape': setCrateOpen(false); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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

  /** Play one track from the strips, carrying on through its album or playlist. */
  const playTrack = async (uri: string) => {
    if (!player.deviceId) return setNotice('Player is still connecting')
    log.info('app', 'play track', { uri, context: player.state.contextUri })
    try {
      await playContext(player.deviceId, player.state.contextUri, uri)
    } catch (e) {
      report(e)
    }
  }

  /** Add one track to Spotify's queue. Resolves false (after reporting) if it failed. */
  const queueTrack = async (uri: string) => {
    if (!player.deviceId) {
      setNotice('Player is still connecting')
      return false
    }
    log.info('app', 'queue track', { uri })
    try {
      await addToQueue(player.deviceId, uri)
      setQueueVersion((v) => v + 1)
      return true
    } catch (e) {
      report(e)
      return false
    }
  }

  /**
   * Empty Spotify's queue. There's no endpoint for it, but starting playback
   * clears the queue, so restart the current track where it already is (and
   * pause again if it was paused). Resolves false (after reporting) if it failed.
   */
  const clearQueue = async () => {
    const { track, contextUri, paused } = player.state
    if (!player.deviceId || !track) return false
    log.info('app', 'clear queue', { uri: track.uri, position })
    try {
      await playContext(player.deviceId, contextUri, track.uri, position)
      if (paused) await player.pause()
      setQueueVersion((v) => v + 1)
      return true
    } catch (e) {
      report(e)
      return false
    }
  }

  /**
   * Where the cassette's FF or REW let go. Still in the same song: seek. A
   * song or more along the tape: start that one there. Either way, carry on
   * playing only if it was playing before winding.
   */
  const cue = async (uri: string, positionMs: number, play: boolean) => {
    if (!player.deviceId) return
    log.info('app', 'cue', { uri, positionMs, play })
    try {
      if (uri === player.state.track?.uri) {
        await player.seek(positionMs)
        if (play) await player.resume()
      } else {
        await playContext(player.deviceId, player.state.contextUri, uri, positionMs)
        if (!play) await player.pause()
      }
    } catch (e) {
      report(e)
    }
  }

  /** Winamp's Stop: pause, and back to the start of the track. */
  const stop = async () => {
    log.info('app', 'stop')
    try {
      await player.pause()
      await player.seek(0)
    } catch (e) {
      report(e)
    }
  }

  const toggleShuffle = () => {
    if (!player.deviceId) return
    log.info('app', 'shuffle', { on: !player.state.shuffle })
    setShuffle(player.deviceId, !player.state.shuffle).catch(report)
  }

  /** One key, two states, as on Winamp: any repeat (context or track) turns off. */
  const toggleRepeat = () => {
    if (!player.deviceId) return
    const mode = player.state.repeat === 'off' ? 'context' : 'off'
    log.info('app', 'repeat', { mode })
    setRepeat(player.deviceId, mode).catch(report)
  }

  const connect = () => login().catch(report)

  // Running as the installed app, there's no browser around it to want back,
  // so use the Power on click (fullscreen needs a user gesture) to go fullscreen.
  const powerOn = () => {
    setPowered(true)
    if (matchMedia('(display-mode: standalone)').matches && !document.fullscreenElement) toggleFullscreen()
  }

  const seek = (ms: number) => {
    log.info('app', 'seek', { ms })
    player.seek(ms)?.catch(report)
  }
  const { track, upNext, paused, contextName } = player.state
  const themeTo = THEME_NAMES[nextTheme(theme)]
  // What's playing, by name if Spotify will tell us, else by kind ("Playlist").
  // Not where the strips came from: the queue fallback is an implementation
  // detail, and it still shows the rest of the playlist.
  const heading = strips.name ?? contextName ?? (strips.source === 'context' ? track?.album : null)
    ?? contextLabel(player.state.contextUri)

  if (settingUp) {
    return (
      <main className="gate">
        <Setup
          onDone={() => { setLoggedIn(false); setNotice(null); setSettingUp(false) }}
          onCancel={getClientId() ? () => setSettingUp(false) : undefined}
        />
      </main>
    )
  }

  if (!loggedIn || !powered) {
    return (
      <main className="gate">
        <div className="gate-card">
          <RecordMark />
          <h1>Turntable</h1>
          <p className="tagline">Your Spotify library, on a record player.</p>
          {notice && <p className="gate-notice">{notice}</p>}
          {!loggedIn ? (
            <>
              <button className="primary" onClick={connect}>Connect Spotify</button>
              <button className="link" onClick={() => setSettingUp(true)}>Use a different Spotify app</button>
            </>
          ) : (
            <>
              <button className="primary" onClick={powerOn}>Power on</button>
              <button className="link" onClick={() => { logout(); setLoggedIn(false) }}>Sign out</button>
            </>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className={`stage ${idle ? 'idle' : ''}`} style={{ backgroundColor: bg }}>
      {/* Blurred album art as room light. Keyed by URL so each new cover fades in. */}
      {track?.artUrl && <div key={track.artUrl} className="backdrop" style={{ backgroundImage: `url(${track.artUrl})` }} />}
      <div className="vignette" />

      <div className="banners">
        {!online && <div className="banner">Offline. Playback will resume when the connection returns.</div>}
        {online && player.status === 'loading' && <div className="banner muted">Connecting to Spotify…</div>}
        {player.error && (
          <div className="banner" onClick={player.clearError} role="status">{player.error}</div>
        )}
        {notice && (
          <div className="banner" onClick={() => setNotice(null)} role="status">{notice}</div>
        )}
      </div>

      {theme === 'jukebox' ? (
        <Jukebox
          track={track}
          paused={paused}
          positionMs={position}
          heading={heading}
          strips={strips.tracks}
          page={shownPage}
          volume={player.volume}
          isFullscreen={isFullscreen}
          neon={neon}
          attract={attract}
          onPage={(p) => setPage(Math.min(Math.max(p, 0), pages - 1))}
          onPlayTrack={playTrack}
          onQueueTrack={queueTrack}
          onClearQueue={clearQueue}
          onToggle={player.togglePlay}
          onPrevious={player.previous}
          onNext={player.next}
          onSeek={seek}
          onVolume={player.setVolume}
          onCrate={() => setCrateOpen(true)}
          onFullscreen={toggleFullscreen}
          nextTheme={themeTo}
          onTheme={toggleTheme}
        />
      ) : theme === 'cd' ? (
        <CdPlayer
          track={track}
          paused={paused}
          positionMs={position}
          heading={heading}
          tracks={strips.tracks}
          volume={player.volume}
          isFullscreen={isFullscreen}
          nextTheme={themeTo}
          onPlayTrack={playTrack}
          onToggle={player.togglePlay}
          onPrevious={player.previous}
          onNext={player.next}
          onSeek={seek}
          onVolume={player.setVolume}
          onCrate={() => setCrateOpen(true)}
          onFullscreen={toggleFullscreen}
          onTheme={toggleTheme}
        />
      ) : theme === 'cassette' ? (
        <Cassette
          track={track}
          paused={paused}
          positionMs={position}
          heading={heading}
          tracks={strips.tracks}
          volume={player.volume}
          isFullscreen={isFullscreen}
          nextTheme={themeTo}
          onToggle={player.togglePlay}
          onPause={player.pause}
          onCue={cue}
          onVolume={player.setVolume}
          onCrate={() => setCrateOpen(true)}
          onFullscreen={toggleFullscreen}
          onTheme={toggleTheme}
        />
      ) : theme === 'winamp' ? (
        <Winamp
          track={track}
          paused={paused}
          positionMs={position}
          heading={heading}
          tracks={strips.tracks}
          volume={player.volume}
          shuffle={player.state.shuffle}
          repeat={player.state.repeat}
          isFullscreen={isFullscreen}
          nextTheme={themeTo}
          onPlayTrack={playTrack}
          onToggle={player.togglePlay}
          onResume={player.resume}
          onStop={stop}
          onPrevious={player.previous}
          onNext={player.next}
          onSeek={seek}
          onVolume={player.setVolume}
          onShuffle={toggleShuffle}
          onRepeat={toggleRepeat}
          onCrate={() => setCrateOpen(true)}
          onFullscreen={toggleFullscreen}
          onTheme={toggleTheme}
        />
      ) : (
        <div className="scene drift">
          <Turntable track={track} paused={paused} positionMs={position} onToggle={player.togglePlay} onSeek={seek}>
            <VuMeter
              trackKey={track ? `${track.name}|${track.artists}` : null}
              playing={!!track && !paused}
              volume={player.volume}
            />
          </Turntable>

          <aside className="info">
            <NowPlaying track={track} upNext={upNext} paused={paused} positionMs={position} onSeek={seek} />
            <Transport
              paused={paused}
              hasTrack={!!track}
              volume={player.volume}
              isFullscreen={isFullscreen}
              onToggle={player.togglePlay}
              onPrevious={player.previous}
              onNext={player.next}
              onVolume={player.setVolume}
              onCrate={() => setCrateOpen(true)}
              onFullscreen={toggleFullscreen}
              nextTheme={themeTo}
              onTheme={toggleTheme}
            />
          </aside>
        </div>
      )}

      <RepoLink />

      {/* Dims the deck behind the crate; clicking it closes the crate. */}
      {crateOpen && <div className="scrim" onClick={() => setCrateOpen(false)} />}
      <Crate open={crateOpen} onPlay={play} onClose={() => setCrateOpen(false)} />
    </main>
  )
}

/** Small record glyph for the start screens. */
function RecordMark() {
  return (
    <svg className="record-mark" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#121012" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" />
      <circle cx="32" cy="32" r="19" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.8" />
      <circle cx="32" cy="32" r="11" fill="var(--accent)" />
      <circle cx="32" cy="32" r="1.8" fill="#121012" />
    </svg>
  )
}
