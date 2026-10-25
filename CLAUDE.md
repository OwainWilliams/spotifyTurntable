# Spotify Turntable

Personal fullscreen visualiser for a dedicated PC screen: album art spins as the record label, tonearm tracks progress, playlists and saved albums in a slide-out crate. Audio plays in-browser via Spotify Web Playback SDK (Premium account available).

Owner is a senior .NET developer learning React/TS. When explaining changes, prefer the .NET analogy where one exists, and explain *why* rather than just handing over code.

## Stack and constraints

- React 18 + Vite + TypeScript, strict mode, no state library, no CSS framework, no router. Keep it that way; the app is ~700 lines and should stay readable in one sitting.
- Auth is PKCE, fully client-side, no backend. Redirect URI must be `http://127.0.0.1:5173/callback` (Spotify rejects `localhost`).
- Client ID lives in `.env` as `VITE_SPOTIFY_CLIENT_ID` (gitignored). Never commit it.
- Web Playback SDK is loaded via `<script>` in `index.html` and exposes `window.Spotify`; types from `@types/spotify-web-playback-sdk`.
- Pin dependency versions. Spotify's API has removed endpoints with little notice, so treat it as the one external thing that can change underneath us.

## Layout

```
src/lib/log.ts                 structured logger, ring buffer + localStorage, press L to download
src/spotify/auth.ts            PKCE login, coalesced token refresh, AuthRequiredError / NetworkError
src/spotify/api.ts             typed Web API calls with retry policy (401 refresh, 429 Retry-After, 5xx backoff)
src/player/useSpotifyPlayer.ts SDK lifecycle as a hook; returns status, deviceId, state, controls
src/player/usePosition.ts      rAF clock extrapolating position between SDK events
src/hooks/                     useFullscreen, useWakeLock, useIdle, useOnline, useAlbumColour
src/components/                Turntable, VuMeter, NowPlaying, Crate, ErrorBoundary
src/App.tsx                    wiring, keyboard shortcuts, single report() for errors
```

## Decisions already made (don't relitigate without reason)

- Chose React over Blazor: every interesting API (SDK, fullscreen, wake lock, DRM) is browser-native; Blazor would add an interop layer with no benefit.
- Errors funnel to one `report()` in App.tsx. Don't catch deep in components.
- A network failure during token refresh must NOT log the user out; only an `invalid_grant` does.
- The VU meter is SIMULATED, by choice. SDK audio is DRM-protected (Web Audio can't read it) and `/audio-analysis` + `/audio-features` return 403 for apps created after Nov 2024. Each track gets a pseudo-tempo hashed from its name; the rAF loop writes `--level` straight to the DOM rather than React state. Mic/loopback input was offered as the real-beat alternative and declined for now.
- Volume is persisted in localStorage (`turntable.volume`) and applied via the SDK, not the OS.
- Burn-in drift is pure CSS on `.deck`: two `@property` lengths animated on 23 and 17 minute cycles, +/-1vmin. No JS, nothing to clean up. CSS time units are only `s`/`ms`; `23min` silently drops the whole `animation` declaration.
- Disc rotation uses `animation-play-state` so it stops in place rather than snapping.
- `transferPlayback` retries 404 because the SDK device takes a moment to register with Spotify.
- If the SDK device drops mid-session (`not_ready`), `useSpotifyPlayer` reconnects the same `Player` with backoff (1s doubling, capped at 30s, forever) and a 20s deadline per attempt. Auth, Premium and DRM errors stop retrying. A reconnect does not re-transfer playback; pick from the crate to resume.

## Known gotchas

- Browsers require a user gesture before audio; that's what the "Power on" button is for.
- SDK `position` only updates on state change; `usePosition` fills in between.
- The SDK and API can both ask for a token in the same tick; refresh is coalesced to avoid spending the refresh token twice.
- Tonearm drag-to-seek holds the dropped angle until `positionMs` catches up (or 3s), otherwise the arm swings back to the old position before the seek lands.
- Spotify's Feb 2026 Web API changes renamed playlist `tracks` to `items` (and `tracks.track` to `items.item` in playlist contents). `trackCount()` in api.ts reads either. Library lists can contain `null` entries; api.ts filters them. The crate loads playlists and albums with `Promise.allSettled` so one broken endpoint doesn't empty it.
- Album art is square; the circular label crop clips corners. Acceptable for now.

## Not yet built

- Tauri wrapper (borderless fullscreen on a chosen monitor, auto-start). Do the kiosk-mode Chrome check first: `chrome --kiosk --app=http://127.0.0.1:5173`.
- Non-Premium fallback (poll `/me/player/currently-playing`) is out of scope.

## Commands

```
npm install
npm run dev       # http://127.0.0.1:5173
npm run build     # tsc -b && vite build
```
