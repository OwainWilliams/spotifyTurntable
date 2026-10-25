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

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string
const REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string

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
      body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
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
  if (!CLIENT_ID || CLIENT_ID === 'your_client_id_here') {
    throw new Error('VITE_SPOTIFY_CLIENT_ID is not set. Copy .env.example to .env.')
  }
  const verifier = randomString(64)
  const challenge = await sha256Base64Url(verifier)
  // `state` is echoed back by Spotify; we check it to block forged callbacks (CSRF).
  const state = randomString(16)
  localStorage.setItem(VERIFIER_KEY, verifier)
  localStorage.setItem(STATE_KEY, state)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })
  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

/**
 * Call once on /callback. Returns true if login completed.
 * Throws with a readable message if Spotify sent an error or the state mismatches.
 */
export async function handleCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const verifier = localStorage.getItem(VERIFIER_KEY)
  const expectedState = localStorage.getItem(STATE_KEY)
  localStorage.removeItem(VERIFIER_KEY)
  localStorage.removeItem(STATE_KEY)
  // Clean the URL first so a refresh never replays the code.
  window.history.replaceState({}, '', '/')

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
