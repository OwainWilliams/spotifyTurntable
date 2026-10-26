import { useEffect, useRef, useState } from 'react'
import { getContextName, getContextTracks, getQueue, SpotifyApiError, type ContextTrack } from '../spotify/api'
import { log } from '../lib/log'

export type StripSource = 'context' | 'queue'

/**
 * The tracks to show on the jukebox's title strips.
 *
 * Prefers the whole album/playlist (fetched once per context, then cached).
 * Spotify only lets this app read playlists the user owns or collaborates on,
 * so for anything else (or a lone track) it shows the queue instead, refreshed
 * on every track change because the queue moves as you play.
 *
 * Errors are returned, not shown, so App can route them through report().
 * .NET analogy: a small read-through cache (IMemoryCache) with a fallback source.
 */
export function useContextTracks(
  contextUri: string | null,
  trackUri: string | null,
  enabled: boolean,
  /** Change to refetch now (e.g. after adding to the queue). */
  refresh = 0,
) {
  /** Per context: its tracks, or 'unlistable' once Spotify has refused it. */
  const cache = useRef(new Map<string, ContextTrack[] | 'unlistable'>())
  const [tracks, setTracks] = useState<ContextTrack[]>([])
  const [source, setSource] = useState<StripSource>('queue')
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!enabled || !trackUri) return
    // Ignore a slow response that lands after the track or context changed.
    let cancelled = false
    const show = (list: ContextTrack[], from: StripSource) => {
      if (cancelled) return
      setTracks(list)
      setSource(from)
      setError(null)
    }

    ;(async () => {
      const cached = contextUri ? cache.current.get(contextUri) : 'unlistable'
      if (Array.isArray(cached)) return show(cached, 'context')

      if (contextUri && cached === undefined) {
        try {
          const list = await getContextTracks(contextUri)
          cache.current.set(contextUri, list)
          return show(list, 'context')
        } catch (e) {
          // 403: a playlist we don't own. 404: a context kind we can't list.
          if (!(e instanceof SpotifyApiError && (e.status === 403 || e.status === 404))) {
            if (!cancelled) setError(e)
            return
          }
          log.warn('strips', 'context not listable, showing the queue', { contextUri, status: e.status })
          cache.current.set(contextUri, 'unlistable')
        }
      }

      // The SDK tells us about a new track before Spotify's servers catch up,
      // and until they do the queue comes back empty or still on the old
      // track. So only accept a queue that starts with the track we're
      // playing; otherwise wait and ask again (1s, 2s, 3s, then give up).
      try {
        for (let attempt = 0; ; attempt++) {
          const queue = await getQueue()
          if (cancelled) return
          const current = queue[0]?.uri === trackUri
          log.debug('strips', 'queue', { attempt, length: queue.length, current })
          if (current || attempt >= 3) return show(queue, 'queue')
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
          if (cancelled) return
        }
      } catch (e) {
        if (!cancelled) setError(e)
      }
    })()

    return () => { cancelled = true }
  }, [enabled, contextUri, trackUri, refresh])

  // The marquee's name for the context. The SDK's context metadata often has
  // no name, so look it up once per context. Cosmetic, so a failure is only
  // logged: the marquee just shows less.
  const names = useRef(new Map<string, string | null>())
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled || !contextUri) return setName(null)
    if (names.current.has(contextUri)) return setName(names.current.get(contextUri)!)
    let cancelled = false
    setName(null)
    getContextName(contextUri)
      .then((n) => {
        names.current.set(contextUri, n)
        if (!cancelled) setName(n)
      })
      .catch((e) => log.warn('strips', 'context name lookup failed', { contextUri, e }))
    return () => { cancelled = true }
  }, [enabled, contextUri])

  return { tracks, source, name, error }
}
