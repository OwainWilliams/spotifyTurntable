import { useState, type FormEvent } from 'react'
import { REDIRECT_URI, isValidClientId, setClientId } from '../spotify/auth'

interface Props {
  /** Called once a valid ID is saved. */
  onDone: () => void
  /** Present when there's already an ID to go back to. */
  onCancel?: () => void
}

/**
 * First-run setup: walks someone through making their own Spotify app and
 * takes its Client ID. Needed because a Development Mode Spotify app only
 * works for its owner and a handful of allowlisted people.
 */
export function Setup({ onDone, onCancel }: Props) {
  const [id, setId] = useState('')
  const [copied, setCopied] = useState(false)
  const valid = isValidClientId(id.trim())

  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setClientId(id)
    onDone()
  }

  const copy = () => {
    navigator.clipboard.writeText(REDIRECT_URI)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
      .catch(() => { /* clipboard blocked; the URI is selectable */ })
  }

  return (
    <form className="setup" onSubmit={save}>
      <h2>Connect your own Spotify app</h2>
      <p className="setup-lede">
        Turntable plays through your Spotify Premium account using an app you create (free, about two minutes).
      </p>
      <ol>
        <li>
          Open the <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">Spotify Developer Dashboard</a> and
          choose <b>Create app</b>. Any name and description will do.
        </li>
        <li>
          Add this <b>Redirect URI</b>:
          <span className="setup-uri">
            <code>{REDIRECT_URI}</code>
            <button type="button" className="link" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </span>
        </li>
        <li>Under <b>APIs used</b>, tick <b>Web API</b> and <b>Web Playback SDK</b>, then save.</li>
        <li>Copy the app's <b>Client ID</b> from its settings and paste it here:</li>
      </ol>
      <input
        className="setup-input"
        value={id}
        onChange={(e) => setId(e.target.value)}
        placeholder="32-character Client ID"
        spellCheck={false}
        autoComplete="off"
        aria-invalid={id.trim() !== '' && !valid}
      />
      {id.trim() !== '' && !valid && <p className="gate-notice">That doesn't look like a Client ID (32 letters and digits).</p>}
      <button className="primary" disabled={!valid}>Save</button>
      {onCancel && <button type="button" className="link" onClick={onCancel}>Cancel</button>}
      <p className="setup-note">The ID is stored only in this browser. Nothing is sent anywhere except Spotify.</p>
    </form>
  )
}
