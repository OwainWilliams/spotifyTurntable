import { useEffect, useMemo, useRef, useState } from 'react'
import { getPlaylists, getSavedAlbums, trackCount, type Album, type Playlist } from '../spotify/api'
import { log } from '../lib/log'

interface Props {
  open: boolean
  onPlay: (uri: string) => void
  onClose: () => void
}

interface Item {
  uri: string
  name: string
  sub: string
  art: string | null
}

/** Lowercase and strip accents, so "beyonce" finds "Beyoncé". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/**
 * The record crate: a slide-in list of your playlists and saved albums.
 * Loaded lazily the first time it opens, then cached for the session.
 * The search box filters what's already loaded (name, artist), so it's
 * instant and costs no API calls.
 */
export function Crate({ open, onPlay, onClose }: Props) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Every word must appear somewhere in the name or subtitle, in any order.
  // .NET analogy: a LINQ Where over an in-memory list, memoised so it only
  // re-runs when the list or the query changes.
  const shown = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean)
    if (!items || !words.length) return items
    return items.filter((i) => {
      const text = fold(`${i.name} ${i.sub}`)
      return words.every((w) => text.includes(w))
    })
  }, [items, query])

  // Focus the search box on open. Deferred with setTimeout so the key that
  // opened the crate ("C") doesn't get typed into it. On close, clear it and
  // release focus: App ignores keys typed into inputs, so a focused hidden
  // box would swallow every shortcut.
  useEffect(() => {
    if (!open) {
      setQuery('')
      searchRef.current?.blur()
      return
    }
    const timer = setTimeout(() => searchRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [open])

  /**
   * Playlists and albums load independently (allSettled, not all), so if
   * Spotify breaks one endpoint the other still fills the crate.
   * .NET analogy: Task.WhenAll but inspecting each task instead of throwing.
   */
  const load = () => {
    setError(null)
    Promise.allSettled([getPlaylists(), getSavedAlbums()]).then(([playlists, albums]) => {
      const failed = [playlists, albums].filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      failed.forEach((r) => log.error('crate', 'library load failed', r.reason))
      if (failed.length) setError((failed[0].reason as Error).message)
      if (failed.length === 2) return

      setItems([
        ...(playlists.status === 'fulfilled' ? playlists.value : []).map((p: Playlist) => {
          const count = trackCount(p)
          return {
            uri: p.uri,
            name: p.name,
            sub: count === null ? 'Playlist' : `${count} tracks`,
            art: p.images?.[0]?.url ?? null,
          }
        }),
        ...(albums.status === 'fulfilled' ? albums.value : []).map((a: Album) => ({
          uri: a.uri,
          name: a.name,
          sub: a.artists?.map((x) => x.name).join(', ') ?? '',
          art: a.images?.[0]?.url ?? null,
        })),
      ])
    })
  }

  useEffect(() => {
    if (open && !items && !error) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items, error])

  return (
    <aside className={`crate ${open ? 'open' : ''}`} aria-hidden={!open}>
      <header>
        <span>Crate</span>
        <button onClick={onClose} aria-label="Close crate">×</button>
      </header>
      <input
        ref={searchRef}
        className="crate-search"
        type="search"
        placeholder="Search playlists and albums"
        aria-label="Search the crate"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Enter plays the top match; Esc clears the search, then closes.
          if (e.key === 'Enter' && shown?.[0]) onPlay(shown[0].uri)
          if (e.key === 'Escape') {
            e.preventDefault()
            if (query) setQuery('')
            else onClose()
          }
        }}
      />
      {error && (
        <p className="muted">
          Could not load your library: {error} <button className="link" onClick={load}>Retry</button>
        </p>
      )}
      {!items && !error && <p className="muted">Loading…</p>}
      {shown && !shown.length && <p className="muted">Nothing matches “{query.trim()}”.</p>}
      {shown && (
        <ul>
          {shown.map((i) => (
            <li key={i.uri}>
              <button onClick={() => onPlay(i.uri)}>
                {i.art ? <img src={i.art} alt="" /> : <span className="no-art" />}
                <span>
                  <strong>{i.name}</strong>
                  <small>{i.sub}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
