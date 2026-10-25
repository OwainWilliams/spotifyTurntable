# Spotify Turntable

A fullscreen virtual turntable for a spare screen. Album art spins as the record label, the tonearm tracks progress, and your playlists and saved albums live in a slide-out crate. Audio plays in the browser via Spotify's Web Playback SDK (Premium required).

## Setup

1. Create an app at <https://developer.spotify.com/dashboard>
   - Redirect URI: `http://127.0.0.1:5173/callback`
   - APIs: Web API, Web Playback SDK
2. `cp .env.example .env` and paste your Client ID.
3. `npm install` then `npm run dev`
4. Open <http://127.0.0.1:5173> (not `localhost`, Spotify rejects it).

## Keys

| Key | Action |
|---|---|
| Space | Play / pause |
| ← → | Previous / next track |
| C | Open the crate |
| F | Fullscreen |
| L | Download the debug log |
| Esc | Close the crate |

Click the record to play/pause. Cursor and controls hide after 3 s idle.

## Kiosk mode

Run it on the dedicated screen without browser chrome:

```
chrome --kiosk --app=http://127.0.0.1:5173
```

Later: wrap in Tauri for a proper desktop app and auto-start.

## Layout

```
src/
  spotify/auth.ts        PKCE login, token refresh (no backend, no secret)
  spotify/api.ts         Typed Web API calls: playlists, albums, transfer, play
  player/useSpotifyPlayer.ts   Web Playback SDK wrapped as a React hook
  player/usePosition.ts  rAF clock so the tonearm moves between SDK events
  hooks/                 Fullscreen, wake lock, idle hide, album colour
  components/            Turntable, NowPlaying, Crate
  App.tsx                Wires it together; keyboard shortcuts live here
```

## Notes for the .NET brain

- `useState` = a field whose change re-renders the component.
- `useEffect(fn, [deps])` = run `fn` when `deps` change; the returned function is `Dispose()`.
- `useRef` = a field that does *not* trigger re-render (holds the SDK player instance).
- Vite dev server = `dotnet watch`; `npm run build` = `dotnet publish` into `dist/`.

## Error handling

- `spotify/auth.ts` throws two typed errors: `AuthRequiredError` (log in again) and `NetworkError` (Spotify unreachable). A network blip never logs you out; only a rejected refresh token does. Concurrent refreshes are coalesced so the SDK and API can't race each other.
- `spotify/api.ts` retries 401 (refresh once), 429 (honours `Retry-After`) and 5xx (backoff), with a 10 s timeout per request. `transferPlayback` retries 404 because the device takes a moment to register.
- `player/useSpotifyPlayer.ts` times out if the SDK script never loads, checks `connect()`'s result and listens for `playback_error`. If the device drops mid-session it reconnects with backoff (1 s doubling to 30 s), stopping only on auth, Premium or DRM errors.
- `App.tsx` has one `report()` function that maps thrown errors to UI: auth → back to login, network → "lost contact" banner, anything else → dismissible notice. Offline state shows its own banner.
- `ErrorBoundary` catches render crashes and offers a reload.

## Debugging

`src/lib/log.ts` is a small structured logger. Every auth, API, player and UI failure writes a timestamped entry with a scope (`auth`, `api`, `player`, `app`, `render`, `window`). Entries go to the browser console with a `[turntable:scope]` prefix, and the last 500 are kept in localStorage across reloads.

- Press **L** (or the Log button) to download the log as newline-delimited JSON.
- From devtools: `turntableLog.entries()`, `turntableLog.download()`, `turntableLog.clear()`.
- Uncaught errors and unhandled promise rejections are captured automatically.
- Nothing is sent anywhere; the log never contains tokens.
