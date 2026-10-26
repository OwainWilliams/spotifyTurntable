/** A generic name for a context whose real name we couldn't get. */
export function contextLabel(uri: string | null): string {
  if (uri?.endsWith(':collection')) return 'Liked Songs'
  switch (uri?.split(':')[1]) {
    case 'playlist': return 'Playlist'
    case 'album': return 'Album'
    case 'artist': return 'Artist'
    default: return 'Up next' // no context: the strips really are the queue
  }
}
