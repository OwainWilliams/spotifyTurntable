import { ExternalIcon } from './icons'

const REPO_URL = 'https://github.com/OwainWilliams/spotifyTurntable'

/**
 * "Contribute on GitHub" line along the bottom of the stage, shared by both
 * themes. Fades out with the controls when idle, so the display stays clean.
 *
 * Opens in a new tab: navigating this window away would unload the page and
 * with it the Spotify device, stopping the music.
 */
export function RepoLink() {
  return (
    <a className="repo-link" href={REPO_URL} target="_blank" rel="noreferrer">
      Turntable is open source · Contributions welcome on GitHub <ExternalIcon size={13} />
    </a>
  )
}
