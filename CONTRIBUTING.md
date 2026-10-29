# Contributing to Turntable

Thanks for taking a look. Bug reports, ideas and pull requests are all welcome, whether it's a one-line fix or a new feature.

## Ways to help

- **Report a bug** or **suggest an idea**: open an issue. For bugs, the debug log helps a lot (see [Reporting a bug](#reporting-a-bug)).
- **Fix something small**: typos, styling glitches and clear bugs can go straight to a pull request.
- **Build something bigger**: please open an issue first so we can agree on the approach before you put time in. Open ideas include:
  - portrait layouts for the jukebox, CD player, cassette deck and Winamp (they letterbox today)
  - jukebox lighting that pulses with the (simulated) beat, reusing the VU meter's `--level` trick

## Getting set up

You'll need:

- **Node 22** (what CI uses) and npm
- **Chrome** (or another Chromium browser). Spotify's player needs Widevine DRM.
- **Spotify Premium**, to actually play music
- **Your own Spotify developer app** (free). Spotify only lets an app in Development Mode be used by its owner and a few allowlisted people, so everyone brings their own.

Then:

```
npm install
npm run dev
```

Open <http://127.0.0.1:4545>. Use `127.0.0.1`, not `localhost`: Spotify rejects `localhost` redirects. On first run the setup screen walks you through creating the Spotify app, shows the redirect URI to register (`http://127.0.0.1:4545/`), and stores your Client ID in the browser. Optionally put it in `.env` instead (see `.env.example`).

**Never commit `.env` or a Client ID.** `.env` is gitignored; keep it that way.

## Before you open a pull request

Run the same checks CI runs:

```
npm run check   # ESLint, Vitest unit tests, type check + production build
```

CI runs these on every pull request. It has no secrets and deploys nothing, so it's safe for forks.

Then:

- **Keep it focused.** One change per pull request is easier to review and to revert.
- **Say what and why** in the description, and how you tested it.
- **Include screenshots for visual changes**, of each theme (press T to cycle) if the change touches anything they share: backdrop, banners, crate or the bottom link. Check a small screen (around 1366×768) as well as 1080p.
- **Add a test** if you change one of the pure helpers in `src/lib/` or the storage and callback logic in `src/spotify/auth.ts`. Tests are in `src/lib/helpers.test.ts` and `src/spotify/auth.test.ts` (Vitest).

## How the project is put together

`README.md` has the layout and an overview of error handling. `CLAUDE.md` holds the detailed design decisions and known gotchas. It's written for AI coding assistants, but it's the best map of *why* things are the way they are, so it's worth a read before a larger change.

The ground rules:

- **Stay small and dependency-light.** React 18, Vite and TypeScript (strict), with no state library, no CSS framework and no router. The whole app should stay readable in one sitting.
- **Pin dependency versions exactly** (no `^` or `~`). GitHub Actions are pinned to commit SHAs. Dependabot proposes updates weekly. To change dependencies, use `npx npm@11.6.2 install ...`: Node 22's bundled npm 10.9 crashes resolving Vitest's peer dependencies.
- **Errors go to one place.** Throw, and let `report()` in `App.tsx` decide what the user sees. Don't catch and display errors deep in components.
- **New external hosts need adding to the Content-Security-Policy** in `vite.config.ts`. The policy only applies to production builds, so test with `npm run build && npm run preview` too, not just `npm run dev`.
- **It's a display that runs for hours.** Things that stay on screen should fade when idle or drift, so they don't burn into an OLED. Anything that animates every frame should avoid re-rendering React (see how `VuMeter` writes a CSS variable instead).
- **Mind the drawing geometry.** The turntable is drawn in container query units, and the tonearm's angles in `Turntable.tsx` are solved for that geometry. If you move the platter or the arm, re-solve them (details in `CLAUDE.md`).
- **Lint suppressions need a reason.** `react-hooks/set-state-in-effect` is only switched off, line by line with a comment, where an effect copies an outside source (SDK, browser, network) into state.

## Reporting a bug

Please include:

- what you did, what you expected, and what happened
- browser and OS, which theme, and whether it's the hosted site or a local copy
- the debug log, if you can: press **L** in the app to download it

The log stays in your browser until you download it and never contains tokens. It can include track and playlist names, so have a look before you attach it.

## Security

If you find a security problem, please don't post it in a public issue. Use **Report a vulnerability** on the repository's **Security** tab instead.

## Scope

Turntable plays music through Spotify's official Web Playback SDK and Web API. It isn't affiliated with or endorsed by Spotify. Changes that get around Spotify's DRM, download or record audio, or break Spotify's developer terms can't be accepted.

## Licence

By contributing, you agree your contributions are licensed under the project's [MIT licence](LICENSE).
