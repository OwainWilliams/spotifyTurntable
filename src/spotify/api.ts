/**
 * Thin typed wrapper over the Spotify Web API.
 * .NET analogy: a typed HttpClient with a DelegatingHandler that attaches the
 * bearer token. Only the endpoints this app needs are here.
 */
import { getAccessToken, NetworkError } from './auth'
import { log } from '../lib/log'

const BASE = 'https://api.spotify.com/v1'

export interface Image {
  url: string
  width: number | null
  height: number | null
}

export interface Playlist {
  id: string
  name: string
  uri: string
  images: Image[] | null
  /** Track count. Spotify renamed `tracks` to `items` in Feb 2026; read via trackCount(). */
  items?: { total: number } | null
  /** Pre-Feb-2026 name for `items`. */
  tracks?: { total: number } | null
  owner: { display_name: string } | null
}

/** Track count under either the current or the pre-2026 field name. */
export const trackCount = (p: Playlist): number | null => p.items?.total ?? p.tracks?.total ?? null

export interface Album {
  id: string
  name: string
  uri: string
  images: Image[] | null
  artists: { name: string }[] | null
}

interface Page<T> {
  items: T[]
  next: string | null
}

export class SpotifyApiError extends Error {
  constructor(public status: number, msg: string) { super(msg); this.name = 'SpotifyApiError' }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Fetch with the policies Spotify's API needs:
 *   - network failure -> NetworkError (fetch throws; HTTP errors do not)
 *   - 401 once        -> force a token refresh and retry
 *   - 429             -> wait Retry-After seconds and retry
 *   - 502/503/504     -> brief backoff and retry
 * Gives up after `attempts` tries. .NET analogy: a Polly policy on an HttpClient.
 */
async function request<T>(path: string, init: RequestInit = {}, attempts = 3): Promise<T> {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  let forceRefresh = false

  for (let attempt = 1; ; attempt++) {
    const token = await getAccessToken({ force: forceRefresh })
    forceRefresh = false

    let res: Response
    try {
      res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(10_000),
      })
    } catch (e) {
      log.warn('api', `${init.method ?? 'GET'} ${path} network failure (attempt ${attempt}/${attempts})`, e)
      if (attempt >= attempts) throw new NetworkError((e as Error).message)
      await sleep(500 * attempt)
      continue
    }

    if (res.ok) {
      // Some write endpoints (e.g. add to queue) answer 200 with an empty or
      // plain-text body rather than 204, so only parse what claims to be JSON.
      const isJson = res.headers.get('Content-Type')?.includes('json')
      const text = res.status === 204 || !isJson ? '' : await res.text()
      return (text ? JSON.parse(text) : undefined) as T
    }

    const retryable = res.status === 401 || res.status === 429 || res.status >= 502
    if (!retryable || attempt >= attempts) {
      const body = await res.text().catch(() => '')
      log.error('api', `${init.method ?? 'GET'} ${path} -> ${res.status}`, { attempt, body: body.slice(0, 500) })
      throw new SpotifyApiError(res.status, describe(res.status, body))
    }
    log.warn('api', `${init.method ?? 'GET'} ${path} -> ${res.status}, retrying (${attempt}/${attempts})`, {
      retryAfter: res.headers.get('Retry-After'),
    })

    if (res.status === 401) forceRefresh = true
    else if (res.status === 429) await sleep((Number(res.headers.get('Retry-After')) || 1) * 1000)
    else await sleep(500 * attempt)
  }
}

function describe(status: number, body: string): string {
  let reason = ''
  try { reason = JSON.parse(body)?.error?.message ?? '' } catch { /* not JSON */ }
  switch (status) {
    case 403: return reason || 'Spotify refused this action. Premium is required for playback.'
    case 404: return reason || 'Player not found. Try powering on again.'
    default: return reason ? `Spotify: ${reason}` : `Spotify returned ${status}`
  }
}

/** Walks every page of a paged endpoint. Spotify pages are 50 max. */
async function all<T>(firstPath: string): Promise<T[]> {
  const out: T[] = []
  let next: string | null = firstPath
  while (next) {
    const page: Page<T> = await request<Page<T>>(next)
    out.push(...page.items)
    next = page.next
  }
  return out
}

// ---- library ---------------------------------------------------------------

// Spotify can return null entries in these lists (e.g. a playlist that was
// deleted or made private), so filter them out here rather than in every caller.

export async function getPlaylists(): Promise<Playlist[]> {
  const items = await all<Playlist | null>('/me/playlists?limit=50')
  return items.filter((p): p is Playlist => p != null)
}

export async function getSavedAlbums(): Promise<Album[]> {
  const items = await all<{ album: Album | null } | null>('/me/albums?limit=50')
  return items.map((i) => i?.album).filter((a): a is Album => a != null)
}

// ---- playback --------------------------------------------------------------

/** IDs come from Spotify, but escape them anyway so nothing can reshape a URL. */
const enc = encodeURIComponent

/**
 * Make our SDK player the active Spotify Connect device.
 * Spotify can 404 for a second or two after the SDK says 'ready' because the
 * device has not propagated yet, so we retry that case specifically.
 */
export async function transferPlayback(deviceId: string, play = false): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await request<void>('/me/player', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [deviceId], play }),
      })
    } catch (e) {
      if (e instanceof SpotifyApiError && e.status === 404 && attempt < 5) {
        log.debug('api', `device ${deviceId} not registered yet, retry ${attempt}/5`)
        await sleep(1000)
        continue
      }
      throw e
    }
  }
}

/**
 * Start a playlist or album (a "context") on the given device, optionally at
 * a given track and position. With no context, plays just that track.
 * Starting playback also empties the user's queue, which is how clearQueue works.
 */
export const playContext = (deviceId: string, contextUri: string | null, trackUri?: string, positionMs?: number) =>
  request<void>(`/me/player/play?device_id=${enc(deviceId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(contextUri
        ? { context_uri: contextUri, ...(trackUri ? { offset: { uri: trackUri } } : {}) }
        : { uris: [trackUri] }),
      ...(positionMs ? { position_ms: Math.round(positionMs) } : {}),
    }),
  })

/** Add a track to the end of Spotify's queue (it can't be removed again via the API). */
export const addToQueue = (deviceId: string, trackUri: string) =>
  request<void>(`/me/player/queue?uri=${enc(trackUri)}&device_id=${enc(deviceId)}`, { method: 'POST' })

export const setShuffle = (deviceId: string, on: boolean) =>
  request<void>(`/me/player/shuffle?state=${on}&device_id=${enc(deviceId)}`, { method: 'PUT' })

export const setRepeat = (deviceId: string, mode: 'off' | 'context' | 'track') =>
  request<void>(`/me/player/repeat?state=${mode}&device_id=${enc(deviceId)}`, { method: 'PUT' })

// ---- context contents (jukebox title strips) -------------------------------

export interface ContextTrack {
  uri: string
  name: string
  artists: string
  /** Lets the cassette lay the tracks end to end as one tape. */
  durationMs: number
}

interface ApiTrack {
  type?: string
  uri: string
  name: string
  artists: { name: string }[] | null
  duration_ms?: number
}

const toContextTrack = (t: ApiTrack): ContextTrack => ({
  uri: t.uri,
  name: t.name,
  artists: t.artists?.map((a) => a.name).join(', ') ?? '',
  durationMs: t.duration_ms ?? 0,
})

/** Episodes and local files can't be offered as strips; nulls are removed tracks. */
const isTrack = (t: ApiTrack | null | undefined): t is ApiTrack =>
  t != null && (t.type ?? 'track') === 'track' && t.uri.startsWith('spotify:track:')

/**
 * 8 pages of 18 jukebox strips. That is where the selection codes run out
 * (24 letters x 6), and it keeps a 2,000-track playlist to 3 requests.
 */
const MAX_CONTEXT_TRACKS = 144

/** Like all(), but stops after `max` items. */
async function upTo<T>(firstPath: string, max: number): Promise<T[]> {
  const out: T[] = []
  let next: string | null = firstPath
  while (next && out.length < max) {
    const page: Page<T> = await request<Page<T>>(next)
    out.push(...page.items)
    next = page.next
  }
  return out.slice(0, max)
}

/**
 * The tracks of an album, playlist or Liked Songs, in play order.
 * Since Feb 2026, playlist contents are only readable for playlists the user
 * owns or collaborates on; others fail with 403 and the caller falls back to
 * the queue. Contents of a playlist use `item` (pre-2026: `track`).
 */
export async function getContextTracks(contextUri: string): Promise<ContextTrack[]> {
  const [, kind, id] = contextUri.split(':')
  let tracks: (ApiTrack | null | undefined)[]
  if (kind === 'album') {
    tracks = await upTo<ApiTrack>(`/albums/${enc(id)}/tracks?limit=50`, MAX_CONTEXT_TRACKS)
  } else if (kind === 'playlist') {
    const rows = await upTo<{ item?: ApiTrack | null; track?: ApiTrack | null } | null>(
      `/playlists/${enc(id)}/items?limit=50`, MAX_CONTEXT_TRACKS)
    tracks = rows.map((r) => r?.item ?? r?.track)
  } else if (contextUri.endsWith(':collection')) {
    const rows = await upTo<{ track: ApiTrack | null } | null>('/me/tracks?limit=50', MAX_CONTEXT_TRACKS)
    tracks = rows.map((r) => r?.track)
  } else {
    throw new SpotifyApiError(404, `Can't list the contents of ${kind ?? 'this context'}`)
  }
  return tracks.filter(isTrack).map(toContextTrack)
}

/**
 * Display name of an album or playlist. A playlist's name is readable even
 * when its contents aren't (see getContextTracks).
 */
export async function getContextName(contextUri: string): Promise<string | null> {
  const [, kind, id] = contextUri.split(':')
  if (kind === 'playlist') return (await request<{ name: string }>(`/playlists/${enc(id)}?fields=name`)).name
  if (kind === 'album') return (await request<{ name: string }>(`/albums/${enc(id)}`)).name
  if (kind === 'artist') return (await request<{ name: string }>(`/artists/${enc(id)}`)).name
  if (contextUri.endsWith(':collection')) return 'Liked Songs'
  return null
}

/** What's playing now followed by what Spotify will play next (about 20 tracks). */
export async function getQueue(): Promise<ContextTrack[]> {
  const q = await request<{ currently_playing: ApiTrack | null; queue: (ApiTrack | null)[] } | undefined>(
    '/me/player/queue')
  if (!q) return []
  return [q.currently_playing, ...q.queue].filter(isTrack).map(toContextTrack)
}
