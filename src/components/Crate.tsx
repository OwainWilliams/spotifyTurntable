import { useEffect, useState } from 'react'
import { getPlaylists, getSavedAlbums, type Album, type Playlist } from '../spotify/api'
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

/**
 * The record crate: a slide-in list of your playlists and saved albums.
 * Loaded lazily the first time it opens, then cached for the session.
 */
export function Crate({ open, onPlay, onClose }: Props) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    Promise.all([getPlaylists(), getSavedAlbums()])
      .then(([playlists, albums]) =>
        setItems([
          ...playlists.map((p: Playlist) => ({
            uri: p.uri,
            name: p.name,
            sub: `${p.tracks.total} tracks`,
            art: p.images?.[0]?.url ?? null,
          })),
          ...albums.map((a: Album) => ({
            uri: a.uri,
            name: a.name,
            sub: a.artists.map((x) => x.name).join(', '),
            art: a.images[0]?.url ?? null,
          })),
        ]),
      )
      .catch((e: Error) => { log.error('crate', 'library load failed', e); setError(e.message) })
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
      {error && (
        <p className="muted">
          Could not load your library: {error} <button className="link" onClick={load}>Retry</button>
        </p>
      )}
      {!items && !error && <p className="muted">Loading…</p>}
      {items && (
        <ul>
          {items.map((i) => (
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
