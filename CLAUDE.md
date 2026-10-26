# Spotify Turntable

Personal fullscreen visualiser for a dedicated PC screen: album art spins as the record label, tonearm tracks progress, playlists and saved albums in a slide-out crate. A second theme (T to switch) draws the same player as a title-strip jukebox. Audio plays in-browser via Spotify Web Playback SDK (Premium account available).

Owner is a senior .NET developer learning React/TS. When explaining changes, prefer the .NET analogy where one exists, and explain *why* rather than just handing over code.

## Stack and constraints

- React 18 + Vite 8 + TypeScript 5.9, strict mode, no state library, no CSS framework, no router. Keep it that way; the app is ~1,000 lines and should stay readable in one sitting.
- Auth is PKCE, fully client-side, no backend. Redirect URI defaults to the app's own root URL (e.g. `http://127.0.0.1:4545/`, or the Pages URL); the callback is detected by `?code`/`?error` + `state`, not by path, because static hosts 404 on `/callback`. `VITE_SPOTIFY_REDIRECT_URI` overrides it (the owner's local setup still uses `/callback`). Spotify rejects `localhost`; use 127.0.0.1.
- Bring your own Client ID: Dev Mode apps only work for their owner plus a small allowlist, and Extended Quota is business-only, so each user creates their own Spotify app. First run shows `Setup` and stores the ID in localStorage (`turntable.clientId`); `.env`'s `VITE_SPOTIFY_CLIENT_ID` is the fallback. Never commit `.env`, and never set a Client ID in the Pages build.
- `vite.config.ts` reads `BASE_PATH` (the Pages workflow sets `/<repo>/`); keep asset and manifest URLs relative or base-aware.
- Web Playback SDK is loaded via `<script>` in `index.html` and exposes `window.Spotify`; types from `@types/spotify-web-playback-sdk`.
- Pin dependency versions (exact, no ^). Spotify's API has removed endpoints with little notice, so treat it as the one external thing that can change underneath us. GitHub Actions are pinned to commit SHAs with the tag in a comment. Dependabot proposes updates weekly (7-day cooldown).
- `npm run check` (lint + tests + build) must pass; CI runs it on PRs and before every Pages deploy.

## Layout

```
src/lib/log.ts                 structured logger, ring buffer + localStorage, press L to download
src/lib/clock.ts               ms -> "m:ss"
src/lib/contextLabel.ts        fallback marquee label ("Playlist", "Up next"...)
src/**/*.test.ts               Vitest unit tests for the pure helpers and auth's storage/callback logic
src/spotify/auth.ts            PKCE login, coalesced token refresh, AuthRequiredError / NetworkError
src/spotify/api.ts             typed Web API calls with retry policy (401 refresh, 429 Retry-After, 5xx backoff)
src/player/useSpotifyPlayer.ts SDK lifecycle as a hook; returns status, deviceId, state (incl. contextUri), controls
src/player/usePosition.ts      rAF clock extrapolating position between SDK events
src/player/useContextTracks.ts jukebox strip list: whole album/playlist, else the queue
src/hooks/                     useFullscreen, useWakeLock, useIdle, useOnline, useAlbumColour (background + neon), useTheme, useAttract
src/components/                Setup (first-run Client ID), Turntable, VuMeter, NowPlaying (track info + progress), Transport (buttons/volume), Jukebox (whole jukebox theme), Crate, ErrorBoundary, icons (inline SVG)
src/assets/walnut.svg          generated wood grain (SVG noise filters) for the plinth
src/styles.css                 all styling; deck internals in cqw
src/App.tsx                    wiring, keyboard shortcuts, single report() for errors
public/                        web app manifest + icons (icons drawn by scripts/make-icons.py, needs Pillow)
scripts/turntable.ps1          desktop launcher: ensures `vite preview` is up on 4545, opens a Chrome --app window
scripts/startup.ps1            adds/removes a Startup-folder shortcut to the launcher
.github/workflows/pages.yml    lint + test, builds with BASE_PATH=/<repo>/, deploys to GitHub Pages on push to main
.github/workflows/ci.yml       lint + test + build on pull requests
.github/dependabot.yml         weekly npm + Actions update PRs
eslint.config.js               flat config: recommended + typescript-eslint + react-hooks (incl. React Compiler rules)
docs/                          README screenshots
```

## Decisions already made (don't relitigate without reason)

- Chose React over Blazor: every interesting API (SDK, fullscreen, wake lock, DRM) is browser-native; Blazor would add an interop layer with no benefit.
- Errors funnel to one `report()` in App.tsx. Don't catch deep in components.
- A network failure during token refresh must NOT log the user out; only an `invalid_grant` does.
- The VU meter is SIMULATED, by choice. SDK audio is DRM-protected (Web Audio can't read it) and `/audio-analysis` + `/audio-features` return 403 for apps created after Nov 2024. Each track gets a pseudo-tempo hashed from its name; the rAF loop writes `--level` straight to the DOM rather than React state. Mic/loopback input was offered as the real-beat alternative and declined for now.
- Volume is persisted in localStorage (`turntable.volume`) and applied via the SDK, not the OS.
- Two themes, turntable and jukebox, persisted in localStorage (`turntable.theme`), toggled with T or the button beside Crate. The jukebox is mockup B from the design canvas (https://claude.ai/artifact/KC1qcNnTkauP37qQ4uJBTg). Backdrop, banners and crate are shared; only the machine swaps.
- Jukebox strips: 18 per page, codes A1-C6 on page 1, D1-F6 on page 2, skipping I and O as real jukeboxes did. 24 letters give 8 pages, so `getContextTracks` caps at 144. Clicking a strip plays the context with `offset: { uri }`, or, with the Queue key lit (persisted as `turntable.queueMode`), adds it to Spotify's queue. Queue badges are the jukebox's own record of what it added: the API can't list or remove queue entries reliably. The Clear key empties the queue by replaying the current track at its current position (`PUT /me/player/play` drops the user queue; there's no clear endpoint), re-pausing if it was paused.
- Jukebox neon (`--neon`) is the album art's most vivid pixel at fixed saturation/lightness (`useAlbumColour`), falling back to pink for grey covers. It's a registered `@property <color>` so it fades between records.
- Jukebox attract mode (`useAttract`): paused + no input for 2 min starts a chase light and auto-paging, and holds the wake lock; 30 min later it dims to "asleep" and releases the lock so the screen can sleep.
- Burn-in drift is pure CSS on `.drift` (the turntable's `.scene` and the jukebox both use it): two `@property` lengths animated on 23 and 17 minute cycles, +/-1vmin. No JS, nothing to clean up. CSS time units are only `s`/`ms`; `23min` silently drops the whole `animation` declaration.
- Disc rotation uses `animation-play-state` so it stops in place rather than snapping.
- `transferPlayback` retries 404 because the SDK device takes a moment to register with Spotify.
- If the SDK device drops mid-session (`not_ready`), `useSpotifyPlayer` reconnects the same `Player` with backoff (1s doubling, capped at 30s, forever) and a 20s deadline per attempt. Auth, Premium and DRM errors stop retrying. A reconnect does not re-transfer playback; pick from the crate to resume.

- Packaged as an installable Chrome app (manifest + `npm run app` launcher), not Tauri: the SDK needs Widevine, which WebView2 lacks; castLabs' Electron build is the fallback if a real installer is ever wanted. No service worker: the app is useless offline anyway, and a cache would only serve stale builds. `launch_handler: focus-existing` because a second window would be a second Spotify device fighting the first.

- Content-Security-Policy is a `<meta>` (Pages can't send headers), injected at build time by the plugin in vite.config.ts at the `<!-- csp: -->` marker in index.html, right after `<meta charset>`. Build only, because the dev server needs inline scripts and a websocket. Inline scripts are allowed by hash, computed at build. Allowed: `sdk.scdn.co` (script + frame), `api.spotify.com` / `accounts.spotify.com` (connect), Spotify image hosts (img). Verified against real playback, the crate and both themes; a new external host needs adding there.
- Lint: `react-hooks/set-state-in-effect` is suppressed line by line, each with a reason, only where the effect copies an outside source (SDK, browser, network) into state. Prefer deriving during render (see `useAttract`, the jukebox's pending letter, `useContextTracks`' name cache).

## Known gotchas

- Browsers require a user gesture before audio; that's what the "Power on" button is for.
- SDK `position` only updates on state change; `usePosition` fills in between.
- The SDK and API can both ask for a token in the same tick; refresh is coalesced to avoid spending the refresh token twice.
- Tonearm drag-to-seek holds the dropped angle until `positionMs` catches up (or 3s), otherwise the arm swings back to the old position before the seek lands.
- Since Feb 2026, `GET /playlists/{id}/items` only works for playlists the user owns or collaborates on (403 otherwise). The jukebox falls back to `/me/player/queue` for followed playlists; the marquee still shows the playlist, not "Queue" (the fallback is an implementation detail). The name comes from `getContextName` (the SDK's context name is often empty), falling back to a kind label like "Playlist" when even that fails (e.g. Spotify-owned playlists). Playing with `offset` still works for them.
- Spotify's Feb 2026 Web API changes renamed playlist `tracks` to `items` (and `tracks.track` to `items.item` in playlist contents). `trackCount()` in api.ts reads either. Library lists can contain `null` entries; api.ts filters them. The crate loads playlists and albums with `Promise.allSettled` so one broken endpoint doesn't empty it.
- The deck is drawn in cqw (container query units, `.deck` is the container): plinth 100 x 76, spindle (37, 38), record r 32.5, arm pivot (82, 14), arm 52.5. `LEAD_IN`/`RUN_OUT` in Turntable.tsx (27/47 deg) were solved for that geometry; change one, re-solve the other.
- Only `.disc` rotates. Light reflections (`.sheen`) are a separate static layer above it, like a real lamp.
- `radial-gradient(circle, ...)` sizes to the farthest corner, so percentages overshoot the visible circle by ~41%. Use `circle closest-side` for anything measured as % of a radius (masks, rings).
- Groove rings finer than ~2px alias into moire; keep `repeating-radial-gradient` pitch >= 0.4cqw with soft edges.
- `.stage` is `overflow: clip`, not `hidden`, and the crate focuses its search with `preventScroll`: hidden containers can still be scrolled by focus(), which slid the whole display sideways when the crate opened.
- The App keyboard listener subscribes once and reads `player` through a ref. Re-subscribing per render dropped the first key after idle (React swapped the listener mid-dispatch).
- Fonts are bundled (`@fontsource`, pinned) so kiosk mode renders correctly offline: Instrument Serif for titles, Inter for UI, Monoton (neon marquee) and Courier Prime (title strips) for the jukebox.
- The Log button was removed from the UI; L still downloads the log, and the crash screen still offers it.
- Album art is square; the circular label crop clips corners. Acceptable for now.

- npm 10.9 (Node 22's bundled npm) crashes with `Cannot read properties of null (reading 'edgesOut')` when resolving Vitest's peer dependencies. Change dependencies with `npx npm@11.6.2 install ...`; plain `npm ci` (what CI runs) is fine with the resulting lockfile.
- The CSP hash of an inline script must be computed on LF line endings: browsers normalise CRLF before hashing, and files edited on Windows can be CRLF. The plugin normalises; keep it that way.

## Not yet built

- Jukebox portrait layout (it letterboxes at 16:9) and beat-linked jukebox lighting (VuMeter's `--level` trick would do it).
- Non-Premium fallback (poll `/me/player/currently-playing`) is out of scope.

## Commands

```
npm install
npm run dev       # http://127.0.0.1:4545
npm run build     # tsc -b && vite build (adds the CSP)
npm run lint      # eslint .
npm test          # vitest run
npm run check     # lint + test + build, as CI does
npm run app       # build, serve on 4545 in the background, open the Chrome app window
npm run app:startup [-- -Remove]   # start it at Windows sign-in
```
