import type { Track } from '../player/useSpotifyPlayer'

export function NowPlaying({ track }: { track: Track | null }) {
  if (!track) return <div className="now-playing muted">Pick something from the crate</div>
  return (
    <div className="now-playing">
      <div className="title">{track.name}</div>
      <div className="muted">{track.artists}</div>
      <div className="muted">{track.album}</div>
    </div>
  )
}
