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
  tracks: { total: number }
  owner: { display_name: string }
}

export interface Album {
  id: string
  name: string
  uri: string
  images: Image[]
  artists: { name: string }[]
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

    if (res.ok) return res.status === 204 ? (undefined as T) : ((await res.json()) as T)

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

export const getPlaylists = () => all<Playlist>('/me/playlists?limit=50')

export async function getSavedAlbums(): Promise<Album[]> {
  const items = await all<{ album: Album }>('/me/albums?limit=50')
  return items.map((i) => i.album)
}

// ---- playback --------------------------------------------------------------

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

/** Start a playlist or album (a "context") on the given device. */
export const playContext = (deviceId: string, contextUri: string) =>
  request<void>(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context_uri: contextUri }),
  })
