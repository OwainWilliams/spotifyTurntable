/**
 * Wraps the Spotify Web Playback SDK in a React hook.
 *
 * The SDK makes this browser tab a Spotify Connect device. Spotify streams
 * the audio to it; we only see metadata and control messages. Think of it
 * as a SignalR hub client: we subscribe to state_changed events and call a
 * few methods (pause, resume, nextTrack).
 *
 * Lifecycle (.NET analogy: a hosted service with StartAsync/StopAsync):
 *   mount   -> wait for SDK script, create Player, connect()
 *   ready   -> we get a deviceId; caller can transfer playback here
 *   unmount -> disconnect()
 */
import { useEffect, useRef, useState } from 'react'
import { AuthRequiredError, getAccessToken } from '../spotify/auth'
import { log } from '../lib/log'

export interface Track {
  name: string
  artists: string
  album: string
  artUrl: string | null
  durationMs: number
}

export interface PlayerState {
  track: Track | null
  paused: boolean
  /** Position reported by the SDK at `reportedAt`. See usePosition. */
  positionMs: number
  reportedAt: number
}

export type PlayerStatus = 'loading' | 'ready' | 'error'

function toTrack(t: Spotify.Track): Track {
  return {
    name: t.name,
    artists: t.artists.map((a) => a.name).join(', '),
    album: t.album.name,
    artUrl: t.album.images[0]?.url ?? null,
    durationMs: t.duration_ms,
  }
}

/**
 * The SDK script sets this global when it has loaded. Resolve once it has,
 * or reject if it never does (script blocked, offline on first load).
 */
function waitForSdk(timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Spotify) return resolve()
    const timer = setTimeout(
      () => reject(new Error('Spotify player script did not load. Check your connection and reload.')),
      timeoutMs,
    )
    window.onSpotifyWebPlaybackSDKReady = () => { clearTimeout(timer); resolve() }
  })
}

export function useSpotifyPlayer(enabled: boolean) {
  const playerRef = useRef<Spotify.Player | null>(null)
  const [status, setStatus] = useState<PlayerStatus>('loading')
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [state, setState] = useState<PlayerState>({
    track: null,
    paused: true,
    positionMs: 0,
    reportedAt: Date.now(),
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    const fail = (msg: string, data?: unknown) => {
      log.error('player', msg, data)
      setError(msg)
      setStatus('error')
    }

    ;(async () => {
      try {
        await waitForSdk()
      } catch (e) {
        return fail((e as Error).message)
      }
      if (cancelled) return

      const player = new Spotify.Player({
        name: 'Turntable',
        // Called by the SDK whenever it needs a token, including on expiry.
        getOAuthToken: async (cb) => {
          try {
            cb(await getAccessToken())
          } catch (e) {
            // Not calling cb leaves the SDK waiting; tell the UI instead.
            fail(e instanceof AuthRequiredError ? e.message : 'Cannot reach Spotify to refresh the session.', e)
          }
        },
        volume: 0.8,
      })

      player.addListener('ready', ({ device_id }) => {
        log.info('player', 'ready', { deviceId: device_id })
        setDeviceId(device_id)
        setStatus('ready')
      })
      player.addListener('not_ready', ({ device_id }) => {
        log.warn('player', 'device went offline', { deviceId: device_id })
        setStatus('loading')
      })

      player.addListener('player_state_changed', (s) => {
        if (!s) return
        log.debug('player', s.paused ? 'paused' : 'playing', {
          track: s.track_window.current_track?.name,
          position: s.position,
        })
        setState({
          track: toTrack(s.track_window.current_track),
          paused: s.paused,
          positionMs: s.position,
          reportedAt: Date.now(),
        })
      })

      player.addListener('initialization_error', ({ message }) =>
        fail(`Browser cannot run the player (DRM missing?): ${message}`))
      player.addListener('authentication_error', () =>
        fail('Spotify rejected the login. Sign out and try again.'))
      player.addListener('account_error', () =>
        fail('Playback needs Spotify Premium.'))
      // Transient: a track that cannot be played here. Surface it but stay 'ready'.
      player.addListener('playback_error', ({ message }) => {
        log.warn('player', 'playback_error', { message })
        setError(`Playback problem: ${message}`)
      })

      log.info('player', 'connecting')

      const connected = await player.connect()
      if (cancelled) return player.disconnect()
      if (!connected) return fail('Could not connect the player. Reload to try again.')
      playerRef.current = player
    })()

    return () => {
      cancelled = true
      if (playerRef.current) log.info('player', 'disconnecting')
      playerRef.current?.disconnect()
      playerRef.current = null
    }
  }, [enabled])

  return {
    status,
    deviceId,
    error,
    clearError: () => setError(null),
    state,
    togglePlay: () => playerRef.current?.togglePlay(),
    next: () => playerRef.current?.nextTrack(),
    previous: () => playerRef.current?.previousTrack(),
    seek: (ms: number) => playerRef.current?.seek(ms),
  }
}
