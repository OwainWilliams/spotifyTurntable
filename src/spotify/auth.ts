/**
 * Authorization Code flow with PKCE.
 *
 * .NET analogy: this is what Microsoft.Identity.Web does for you behind
 * AddMicrosoftIdentityWebApp, except we do it by hand because there is no
 * server. PKCE lets a public client (a browser) prove it started the login
 * without holding a client secret.
 *
 * Flow:
 *   1. login()          -> generate verifier, store it, redirect to Spotify
 *   2. handleCallback() -> swap ?code= for tokens using the stored verifier
 *   3. getAccessToken() -> return a valid token, refreshing if it is stale
 */

import { log } from '../lib/log'

const CLIENT_ID_KEY = 'turntable.clientId'
const ENV_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined

/**
 * Where Spotify sends the browser back after login. Defaults to the app's own
 * root (e.g. https://you.github.io/spotifyTurntable/), because a static host
 * has no page at /callback; the callback is recognised by its query string
 * instead. .env can still override it (the original local setup used /callback).
 */
export const REDIRECT_URI =
  (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string | undefined)
  || new URL(import.meta.env.BASE_URL, window.location.origin).href

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
].join(' ')

// Each person brings their own Spotify app: in Development Mode an app only
// works for its owner and a short allowlist, so a shared ID can't scale.
// Theirs is kept in localStorage; a build-time .env ID is the fallback.
// A client ID isn't a secret under PKCE, so it's fine for it to sit there.

/** The Spotify app this browser logs in with, or null if none is set up. */
export function getClientId(): string | null {
  const saved = localStorage.getItem(CLIENT_ID_KEY)
  if (saved) return saved
  return ENV_CLIENT_ID && ENV_CLIENT_ID !== 'your_client_id_here' ? ENV_CLIENT_ID : null
}

/** Spotify client IDs are 32 hex characters. */
export const isValidClientId = (id: string) => /^[0-9a-f]{32}$/i.test(id)

export function setClientId(id: string) {
  localStorage.setItem(CLIENT_ID_KEY, id.trim())
  logout() // tokens belong to the old app
}

/** Forget the saved ID (falls back to the .env one, if any). */
export function clearClientId() {
  localStorage.removeItem(CLIENT_ID_KEY)
  logout()
}

const STORAGE_KEY = 'turntable.tokens'
const VERIFIER_KEY = 'turntable.verifier'
const STATE_KEY = 'turntable.state'

/** Thrown when the user has to log in again (refresh token revoked/expired). */
export class AuthRequiredError extends Error {
  constructor(msg = 'Sign in to Spotify again') { super(msg); this.name = 'AuthRequiredError' }
}
/** Thrown when the request never reached Spotify (offline, DNS, timeout). */
export class NetworkError extends Error {
  constructor(msg = 'Cannot reach Spotify') { super(msg); this.name = 'NetworkError' }
}

interface StoredTokens {
  accessToken: string
  refreshToken: string
  /** Unix ms when the access token stops working. */
  expiresAt: number
}

// ---- helpers --------------------------------------------------------------

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function loadTokens(): StoredTokens | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as StoredTokens) : null
}

function saveTokens(t: StoredTokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(t))
}

async function exchange(body: Record<string, string>): Promise<StoredTokens> {
  let res: Response
  try {
    res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: getClientId() ?? '', ...body }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    // fetch only throws for network-level problems, never for HTTP errors.
    log.error('auth', `token request (${body.grant_type}) network failure`, e)
    throw new NetworkError((e as Error).message)
  }

  if (res.status === 400 || res.status === 401) {
    // invalid_grant: refresh token revoked or already used. Must log in again.
    log.warn('auth', `token request (${body.grant_type}) rejected`, { status: res.status, body: await res.text().catch(() => '') })
    throw new AuthRequiredError()
  }
  if (!res.ok) {
    log.error('auth', `token request (${body.grant_type}) failed`, { status: res.status })
    throw new Error(`Token request failed: ${res.status}`)
  }
  log.info('auth', `token obtained via ${body.grant_type}`)

  const json = await res.json()
  const previous = loadTokens()
  const tokens: StoredTokens = {
    accessToken: json.access_token,
    // Spotify may omit refresh_token on refresh; keep the old one.
    refreshToken: json.refresh_token ?? previous?.refreshToken ?? '',
    // Refresh one minute early so we never hand out a token about to die.
    expiresAt: Date.now() + (json.expires_in - 60) * 1000,
  }
  saveTokens(tokens)
  return tokens
}

// ---- public API -----------------------------------------------------------

export async function login(): Promise<void> {
  const clientId = getClientId()
  if (!clientId) throw new Error('Set up your Spotify Client ID first.')
  const verifier = randomString(64)
  const challenge = await sha256Base64Url(verifier)
  // `state` is echoed back by Spotify; we check it to block forged callbacks (CSRF).
  const state = randomString(16)
  localStorage.setItem(VERIFIER_KEY, verifier)
  localStorage.setItem(STATE_KEY, state)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

/** True if this page load is Spotify sending us back from login. */
export function isCallback(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.has('state') && (params.has('code') || params.has('error'))
}

/**
 * Call once when isCallback(). Returns true if login completed.
 * Throws with a readable message if Spotify sent an error or the state mismatches.
 */
export async function handleCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const verifier = localStorage.getItem(VERIFIER_KEY)
  const expectedState = localStorage.getItem(STATE_KEY)
  localStorage.removeItem(VERIFIER_KEY)
  localStorage.removeItem(STATE_KEY)
  // Clean the URL first so a refresh never replays the code.
  window.history.replaceState({}, '', import.meta.env.BASE_URL)

  const error = params.get('error')
  if (error) log.warn('auth', 'callback returned error', { error })
  if (error) throw new Error(error === 'access_denied' ? 'Login was cancelled.' : `Spotify login failed: ${error}`)

  const code = params.get('code')
  if (!code || !verifier) return false
  if (params.get('state') !== expectedState) {
    log.error('auth', 'state mismatch on callback')
    throw new Error('Login state mismatch. Try again.')
  }

  await exchange({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  })
  return true
}

// One in-flight refresh at a time. The SDK and the API can both ask for a
// token in the same tick; without this they would both spend the refresh
// token and the second one would fail with invalid_grant.
let refreshing: Promise<StoredTokens> | null = null

/**
 * Returns a usable access token. Throws AuthRequiredError if the user must
 * log in again, NetworkError if Spotify is unreachable. The caller decides
 * what to show; this function never logs the user out on a network blip.
 */
export async function getAccessToken(opts: { force?: boolean } = {}): Promise<string> {
  const tokens = loadTokens()
  if (!tokens) throw new AuthRequiredError()
  if (!opts.force && Date.now() < tokens.expiresAt) return tokens.accessToken

  if (!refreshing) {
    log.debug('auth', opts.force ? 'forced token refresh' : 'token expired, refreshing')
    refreshing = exchange({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken })
      .finally(() => { refreshing = null })
  }
  try {
    return (await refreshing).accessToken
  } catch (e) {
    if (e instanceof AuthRequiredError) logout()
    throw e
  }
}

export function isLoggedIn(): boolean {
  return loadTokens() !== null
}

export function logout() {
  log.info('auth', 'logged out')
  localStorage.removeItem(STORAGE_KEY)
}
